/**
 * Política de liberação do assistente (Mariana).
 *
 * PADRÃO ATUAL: LIBERADO PARA TODOS os usuários logados (virada oficial).
 * O widget aparece para morador, síndico, programador e administrador — cada um
 * vendo apenas os dados do próprio vínculo (o escopo continua sendo resolvido
 * pelas ferramentas, nunca pelo cliente).
 *
 * Variáveis:
 *  - ASSISTANT_ACESSO_RESTRITO=true: volta ao modo de teste controlado
 *    (allowlist por e-mail e/ou somente administradores).
 *  - ASSISTANT_TEST_EMAILS: lista separada por vírgula dos e-mails liberados
 *    no modo restrito.
 *  - ASSISTANT_BETA: 'true' mantém o aviso de "em desenvolvimento" no modo restrito.
 *  - ASSISTANT_BANNER_TEXT: texto do aviso no modo restrito.
 *
 * A checagem roda no servidor (GET e POST de /api/assistant/chat), então não dá
 * para furar a liberação pela API.
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

function isBeta(): boolean {
  return (process.env.ASSISTANT_BETA || 'true').toLowerCase() !== 'false';
}

/** Só restringe o acesso se alguém pedir explicitamente (modo de teste). */
function acessoRestrito(): boolean {
  return (process.env.ASSISTANT_ACESSO_RESTRITO || '').toLowerCase() === 'true';
}

/** 'public' = liberado para todos os logados; 'test' = modo restrito. */
export function modoAssistente(): 'public' | 'test' {
  return acessoRestrito() ? 'test' : 'public';
}

/** Decide se ESTE usuário pode usar o assistente. */
export function avaliarAcesso(opts: { email?: string | null; isSystem?: boolean }): AssistantAccess {
  if (!isAssistantConfigured()) {
    return {
      enabled: false,
      beta: isBeta(),
      banner: isBeta() ? (process.env.ASSISTANT_BANNER_TEXT || BANNER_PADRAO) : null,
      motivo: 'Assistente sem chave de IA configurada.',
    };
  }

  // Liberação geral: todo usuário logado vê e usa a Mariana, sem aviso de teste.
  if (!acessoRestrito()) {
    return { enabled: true, beta: false, banner: null };
  }

  // ── Modo restrito (teste controlado) ──────────────────────────────────────
  const beta = isBeta();
  const banner = beta ? (process.env.ASSISTANT_BANNER_TEXT || BANNER_PADRAO) : null;
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
