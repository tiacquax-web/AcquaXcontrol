/**
 * lib/services/email-service.ts
 *
 * Serviço de envio de emails via Zoho SMTP usando Nodemailer.
 *
 * Env vars necessárias (configurar na Vercel):
 *   ZOHO_SMTP_HOST     — smtp.zoho.com (padrão)
 *   ZOHO_SMTP_PORT     — 465 (SSL) ou 587 (STARTTLS)
 *   ZOHO_SMTP_USER     — email@dominio.com.br
 *   ZOHO_SMTP_PASS     — senha ou app-specific password
 *   ZOHO_SMTP_FROM_NAME — "AcquaX do Brasil" (padrão)
 *
 * APP_BASE_URL — URL base do sistema para links nas filipetas
 *   ex: https://www.acquaxcontrol.com.br
 */

import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const host = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
  const port = parseInt(process.env.ZOHO_SMTP_PORT || '465', 10);
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;

  if (!user || !pass) {
    throw new Error('ZOHO_SMTP_USER e ZOHO_SMTP_PASS devem estar configurados.');
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true para 465 (SSL), false para 587 (STARTTLS)
    auth: { user, pass },
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return _transporter;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, toName, subject, html, text }: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    const fromName = process.env.ZOHO_SMTP_FROM_NAME || 'AcquaX do Brasil';
    const fromEmail = process.env.ZOHO_SMTP_USER!;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500),
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Erro ao enviar email' };
  }
}

/**
 * Verifica se as credenciais Zoho estão configuradas.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS);
}
