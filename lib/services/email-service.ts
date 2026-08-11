import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

function getEmailConfig(): EmailConfig {
  const host = process.env.ZOHO_SMTP_HOST || process.env.EMAIL_HOST || 'smtp.zoho.com';
  const rawPort = process.env.ZOHO_SMTP_PORT || process.env.EMAIL_PORT || '465';
  const parsedPort = Number.parseInt(rawPort, 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
  const user = process.env.ZOHO_SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.ZOHO_SMTP_PASS || process.env.EMAIL_PASS || '';
  const fromName = process.env.ZOHO_SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'AcquaX do Brasil';
  const fromEmail = process.env.ZOHO_SMTP_FROM || process.env.EMAIL_FROM || user;

  return { host, port, user, pass, fromName, fromEmail };
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const config = getEmailConfig();
  if (!config.user || !config.pass) {
    throw new Error(
      'SMTP não configurado: defina ZOHO_SMTP_USER/ZOHO_SMTP_PASS ou EMAIL_USER/EMAIL_PASS.',
    );
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, toName, subject, html, text }: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!to || !to.includes('@')) {
    return { success: false, error: 'Destinatário de e-mail inválido.' };
  }

  try {
    const config = getEmailConfig();
    const mailTransporter = getTransporter();
    const info = await mailTransporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500),
      ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    const message = error?.response ? `${error.message} (${error.response})` : error?.message;
    console.error('[EmailService] Falha no envio:', message || error);
    return { success: false, error: message || 'Erro ao enviar email' };
  }
}

/** Retorna se há credenciais suficientes para tentar o envio. */
export function isEmailConfigured(): boolean {
  const config = getEmailConfig();
  return Boolean(config.user && config.pass && config.fromEmail);
}

/**
 * Verifica a conexão SMTP sem enviar uma mensagem. Útil para diagnósticos
 * administrativos e para diferenciar configuração ausente de credencial rejeitada.
 */
export async function verifyEmailConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'SMTP não configurado.' };
  }

  try {
    await getTransporter().verify();
    return { success: true };
  } catch (error: any) {
    const message = error?.response ? `${error.message} (${error.response})` : error?.message;
    return { success: false, error: message || 'Não foi possível verificar o SMTP.' };
  }
}

export function getEmailConfigSummary() {
  const config = getEmailConfig();
  return {
    host: config.host,
    port: String(config.port),
    user: config.user ? `${config.user.substring(0, 3)}***` : 'NOT SET',
    fromName: config.fromName,
    configured: isEmailConfigured(),
  };
}
