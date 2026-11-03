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

/**
 * Janela de envio: só vai para o morador o e-mail de consumo cuja referência
 * esteja dentro dos últimos SEND_WINDOW_MONTHS meses (mês corrente incluído).
 * Em novembro/2026 entram 11, 10 e 09/2026; 08/2026 e anteriores não saem.
 * Isso evita mandar extrato velho quando alguém atualiza um consumo atrasado.
 */
export const SEND_WINDOW_MONTHS = Number(process.env.EMAIL_MONTH_WINDOW || 3);

/** Mês/ano corrente no fuso de São Paulo. */
export function currentRefSP(): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  return { month, year };
}

/** true quando a referência está dentro da janela permitida (ou não existe referência). */
export function isWithinSendWindow(
  monthRef?: string | null,
  yearRef?: string | null,
  windowMonths = SEND_WINDOW_MONTHS,
): boolean {
  const month = Number(monthRef);
  const year = Number(yearRef);
  if (!month || !year || month < 1 || month > 12 || year < 2000) return true;
  const cur = currentRefSP();
  const monthsBack = (cur.year - year) * 12 + (cur.month - month);
  return monthsBack < windowMonths;
}

/** Categorias cujo conteúdo é de um mês de referência (passível de expirar). */
const REFERENCE_CATEGORIES: EmailCategory[] = ['filipeta', 'insight', 'aviso'];

export function isReferenceCategory(category?: string | null): boolean {
  return REFERENCE_CATEGORIES.includes((category || 'filipeta') as EmailCategory);
}

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

  // Nunca enfileira e-mail de consumo fora da janela (ref. antiga não vai ao morador).
  if (isReferenceCategory(category) && !isWithinSendWindow(monthRef, yearRef)) {
    return { queued: false, reason: 'fora_da_janela' };
  }

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
