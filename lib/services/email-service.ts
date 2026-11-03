import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';

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

/**
 * Contexto de auditoria: todo envio direto (fora da fila) fica registrado em
 * EmailJob com origin = 'direct', para aparecer na Saúde do Envio de E-mails.
 */
export interface EmailLogContext {
  category?: string;
  complexId?: string | null;
  apartmentId?: string | null;
  monthRef?: string | null;
  yearRef?: string | null;
  userId?: string | null;
  /** true quando quem envia é o próprio cron da fila (o job já registra o envio). */
  skipLog?: boolean;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  log?: EmailLogContext;
}

async function logEmailSend(
  params: SendEmailParams,
  result: { success: boolean; error?: string },
): Promise<void> {
  if (params.log?.skipLog) return;
  try {
    await prisma.emailJob.create({
      data: {
        toEmail: params.to,
        toName: params.toName || null,
        subject: params.subject,
        category: params.log?.category || 'outro',
        origin: 'direct',
        priority: 9,
        monthRef: params.log?.monthRef || '',
        yearRef: params.log?.yearRef || '',
        complexId: params.log?.complexId || null,
        apartmentId: params.log?.apartmentId || null,
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.success ? null : (result.error || 'Erro ao enviar'),
        sentAt: result.success ? new Date() : null,
        attempts: 1,
        createdByUserId: params.log?.userId || null,
      },
    });
  } catch (logError: any) {
    console.warn('[EmailService] Não foi possível registrar o envio:', logError?.message || logError);
  }
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, toName, subject, html, text } = params;
  if (!to || !to.includes('@')) {
    return { success: false, error: 'Destinatário de e-mail inválido.' };
  }

  let outcome: { success: boolean; messageId?: string; error?: string };
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

    outcome = { success: true, messageId: info.messageId };
  } catch (error: any) {
    const message = error?.response ? `${error.message} (${error.response})` : error?.message;
    console.error('[EmailService] Falha no envio:', message || error);
    outcome = { success: false, error: message || 'Erro ao enviar email' };
  }

  await logEmailSend(params, outcome);
  return outcome;
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
