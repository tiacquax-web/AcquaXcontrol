import { sendEmail as sendEmailService } from '@/lib/services/email-service';

/**
 * Compatibilidade com a assinatura antiga usada pelo fluxo de recuperação de senha.
 * Todos os novos envios devem preferir o serviço nomeado em services/email-service.
 */
export default async function sendEmail(to: string, subject: string, text: string, html?: string) {
  return sendEmailService({
    to,
    subject,
    text,
    html: html || `<p>${text}</p>`,
  });
}
