import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

// ✅ EXPORTAÇÃO OTIMIZADA: processa em lotes para suportar grandes volumes
const BATCH_SIZE = 500;

export const maxDuration = 60; // Aumentar timeout para 60s (Vercel Pro)

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const userId = validSession.userId;
        const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 || contexts.blockIds.length > 0 || contexts.apartmentIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', userIds = [], complexId = '', blockId = '', roleId = '' } = body;

        // ── Filtros por contexto (condomínio/bloco) ──────────────────────────────
        let filteredByComplexUserIds: string[] | null = null;
        if (complexId || blockId) {
            const blockIds: string[] = blockId ? [blockId] : (await prisma.block.findMany({
                where: { complexId, deletedAt: null }, select: { id: true }
            })).map(b => b.id);

            const aptIds = (await prisma.apartment.findMany({
                where: {
                    OR: [
                        ...(complexId ? [{ complexId, deletedAt: null }] : []),
                        ...(blockIds.length ? [{ blockId: { in: blockIds }, deletedAt: null }] : []),
                    ]
                }, select: { id: true }
            })).map(a => a.id);

            const assigns = await prisma.roleAssignment.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        ...(complexId ? [{ contextId: complexId, contextType: 'complex' as any }] : []),
                        ...(blockIds.length ? [{ contextId: { in: blockIds }, contextType: 'block' as any }] : []),
                        ...(aptIds.length ? [{ contextId: { in: aptIds }, contextType: 'apartment' as any }] : []),
                    ]
                },
                select: { userId: true }
            });
            filteredByComplexUserIds = [...new Set(assigns.map(a => a.userId))];
        }

        // ── Filtro por papel ──────────────────────────────────────────────────────
        let filteredByRoleUserIds: string[] | null = null;
        if (roleId) {
            const assigns = await prisma.roleAssignment.findMany({
                where: { roleId, deletedAt: null },
                select: { userId: true }
            });
            filteredByRoleUserIds = [...new Set(assigns.map(a => a.userId))];
        }

        // ── Cláusula WHERE ────────────────────────────────────────────────────────
        const andClauses: any[] = [{ deletedAt: null }];
        if (search) {
            andClauses.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ]
            });
        }
        if (userIds.length > 0) andClauses.push({ id: { in: userIds } });
        if (filteredByComplexUserIds !== null) andClauses.push({ id: { in: filteredByComplexUserIds } });
        if (filteredByRoleUserIds !== null) andClauses.push({ id: { in: filteredByRoleUserIds } });

        const whereClause = { AND: andClauses };

        // ── Contar total ──────────────────────────────────────────────────────────
        const totalCount = await prisma.user.count({ where: whereClause });
        if (totalCount === 0) return NextResponse.json({ error: 'Nenhum usuário encontrado' }, { status: 404 });

        // ── Buscar usuários em lotes (evita timeout/OOM) ──────────────────────────
        const allUsers: any[] = [];
        let cursor = 0;

        while (cursor < totalCount) {
            const batch = await prisma.user.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    documentPerson: true,
                    telephone: true,
                    cell: true,
                    createdAt: true,
                },
                orderBy: { name: 'asc' },
                take: BATCH_SIZE,
                skip: cursor,
            });
            allUsers.push(...batch);
            cursor += BATCH_SIZE;
            if (batch.length < BATCH_SIZE) break;
        }

        // ── Buscar papéis de todos os usuários de uma vez ─────────────────────────
        const allUserIds = allUsers.map(u => u.id);

        const allAssigns = await prisma.roleAssignment.findMany({
            where: { userId: { in: allUserIds }, deletedAt: null },
            select: { userId: true, roleId: true, contextType: true, contextId: true }
        });

        const roleIdsNeeded = [...new Set(allAssigns.map(a => a.roleId))];
        const roles = await prisma.role.findMany({
            where: { id: { in: roleIdsNeeded } },
            select: { id: true, name: true }
        });
        const roleMap: Record<string, string> = {};
        roles.forEach(r => { roleMap[r.id] = r.name; });

        // ── Buscar nome do condomínio se filtro ativo ─────────────────────────────
        let complexName = '';
        let blockName = '';
        if (complexId) {
            const cx = await prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } });
            complexName = cx?.socialName || '';
        }
        if (blockId) {
            const bk = await prisma.block.findUnique({ where: { id: blockId }, select: { name: true } });
            blockName = bk?.name || '';
        }

        // ── Montar dados de exportação ────────────────────────────────────────────
        const assignsByUser: Record<string, typeof allAssigns> = {};
        allAssigns.forEach(a => {
            if (!assignsByUser[a.userId]) assignsByUser[a.userId] = [];
            assignsByUser[a.userId].push(a);
        });

        const exportData = allUsers.map(user => {
            const assigns = assignsByUser[user.id] || [];
            const papeis = assigns.map(a => roleMap[a.roleId] || a.roleId).filter(Boolean).join(', ');
            return {
                'Nome': user.name || '',
                'Email': user.email || '',
                'Documento': user.documentPerson || '',
                'Telefone': user.telephone || '',
                'Celular': user.cell || '',
                'Papéis': papeis,
                'Data de Cadastro': user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                    : '',
            };
        });

        // ── Gerar planilha com XLSX ───────────────────────────────────────────────
        const worksheet = XLSX.utils.json_to_sheet(exportData, { cellDates: false });

        // Auto-largura de colunas (limitada para não travar)
        const colKeys = Object.keys(exportData[0] || {});
        worksheet['!cols'] = colKeys.map(k => {
            const maxLen = Math.min(
                Math.max(k.length, ...exportData.slice(0, 200).map(r => String((r as any)[k] || '').length)),
                60 // máximo de 60 chars por coluna
            );
            return { wch: maxLen + 2 };
        });

        // Adicionar linha de total no rodapé
        XLSX.utils.sheet_add_aoa(worksheet, [[`Total de usuários: ${exportData.length}`]], {
            origin: { r: exportData.length + 1, c: 0 }
        });

        const workbook = XLSX.utils.book_new();
        const sanitizeSheetName = (name: string) => name.replace(/[\\/*?:[\]]/g, '').substring(0, 31);

        let sheetName = 'Usuários';
        if (complexName) sheetName = sanitizeSheetName(`Usuários - ${complexName}`);
        if (blockName) sheetName = sanitizeSheetName(`Usuários - ${blockName}`);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // ── Gerar buffer (otimizado para grandes volumes) ─────────────────────────
        const excelBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
            compression: true, // Reduz tamanho do arquivo
        });

        // Sanitizar nome do arquivo
        const sanitizeName = (n: string) => n.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
        let fileName = 'usuarios';
        if (complexName) fileName += `_${sanitizeName(complexName)}`;
        if (blockName) fileName += `_bloco_${sanitizeName(blockName)}`;
        fileName += `_${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                'Content-Length': String(excelBuffer.length),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        });

    } catch (error: any) {
        console.error('[EXPORT USERS] Error:', error);
        return NextResponse.json({ error: 'Erro ao gerar exportação: ' + (error.message || 'Erro interno') }, { status: 500 });
    }
}
