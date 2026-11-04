/**
 * Política de liberação do assistente.
 *
 * Enquanto estiver em desenvolvimento, o assistente só aparece para quem está
 * autorizado — o resto dos usuários nem vê o botão (não é só uma tarja de aviso).
 *
 * Variáveis:
 *  - ASSISTANT_TEST_EMAILS: lista separada por vírgula dos e-mails liberados para teste.
 *  - ASSISTANT_BETA: 'false' libera para todos os usuários logados (virada oficial).
 *  - Sem ASSISTANT_TEST_EMAILS e sem ASSISTANT_BETA=false: somente administradores de sistema.
 */

import { isAssistantConfigured } from './gemini';

export interface AssistantAccess {
  enabled: boolean;
  beta: boolean;
  banner: string | null;
  motivo?: string;
}

export const BANNER_PADRAO =
  'Assistente em desenvolvimento. Confirme informações cruciais (valores, consumo e tarifa) com uma pessoa da equipe.';

function allowlist(): string[] {
  return (process.env.ASSISTANT_TEST_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBeta(): boolean {
  return (process.env.ASSISTANT_BETA || 'true').toLowerCase() !== 'false';
}

/** Decide se ESTE usuário pode usar o assistente. */
export function avaliarAcesso(opts: { email?: string | null; isSystem?: boolean }): AssistantAccess {
  const beta = isBeta();
  const banner = beta ? (process.env.ASSISTANT_BANNER_TEXT || BANNER_PADRAO) : null;

  if (!isAssistantConfigured()) {
    return { enabled: false, beta, banner, motivo: 'Assistente sem chave de IA configurada.' };
  }

  const lista = allowlist();
  const email = (opts.email || '').toLowerCase();

  if (lista.length > 0) {
    const liberado = Boolean(email) && lista.includes(email);
    return {
      enabled: liberado,
      beta,
      banner,
      motivo: liberado ? undefined : 'Assistente em testes: acesso restrito a convidados.',
    };
  }

  // Sem lista de convidados: em beta, somente administradores de sistema.
  if (beta) {
    const liberado = Boolean(opts.isSystem);
    return {
      enabled: liberado,
      beta,
      banner,
      motivo: liberado ? undefined : 'Assistente em testes: acesso liberado para administradores.',
    };
  }

  return { enabled: true, beta, banner };
}
