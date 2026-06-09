// API: /api/user/users/[entityId]/reset — Redefinir/Restaurar acesso do usuário
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Verificar permissão de atualização de usuários
        const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 || contexts.blockIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

        const { entityId } = await params;
        const body = await req.json();
        const { newPassword, mustUpdateCredentials = true } = body;

        const targetUser = await prisma.user.findUnique({ where: { id: entityId } });
        if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

        // Proteção contra redefinição do admin principal
        if (targetUser.email === 'admin@acquax.com' && !contexts.system) {
            return NextResponse.json({ error: 'Não autorizado a redefinir este usuário' }, { status: 403 });
        }

        let updateData: any = {
            mustUpdateCredentials,  // Forçar troca de senha no próximo login
            resetToken: null,
            resetTokenExpiry: null,
            updatedByUserId: userId,
        };

        if (newPassword) {
            if (newPassword.length < 6) {
                return NextResponse.json({ error: 'A nova senha deve ter ao menos 6 caracteres' }, { status: 400 });
            }
            updateData.password = await hash(newPassword, 10);
        } else {
            // Se não foi fornecida senha, gerar uma senha temporária padrão
            const tempPassword = `Acquax@${Math.random().toString(36).slice(-6).toUpperCase()}`;
            updateData.password = await hash(tempPassword, 10);
            updateData._tempPassword = tempPassword; // retornar ao admin
        }

        const updated = await prisma.user.update({
            where: { id: entityId },
            data: updateData,
            select: { id: true, name: true, email: true, mustUpdateCredentials: true },
        });

        return NextResponse.json({
            success: true,
            user: updated,
            tempPassword: newPassword ? undefined : updateData._tempPassword,
            message: newPassword
                ? 'Senha redefinida com sucesso. O usuário deverá alterar no próximo acesso.'
                : `Acesso restaurado. Senha temporária gerada — compartilhe com segurança.`,
        });

    } catch (error: any) {
        console.error('[RESET USER] Error:', error);
        return NextResponse.json({ error: 'Erro interno ao redefinir usuário' }, { status: 500 });
    }
}
