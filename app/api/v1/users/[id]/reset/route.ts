/**
 * POST /api/v1/users/{id}/reset — Redefine o acesso (senha) de um usuário
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão: users:update
 *
 * Body (opcional): { "newPassword": "..." }
 * Sem "newPassword": gera senha temporária e força troca no próximo login.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiUsage } from '@/lib/api/apiKeyAuth';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    const start = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const endpoint = '/api/v1/users/[id]/reset';

    const auth = await authenticateApiKey(req, ['users:update']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const { id } = await params;
        const body = await req.json().catch(() => ({}));
        const { newPassword } = body || {};

        const targetUser = await prisma.user.findFirst({ where: { id, deletedAt: null } });
        if (!targetUser) {
            return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        }

        // Protege o admin principal — chaves de API nunca podem redefini-lo
        if (targetUser.email === 'admin@acquax.com') {
            return NextResponse.json({ error: 'Não autorizado a redefinir este usuário via API.' }, { status: 403 });
        }

        // Respeita o escopo da chave (condomínio): só permite resetar usuários vinculados
        // (por complexo direto ou por apartamento dentro do complexo) ao condomínio da chave.
        if (auth.apiKey!.scopeComplexId) {
            const scopedApartmentIds = (
                await prisma.apartment.findMany({ where: { complexId: auth.apiKey!.scopeComplexId }, select: { id: true } })
            ).map((a) => a.id);

            const linkedToComplex = await prisma.roleAssignment.findFirst({
                where: {
                    userId: targetUser.id,
                    OR: [
                        { contextType: 'complex', contextId: auth.apiKey!.scopeComplexId },
                        { contextType: 'apartment', contextId: { in: scopedApartmentIds } },
                    ],
                },
            });

            if (!linkedToComplex) {
                return NextResponse.json({ error: 'Usuário fora do escopo desta API Key.' }, { status: 403 });
            }
        }

        let updateData: any = {
            mustUpdateCredentials: true,
            resetToken: null,
            resetTokenExpiry: null,
        };

        let tempPassword: string | undefined;
        if (newPassword) {
            if (String(newPassword).length < 6) {
                return NextResponse.json({ error: 'A nova senha deve ter ao menos 6 caracteres.' }, { status: 400 });
            }
            updateData.password = await hash(String(newPassword), 10);
        } else {
            tempPassword = `Acquax@${Math.random().toString(36).slice(-6).toUpperCase()}`;
            updateData.password = await hash(tempPassword, 10);
        }

        const updated = await prisma.user.update({
            where: { id },
            data: updateData,
            select: { id: true, name: true, email: true, mustUpdateCredentials: true },
        });

        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'POST',
            endpoint,
            statusCode: 200,
            ipAddress: ip,
            responseTimeMs: Date.now() - start,
        });

        return NextResponse.json({
            success: true,
            user: updated,
            tempPassword,
            message: newPassword
                ? 'Senha redefinida com sucesso.'
                : 'Acesso restaurado. Senha temporária gerada — compartilhe com segurança.',
        });
    } catch (error: any) {
        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'POST',
            endpoint,
            statusCode: 500,
            ipAddress: ip,
            errorMessage: error?.message,
            responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
