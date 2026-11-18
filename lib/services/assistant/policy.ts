/**
 * Política de liberação do assistente (Mariana).
 *
 * PADRÃO ATUAL: LIBERADO PARA TODOS os usuários logados, mas COM o aviso de
 * "assistente em desenvolvimento" no topo do painel (decisão da Giulia em
 * 18/11/2026). O widget aparece para morador, síndico, programador e
 * administrador — cada um vendo apenas os dados do próprio vínculo (o escopo
 * continua sendo resolvido pelas ferramentas, nunca pelo cliente).
 *
 * Variáveis:
 *  - ASSISTANT_ACESSO_RESTRITO=true: volta ao modo de teste controlado
 *    (allowlist por e-mail e/ou somente administradores).
 *  - ASSISTANT_TEST_EMAILS: lista separada por vírgula dos e-mails liberados
 *    no modo restrito.
 *  - ASSISTANT_BANNER_TEXT: texto do aviso (vale nos dois modos).
 *  - ASSISTANT_SEM_AVISO=true: esconde o aviso de desenvolvimento (acesso aberto).
 *  - ASSISTANT_BETA: 'true' mantém o aviso no modo restrito.
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

  // Liberação geral: todo usuário logado vê e usa a Mariana. O aviso de
  // desenvolvimento continua visível (a menos que ASSISTANT_SEM_AVISO=true).
  if (!acessoRestrito()) {
    const semAviso = (process.env.ASSISTANT_SEM_AVISO || '').toLowerCase() === 'true';
    return {
      enabled: true,
      beta: true,
      banner: semAviso ? null : (process.env.ASSISTANT_BANNER_TEXT || BANNER_PADRAO),
    };
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
