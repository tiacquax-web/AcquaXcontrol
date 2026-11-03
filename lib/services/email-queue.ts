/**
 * lib/services/email-queue.ts
 *
 * Fila única de e-mails (EmailJob). Tudo que é envio em lote entra aqui e sai
 * pelo cron /api/cron/send-pending-emails, que respeita um ritmo "humano"
 * (intervalo aleatório entre um envio e outro).
 *
 * Categorias:
 *  - reset    → senha redefinida (prioridade 0: sai antes de tudo)
 *  - teste    → disparo de teste
 *  - welcome  → boas-vindas de onboarding em lote
 *  - aviso    → comunicações gerais
 *  - filipeta → extrato mensal do morador
 *  - insight  → resumo de gestão para síndico/administradora
 *  - outro    → demais envios
 */

import prisma from '@/lib/prisma';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';

export type EmailCategory = 'reset' | 'teste' | 'welcome' | 'aviso' | 'filipeta' | 'insight' | 'outro';

export const EMAIL_CATEGORY_PRIORITY: Record<EmailCategory, number> = {
  reset: 0,
  teste: 1,
  welcome: 2,
  aviso: 4,
  filipeta: 5,
  insight: 6,
  outro: 7,
};

export const EMAIL_CATEGORY_LABEL: Record<string, string> = {
  reset: 'Reset de senha',
  teste: 'Teste',
  welcome: 'Boas-vindas',
  aviso: 'Aviso',
  filipeta: 'Filipeta',
  insight: 'Gestão',
  outro: 'Outro',
};

export interface EnqueueEmailParams {
  to: string;
  toName?: string | null;
  subject: string;
  category: EmailCategory;
  payload?: Record<string, any> | null;
  complexId?: string | null;
  apartmentId?: string | null;
  monthRef?: string | null;
  yearRef?: string | null;
  createdByUserId?: string | null;
  /** Evita empilhar o mesmo e-mail (mesmo destinatário + assunto) já pendente. */
  dedupePending?: boolean;
}

/**
 * Coloca um e-mail na fila. Retorna { queued: false } quando o destinatário é
 * de domínio interno (bloqueado por design) ou quando já existe um job pendente
 * idêntico com dedupePending ligado.
 */
export async function enqueueEmail(params: EnqueueEmailParams): Promise<{ queued: boolean; reason?: string; id?: string }> {
  const {
    to, toName, subject, category, payload = null,
    complexId = null, apartmentId = null, monthRef = '', yearRef = '',
    createdByUserId = null, dedupePending = false,
  } = params;

  if (!to || !to.includes('@')) return { queued: false, reason: 'email_invalido' };
  if (isBlockedEmailDomain(to)) return { queued: false, reason: 'dominio_interno' };

  if (dedupePending) {
    const existing = await prisma.emailJob.findFirst({
      where: { toEmail: to, subject, status: 'pending' },
      select: { id: true },
    });
    if (existing) return { queued: false, reason: 'ja_na_fila', id: existing.id };
  }

  const job = await prisma.emailJob.create({
    data: {
      toEmail: to,
      toName: toName || null,
      subject,
      category,
      origin: 'queue',
      priority: EMAIL_CATEGORY_PRIORITY[category] ?? 5,
      payload: payload as any,
      monthRef: monthRef || '',
      yearRef: yearRef || '',
      complexId,
      apartmentId,
      status: 'pending',
      createdByUserId,
    },
    select: { id: true },
  });

  return { queued: true, id: job.id };
}
