import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import sendEmail from '@/lib/sendEmail';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });
        }

        const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

        if (!user) {
            // Por segurança, não revelamos se o email existe ou não
            return NextResponse.json({ message: 'Se o email estiver cadastrado, você receberá as instruções.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hora

        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetTokenExpiry },
        });

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://acquaxcontrol.com.br';
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <img src="${baseUrl}/logo-acquax.png" alt="Acqua X do Brasil" style="max-width: 200px;" />
            </div>
            <h2 style="color: #1e3a5f;">Redefinição de Senha</h2>
            <p style="font-size: 14px; color: #555;">Olá,</p>
            <p style="font-size: 14px; color: #555;">
              Recebemos uma solicitação para redefinir a senha da sua conta no AcquaX Control.
            </p>
            <p style="font-size: 14px; color: #555;">
              Clique no botão abaixo para definir uma nova senha:
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">
                Redefinir Senha
              </a>
            </div>
            <p style="font-size: 13px; color: #888;">
              Ou copie e cole este link no navegador: <br/>
              <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
            </p>
            <p style="font-size: 13px; color: #888;">
              Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este email — sua senha não será alterada.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 12px; color: #aaa; text-align: center;">
              Acqua X do Brasil — Sistema de Medição e Controle
            </p>
          </div>
        `;

        await sendEmail(email, 'Redefinição de Senha — AcquaX Control', `Redefina sua senha: ${resetUrl}`, htmlBody);

        return NextResponse.json({ message: 'Se o email estiver cadastrado, você receberá as instruções.' });
    } catch (error) {
        console.error('Error in password recovery:', error);
        return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
    }
}
