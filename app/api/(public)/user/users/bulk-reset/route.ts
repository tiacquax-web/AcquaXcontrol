// API: POST /api/user/users/bulk-reset
// Redefine credenciais de TODOS os usuários que correspondem aos filtros informados.
// Não usa paginação — opera sobre o universo completo do filtro.
//
// Body: {
//   complexId?:    string   — filtra por condomínio (e todos os blocos/aptos dele)
//   blockId?:      string   — filtra por bloco específico
//   apartmentId?:  string   — filtra por apartamento específico
//   roleId?:       string   — filtra por papel
//   search?:       string   — busca por nome/email/documento
//   userIds?:      string[] — seleção manual (se presente e não vazio, ignora os demais filtros)
// }
//
// Resposta: { success, successCount, errorCount, total, errors[] }

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { ContextType } from '@prisma/client';

const BATCH_SIZE = 50; // resetar em lotes para não sobrecarregar o banco

// Charset sem caracteres ambíguos (0/O, 1/l/I) — facilita leitura pelo morador
const RESET_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const RESET_UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RESET_LOWER   = 'abcdefghjkmnpqrstuvwxyz';
const RESET_DIGITS  = '23456789';

/** Gera uma senha aleatória de 10 caracteres com pelo menos 1 maiúscula, 1 minúscula e 1 dígito */
const generateResetPassword = (): string => {
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
    const mandatory = [pick(RESET_UPPER), pick(RESET_LOWER), pick(RESET_DIGITS)];
    const rest = Array.from({ length: 7 }, () => pick(RESET_CHARSET));
    return [...mandatory, ...rest].sort(() => Math.random() - 0.5).join('');
};

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // ── Autenticação ───────────────────────────────────────────────────────────
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // ── Verificar permissão de atualização de usuários ─────────────────────────
        const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
        const hasPermission =
            contexts.system ||
            contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 ||
            contexts.blockIds.length > 0 ||
            contexts.apartmentIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

        // ── Parsear body ───────────────────────────────────────────────────────────
        const body = await req.json();
        const {
            complexId = '',
            blockId = '',
            apartmentId = '',
            roleId = '',
            search = '',
            userIds = [],  // seleção manual — se não vazio, ignora demais filtros
        }: {
            complexId?: string;
            blockId?: string;
            apartmentId?: string;
            roleId?: string;
            search?: string;
            userIds?: string[];
        } = body;

        // ── Resolver IDs alvo ──────────────────────────────────────────────────────
        let targetUserIds: string[];

        if (userIds.length > 0) {
            // PRIORIDADE 1: seleção manual explícita
            targetUserIds = userIds;
        } else {
            // PRIORIDADE 2/3: resolver via filtros (sem paginação)
            let filteredByContext: string[] | null = null;

            if (apartmentId) {
                // Filtro exato por apartamento
                const assigns = await prisma.roleAssignment.findMany({
                    where: {
                        deletedAt: null,
                        contextId: apartmentId,
                        contextType: ContextType.apartment,
                    },
                    select: { userId: true },
                });
                filteredByContext = [...new Set(assigns.map(a => a.userId))];
            } else if (complexId || blockId) {
                // Resolver cadeia hierárquica: complex → blocks → apartments
                const resolvedBlockIds: string[] = blockId
                    ? [blockId]
                    : (await prisma.block.findMany({
                        where: { complexId, deletedAt: null },
                        select: { id: true },
                      })).map(b => b.id);

                const aptIds = (await prisma.apartment.findMany({
                    where: {
                        OR: [
                            ...(complexId ? [{ complexId, deletedAt: null }] : []),
                            ...(resolvedBlockIds.length
                                ? [{ blockId: { in: resolvedBlockIds }, deletedAt: null }]
                                : []),
                        ],
                    },
                    select: { id: true },
                })).map(a => a.id);

                const assigns = await prisma.roleAssignment.findMany({
                    where: {
                        deletedAt: null,
                        OR: [
                            ...(complexId
                                ? [{ contextId: complexId, contextType: ContextType.complex }]
                                : []),
                            ...(resolvedBlockIds.length
                                ? [{ contextId: { in: resolvedBlockIds }, contextType: ContextType.block }]
                                : []),
                            ...(aptIds.length
                                ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }]
                                : []),
                        ],
                    },
                    select: { userId: true },
                });
                filteredByContext = [...new Set(assigns.map(a => a.userId))];
            }

            let filteredByRole: string[] | null = null;
            if (roleId) {
                const assigns = await prisma.roleAssignment.findMany({
                    where: { roleId, deletedAt: null },
                    select: { userId: true },
                });
                filteredByRole = [...new Set(assigns.map(a => a.userId))];
            }

            // Construir cláusula WHERE sem paginação
            const andClauses: any[] = [
                { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            ];

            if (search) {
                andClauses.push({
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { documentPerson: { contains: search, mode: 'insensitive' } },
                    ],
                });
            }

            if (filteredByContext !== null) {
                andClauses.push({ id: { in: filteredByContext } });
            }

            if (filteredByRole !== null) {
                andClauses.push({ id: { in: filteredByRole } });
            }

            // Buscar TODOS os IDs que correspondem aos filtros (sem take/skip)
            const matchingUsers = await prisma.user.findMany({
                where: { AND: andClauses },
                select: { id: true, email: true },
            });

            // Nunca resetar o admin principal se não for system
            targetUserIds = matchingUsers
                .filter(u => contexts.system || u.email !== 'admin@acquax.com')
                .map(u => u.id);
        }

        if (targetUserIds.length === 0) {
            return NextResponse.json({
                success: true,
                successCount: 0,
                errorCount: 0,
                total: 0,
                credentials: [],
                message: 'Nenhum usuário encontrado para os filtros informados.',
            });
        }

        // ── Buscar dados dos usuários ANTES do reset (para montar a planilha) ─────
        // prisma.user.update (individual) retorna o registro, mas buscamos nome/email
        // antes para não depender do retorno do update em cada lote.
        const usersToReset = await prisma.user.findMany({
            where: { id: { in: targetUserIds } },
            select: { id: true, name: true, email: true },
        });
        const userDataMap = new Map<string, { id: string; name: string | null; email: string | null }>(
            usersToReset.map(u => [u.id, u as { id: string; name: string | null; email: string | null }])
        );

        // ── Pré-gerar senhas individuais em memória ───────────────────────────────
        // Cada usuário recebe uma senha única e aleatória.
        // plainPassword existe SOMENTE em memória durante esta requisição — nunca salvo no banco.
        const passwordMap = new Map<string, string>(
            targetUserIds.map(id => [id, generateResetPassword()])
        );

        // ── Resetar em lotes — hash e update individual por usuário ───────────────
        // updateMany não permite senhas diferentes por registro, então usamos
        // Promise.allSettled dentro de lotes de BATCH_SIZE para paralelizar
        // os hashes bcrypt (≈100 ms cada) sem sobrecarregar memória/CPU.
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];
        const credentials: { name: string; email: string; password: string }[] = [];

        for (let i = 0; i < targetUserIds.length; i += BATCH_SIZE) {
            const batch = targetUserIds.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(async (uid) => {
                    const plain = passwordMap.get(uid)!;
                    const hashed = await hash(plain, 10);
                    await prisma.user.update({
                        where: { id: uid },
                        data: {
                            mustUpdateCredentials: true,
                            resetToken: null,
                            resetTokenExpiry: null,
                            password: hashed,
                            updatedByUserId: userId,
                        },
                    });
                    return uid;
                })
            );

            results.forEach((result, idx) => {
                const uid = batch[idx];
                if (result.status === 'fulfilled') {
                    successCount++;
                    const u = userDataMap.get(uid);
                    credentials.push({
                        name:     u?.name  ?? '',
                        email:    u?.email ?? '',
                        password: passwordMap.get(uid)!,
                    });
                } else {
                    errorCount++;
                    console.error(`[BULK-RESET] Erro no usuário ${uid}:`, result.reason);
                    errors.push(`Usuário ${uid}: ${result.reason?.message ?? 'erro desconhecido'}`);
                }
            });
        }

        return NextResponse.json({
            success: errorCount === 0,
            successCount,
            errorCount,
            total: targetUserIds.length,
            credentials,  // plaintext apenas nesta resposta — nunca salvo no banco
            ...(errors.length > 0 ? { errors } : {}),
            message:
                errorCount === 0
                    ? `${successCount} usuário(s) marcado(s) para atualizar senha no próximo login.`
                    : `${successCount} redefinido(s) com sucesso, ${errorCount} com erro.`,
        });

    } catch (error: any) {
        console.error('[BULK-RESET] Error:', error);
        return NextResponse.json(
            { error: 'Erro interno ao executar redefinição em massa' },
            { status: 500 }
        );
    }
}
