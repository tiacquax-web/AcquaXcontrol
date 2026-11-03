/**
 * lib/services/transactional-email-templates.ts
 *
 * Renderização dos e-mails transacionais que passam pela fila (EmailJob).
 * O corpo é montado NO ENVIO (pelo cron), a partir do payload do job.
 *
 * - Boas-vindas: reaproveita o template oficial (welcome-email-template.ts)
 * - Senha redefinida: mantém o mesmo layout já usado pelo reset individual
 */

import { generateWelcomeEmail } from '@/lib/services/welcome-email-template';

const LOGIN_URL = 'https://www.acquaxcontrol.com.br';

export interface WelcomeJobPayload {
  residentName?: string | null;
  apartmentName?: string | null;
  blockName?: string | null;
  complexName?: string | null;
  email?: string | null;
  provisionalPassword?: string | null;
}

export function buildWelcomeEmail(data: WelcomeJobPayload): { subject: string; html: string; text: string } {
  return generateWelcomeEmail({
    residentName: data.residentName || 'Morador',
    apartmentName: data.apartmentName || '',
    blockName: data.blockName || '',
    complexName: data.complexName || '',
    email: data.email || '',
    provisionalPassword: data.provisionalPassword || '',
  });
}

export interface ResetPasswordJobPayload {
  residentName?: string | null;
  tempPassword: string;
}

export function buildResetPasswordEmail(data: ResetPasswordJobPayload): { subject: string; html: string; text: string } {
  const password = data.tempPassword || '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
        </div>
        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333;">Senha Redefinida</h2>
            <p style="color: #555; line-height: 1.6;">
                Ola <strong>${data.residentName || ''}</strong>,
            </p>
            <p style="color: #555; line-height: 1.6;">
                Sua senha de acesso ao sistema AcquaXcontrol foi redefinida.
            </p>
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: center;">
                <p style="color: #999; font-size: 12px; margin: 0 0 4px;">Sua nova senha temporaria:</p>
                <p style="font-size: 24px; font-weight: bold; color: #0066B3; margin: 0; letter-spacing: 2px;">${password}</p>
            </div>
            <p style="color: #555; line-height: 1.6;">
                Acesse <a href="${LOGIN_URL}" style="color: #0066B3;">www.acquaxcontrol.com.br</a> e faca login com esta senha.
                Voce sera solicitado a criar uma nova senha no primeiro acesso.
            </p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="${LOGIN_URL}" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
                Este e um email automatico do sistema AcquaXcontrol. Nao responda.<br/>
                AcquaX do Brasil - Sistema de medicao e controle
            </p>
        </div>
    </div>`;

  return {
    subject: 'Senha Redefinida - AcquaXcontrol',
    html,
    text: `Sua senha foi redefinida. Nova senha temporaria: ${password}. Acesse www.acquaxcontrol.com.br e faca login.`,
  };
}
