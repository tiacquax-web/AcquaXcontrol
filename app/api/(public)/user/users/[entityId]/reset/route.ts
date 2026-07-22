// API: /api/user/users/[entityId]/reset — Redefinir/Restaurar acesso do usuário
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';

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

        // Enviar email com a senha temporária (se senha foi gerada automaticamente)
        let emailSent = false;
        let emailError: string | null = null;

        if (!newPassword && targetUser.email && !isBlockedEmailDomain(targetUser.email) && isEmailConfigured()) {
            const plainPwd = updateData._tempPassword;
            try {
                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
                            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
                        </div>
                        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                            <h2 style="color: #333;">Senha Redefinida</h2>
                            <p style="color: #555; line-height: 1.6;">
                                Ol&aacute; <strong>${targetUser.name || ''}</strong>,
                            </p>
                            <p style="color: #555; line-height: 1.6;">
                                Sua senha de acesso ao sistema AcquaXcontrol foi redefinida.
                            </p>
                            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: center;">
                                <p style="color: #999; font-size: 12px; margin: 0 0 4px;">Sua nova senha temporaria:</p>
                                <p style="font-size: 24px; font-weight: bold; color: #0066B3; margin: 0; letter-spacing: 2px;">${plainPwd}</p>
                            </div>
                            <p style="color: #555; line-height: 1.6;">
                                Acesse <a href="https://www.acquaxcontrol.com.br" style="color: #0066B3;">www.acquaxcontrol.com.br</a> e fa&ccedil;a login com esta senha.
                                Voc&ecirc; ser&aacute; solicitado a criar uma nova senha no primeiro acesso.
                            </p>
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                            <p style="color: #999; font-size: 12px;">
                                Este e um email automatico do sistema AcquaXcontrol. Nao responda.
                            </p>
                        </div>
                    </div>
                `;
                const result = await sendEmail({
                    to: targetUser.email,
                    toName: targetUser.name || undefined,
                    subject: 'Senha Redefinida - AcquaXcontrol',
                    html,
                    text: `Sua senha foi redefinida. Nova senha temporaria: ${plainPwd}. Acesse www.acquaxcontrol.com.br e faca login.`,
                });
                emailSent = result.success;
                if (!result.success) emailError = result.error || 'Falha no envio';
            } catch (err: any) {
                emailError = err?.message || 'Erro ao enviar email';
            }
        }

        return NextResponse.json({
            success: true,
            user: updated,
            tempPassword: newPassword ? undefined : updateData._tempPassword,
            emailSent,
            emailError,
            message: newPassword
                ? 'Senha redefinida com sucesso. O usuário deverá alterar no próximo acesso.'
                : emailSent
                    ? 'Acesso restaurado e senha enviada por email para o usuário.'
                    : `Acesso restaurado. Senha temporária gerada${emailError ? ' (email não enviado: ' + emailError + ')' : ' — compartilhe com segurança.'}`,
        });

    } catch (error: any) {
        console.error('[RESET USER] Error:', error);
        return NextResponse.json({ error: 'Erro interno ao redefinir usuário' }, { status: 500 });
    }
}
