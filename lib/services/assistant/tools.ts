/**
 * Ferramentas do assistente IA.
 *
 * PRINCÍPIO: nenhuma ferramenta fala com o Prisma direto. Todas chamam as rotas
 * internas do sistema reutilizando o cookie da sessão do próprio usuário — assim
 * o escopo (morador só vê a própria unidade, síndico vê o condomínio) e a
 * política de LGPD são exatamente os mesmos da interface.
 */

import type { GeminiToolDeclaration } from './gemini';

export interface ToolContext {
  baseUrl: string;
  cookie: string;
  userId: string;
  /** Cache curto por requisição: evita repetir my-context e a mesma filipeta. */
  cache?: Map<string, any>;
}

const MONTH_LABELS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Teto por consulta: sem isso, uma rota lenta consome o tempo inteiro da função
// (60s) e o usuário recebe um 504 sem explicação.
const FETCH_TIMEOUT_MS = 20000; // teto por consulta interna (a consulta de consumo agora leva ~200ms)

async function internalFetch(ctx: ToolContext, path: string, init?: RequestInit): Promise<any> {
  const metodo = (init?.method || 'GET').toUpperCase();
  const chave = `${metodo} ${path}`;
  if (metodo === 'GET' && ctx.cache?.has(chave)) return ctx.cache.get(chave);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ctx.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        cookie: ctx.cookie,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    return {
      erro: true,
      mensagem: e?.name === 'AbortError'
        ? 'A consulta demorou demais para responder. Tente de novo em instantes ou abra um chamado.'
        : 'Não consegui consultar o sistema agora.',
    };
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }

  if (!res.ok) {
    return { erro: true, status: res.status, mensagem: data?.error || data?.sessionError || 'Falha ao consultar o sistema' };
  }
  if (metodo === 'GET') ctx.cache?.set(chave, data);
  return data;
}

/** Aquece o contexto em paralelo com a primeira chamada ao modelo (economiza 1-6s). */
export function prefetchContexto(ctx: ToolContext): void {
  const chave = 'GET /api/auth/my-context';
  if (ctx.cache?.has(chave)) return;
  void internalFetch(ctx, '/api/auth/my-context').catch(() => {});
}

/** Contexto do usuário (morador x administrador) com cache por requisição. */
async function obterContexto(ctx: ToolContext): Promise<any> {
  return internalFetch(ctx, '/api/auth/my-context');
}

/** Período atual em America/Sao_Paulo (mês 1-12, ano). */
function hojeBR(): { mes: number; ano: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' });
  const parts = fmt.formatToParts(new Date());
  const mes = Number(parts.find(p => p.type === 'month')?.value);
  const ano = Number(parts.find(p => p.type === 'year')?.value);
  return { mes, ano: isNaN(ano) ? new Date().getFullYear() : ano, ...(isNaN(mes) ? { mes: new Date().getMonth() + 1 } : {}) };
}

/** Normaliza texto para comparação (sem acento, minúsculo). */
function norm(v: string): string {
  return (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Descobre o id do condomínio a partir do nome informado (só faz sentido para admin/síndico). */
async function resolverCondominio(
  nome: string | undefined,
  ctx: ToolContext,
): Promise<{ id?: string; erro?: string; opcoes?: string[] }> {
  const ctxData = await obterContexto(ctx);
  if (ctxData?.erro) return { erro: ctxData.mensagem };

  const lista: any[] = ctxData.complexes || [];
  const opcoes = lista.map((c: any) => c.socialName || c.aliasName).filter(Boolean).slice(0, 40);

  if (!nome) return { opcoes };

  const alvo = norm(nome);
  // Pontua o melhor casamento: exato > começa com > contém. Assim "Pop Art"
  // não perde para um "Pop Art Residence" nem para nomes parecidos.
  const pontuar = (c: any): number => {
    const nomes = [norm(c.socialName || ''), norm(c.aliasName || '')].filter(Boolean);
    let melhor = 0;
    for (const n of nomes) {
      if (n === alvo) melhor = Math.max(melhor, 100 - n.length * 0.01);
      else if (n.startsWith(alvo)) melhor = Math.max(melhor, 70 - n.length * 0.01);
      else if (n.includes(alvo)) melhor = Math.max(melhor, 40 - n.length * 0.01);
    }
    return melhor;
  };

  const ranqueados = lista
    .map((c: any) => ({ c, p: pontuar(c) }))
    .filter((x: any) => x.p > 0)
    .sort((a: any, b: any) => b.p - a.p);

  if (!ranqueados.length) {
    return { erro: `Não encontrei o condomínio "${nome}" nos seus acessos.`, opcoes };
  }
  return { id: ranqueados[0].c.id };
}

/**
 * Administrador sem condomínio informado não pode disparar a consulta: a rota
 * de relatórios devolveria TODOS os condomínios da carteira e a resposta estoura
 * o tempo da função. Nesse caso devolvemos a lista para o modelo perguntar.
 */
interface ResultadoEscopo {
  bloqueado: boolean;
  resposta?: Record<string, any>;
  complexId?: string;
}

async function exigirEscopoAdmin(
  args: Record<string, any>,
  ctx: ToolContext,
): Promise<ResultadoEscopo> {
  const ctxData = await obterContexto(ctx);
  const isSystem = Boolean(ctxData?.isSystem);
  const cond = await resolverCondominio(args.condominio ? String(args.condominio) : undefined, ctx);

  if (cond.erro) {
    return { bloqueado: true, resposta: { erro: true, mensagem: cond.erro, condominios_disponiveis: cond.opcoes } };
  }
  if (isSystem && !cond.id) {
    return {
      bloqueado: true,
      resposta: {
        precisa_condominio: true,
        mensagem: 'Este usuário é administrador. Peça o nome do condomínio (e a unidade, se for o caso) antes de consultar.',
        condominios_disponiveis: cond.opcoes,
      },
    };
  }
  return { bloqueado: false, complexId: cond.id };
}

/** Arredonda para 2 casas, evitando dízimas como 10.19999999999982. */
function n2(v: any): number | null {
  return typeof v === 'number' && isFinite(v) ? Number(v.toFixed(2)) : null;
}

/** Enum interno → rótulo que o morador entende. */
function rotuloTipo(v: any): string | null {
  if (!v) return null;
  const mapa: Record<string, string> = {
    water: 'Água', agua: 'Água', agua_esgoto: 'Água', sewage: 'Esgoto', esgoto: 'Esgoto',
    gas: 'Gás', energy: 'Energia', energia: 'Energia', electricity: 'Energia',
  };
  return mapa[String(v).toLowerCase()] || String(v);
}

function resumirRelatorio(item: any) {
  return {
    mes: item.monthRef,
    ano: item.yearRef,
    tipo: rotuloTipo(item.utilityType),
    condominio: item.apartment?.block?.complex?.socialName ?? null,
    unidade: item.apartment?.name ?? null,
    bloco: item.apartment?.block?.name ?? null,
    consumo: n2(item.consumption),
    valor_total: n2(item.totalUnit),
    parte_comum: n2(item.partial),
    leitura_atual: item.lastReading?.reading ?? null,
    leitura_anterior: item.history?.[0]?.lastReading?.reading ?? null,
    data_leitura: item.lastReading?.readingDate ?? null,
  };
}

// ─── Definições enviadas ao modelo ───────────────────────────────────────────

export const TOOL_DECLARATIONS: GeminiToolDeclaration[] = [
  {
    name: 'minha_unidade',
    description:
      'Retorna a identidade de quem está conversando: nome, e-mail, condomínio, bloco e unidade(s) vinculadas, e se é administrador/síndico. Use antes de responder qualquer pergunta sobre dados.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'minha_filipeta',
    description:
      'Busca a filipeta (relatório de consumo) de um mês específico: consumo, valor total, parte comum, leituras, e a tarifa aplicada na conta do condomínio. Use sempre que o morador perguntar sobre a conta de um mês.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mes: { type: 'NUMBER', description: 'Mês de referência, 1 a 12' },
        ano: { type: 'NUMBER', description: 'Ano de referência, ex.: 2026' },
        tipo: { type: 'STRING', description: 'Tipo de medição: Agua, Esgoto, Gas ou Energia (padrão: Agua)' },
        condominio: { type: 'STRING', description: 'Somente para administrador/síndico: nome (ou parte) do condomínio' },
        unidade: { type: 'STRING', description: 'Somente para administrador/síndico: nome da unidade, ex.: 94' },
        bloco: { type: 'STRING', description: 'Somente para administrador/síndico: bloco da unidade, ex.: 2' },
      },
      required: ['mes', 'ano'],
    },
  },
  {
    name: 'meu_historico_consumo',
    description:
      'Retorna a série de consumo dos últimos N meses da unidade do usuário (consumo, valor total e tarifa por mês). Use para análises, comparações e panorama anual.',
    parameters: {
      type: 'OBJECT',
      properties: {
        meses: { type: 'NUMBER', description: 'Quantidade de meses para trás (1 a 24). Padrão 12.' },
        tipo: { type: 'STRING', description: 'Tipo de medição: Agua, Esgoto, Gas ou Energia (padrão: Agua)' },
        condominio: { type: 'STRING', description: 'Somente para administrador/síndico: nome (ou parte) do condomínio' },
        unidade: { type: 'STRING', description: 'Somente para administrador/síndico: nome da unidade' },
        bloco: { type: 'STRING', description: 'Somente para administrador/síndico: bloco da unidade' },
      },
    },
  },
  {
    name: 'abrir_chamado',
    description:
      'Abre um chamado no suporte em nome do próprio usuário. Use quando a dúvida não puder ser resolvida pelo assistente ou o usuário pedir atendimento humano.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assunto: { type: 'STRING', description: 'Assunto curto do chamado' },
        mensagem: { type: 'STRING', description: 'Descrição detalhada do problema, com o que já foi verificado' },
      },
      required: ['assunto', 'mensagem'],
    },
  },
  {
    name: 'gerar_relatorio',
    description:
      'Gera o ARQUIVO do levantamento/filipeta e devolve dois links: um pronto para imprimir/salvar em PDF e um CSV para baixar. Use sempre que o usuário pedir relatório, arquivo, PDF, exportar, planilha ou "me manda".',
    parameters: {
      type: 'OBJECT',
      properties: {
        condominio: { type: 'STRING', description: 'Nome do condomínio' },
        mes: { type: 'NUMBER', description: 'Mês de referência, 1 a 12' },
        ano: { type: 'NUMBER', description: 'Ano de referência' },
        unidade: { type: 'STRING', description: 'Unidade (opcional)' },
        bloco: { type: 'STRING', description: 'Bloco (opcional)' },
      },
      required: ['condominio', 'mes', 'ano'],
    },
  },
  {
    name: 'unidades_sem_leitura',
    description:
      'Lista as unidades do condomínio que ainda não têm leitura/filipeta processada em um mês. Útil para síndico cobrar leitura pendente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        condominio: { type: 'STRING', description: 'Nome do condomínio' },
        mes: { type: 'NUMBER', description: 'Mês, 1 a 12' },
        ano: { type: 'NUMBER', description: 'Ano' },
      },
      required: ['condominio', 'mes', 'ano'],
    },
  },
  {
    name: 'meus_chamados',
    description: 'Lista os chamados de suporte do próprio usuário com status e última mensagem.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'alterar_meu_email',
    description:
      'Altera o e-mail de acesso do próprio usuário (somente o dele). O sistema envia as novas credenciais/aviso para o novo e-mail. Confirme com o usuário antes de chamar e nunca use e-mail de outra pessoa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        novo_email: { type: 'STRING', description: 'Novo e-mail, válido e do próprio usuário' },
      },
      required: ['novo_email'],
    },
  },
];

// ─── Execução ────────────────────────────────────────────────────────────────


/** POST JSON para as rotas internas, com o cookie da sessão do usuário. */
async function postJson(ctx: ToolContext, path: string, body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ctx.cookie },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const texto = await res.text();
    let dados: any = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { mensagem: texto.slice(0, 300) }; }
    if (!res.ok && !dados?.erro) return { erro: true, mensagem: `Consulta falhou (HTTP ${res.status}).` };
    return dados;
  } catch (e: any) {
    const abortado = e?.name === 'AbortError';
    return { erro: true, mensagem: abortado ? 'A consulta demorou demais. Tente novamente.' : 'Falha ao consultar.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function executarFerramenta(
  nome: string,
  args: Record<string, any> = {},
  ctx: ToolContext,
): Promise<Record<string, any>> {
  switch (nome) {
    case 'minha_unidade': {
      const ctxData = await obterContexto(ctx);
      if (ctxData?.erro) return ctxData;
      const apartments = (ctxData.apartments || []).map((a: any) => ({
        condominio: a.block?.complex?.socialName ?? a.complex?.socialName ?? null,
        unidade: a.name,
        bloco: a.block?.name ?? a.blockName ?? null,
        id: a.id,
      }));
      const complexes = (ctxData.complexes || []).map((c: any) => ({
        condominio: c.socialName || c.aliasName, id: c.id,
      }));
      return {
        e_sistema: Boolean(ctxData.isSystem),
        papeis: ctxData.systemRoles || [],
        unidades: apartments,
        // Só exemplos: a lista completa confundia o modelo (ele concluía "não existe"
        // quando o condomínio citado não estava entre os primeiros nomes).
        exemplos_de_condominios: complexes.slice(0, 5),
        total_condominios: complexes.length,
        observacao: ctxData.isSystem
          ? 'Este usuário é administrador/síndico: pode ver dados do condomínio.'
          : 'Este usuário é morador: vê apenas a própria unidade.',
      };
    }

    case 'minha_filipeta': {
      const mes = Number(args.mes);
      const ano = Number(args.ano);
      if (!mes || !ano || mes < 1 || mes > 12) {
        return { erro: true, mensagem: 'Informe mês (1-12) e ano (ex.: 2026).' };
      }

      const bloqueio = await exigirEscopoAdmin(args, ctx);
      if (bloqueio.bloqueado) return bloqueio.resposta ?? { erro: true, mensagem: 'Informe o condomínio.' };

      const resposta = await postJson(ctx, '/api/assistant/consumo', {
        condominio: args.condominio ? String(args.condominio) : undefined,
        unidade: args.unidade ? String(args.unidade) : undefined,
        bloco: args.bloco ? String(args.bloco) : undefined,
        tipo: args.tipo ? String(args.tipo) : undefined,
        mes,
        ano,
      });
      if (resposta?.erro) return resposta;

      const comp = (resposta.competencias || [])[0];
      if (!comp || !comp.tipos.length) {
        return {
          encontrado: false,
          condominio: resposta.condominio,
          unidade: resposta.unidade,
          mensagem: `Não há filipeta processada para ${MONTH_LABELS[mes - 1]}/${ano}. A conta desse mês pode ainda não ter sido fechada.`,
          tarifa: comp?.tarifa ?? null,
        };
      }
      return {
        encontrado: true,
        condominio: resposta.condominio,
        unidade: resposta.unidade,
        referencia: comp.referencia,
        itens: comp.tipos,
        tarifa: comp.tarifa,
        valor_conta_condominio: comp.valor_conta_condominio,
      };
    }

    case 'meu_historico_consumo': {
      const meses = Math.min(Math.max(Number(args.meses) || 12, 1), 12);

      const bloqueio = await exigirEscopoAdmin(args, ctx);
      if (bloqueio.bloqueado) return bloqueio.resposta ?? { erro: true, mensagem: 'Informe o condomínio.' };

      const resposta = await postJson(ctx, '/api/assistant/consumo', {
        condominio: args.condominio ? String(args.condominio) : undefined,
        unidade: args.unidade ? String(args.unidade) : undefined,
        bloco: args.bloco ? String(args.bloco) : undefined,
        tipo: args.tipo ? String(args.tipo) : undefined,
        meses,
      });
      if (resposta?.erro) return resposta;

      const serie = (resposta.competencias || []).map((c: any) => ({
        referencia: c.referencia,
        mes: c.mes,
        ano: c.ano,
        tipos: c.tipos,
        tarifa: c.tarifa,
      }));
      const comDados = serie.filter((s: any) => s.tipos.length > 0);
      const consumos = comDados.flatMap((s: any) =>
        s.tipos.filter((t: any) => t.tipo === 'water').map((t: any) => t.consumo),
      );
      const media = consumos.length
        ? Math.round((consumos.reduce((a: number, b: number) => a + b, 0) / consumos.length) * 100) / 100
        : null;

      return {
        condominio: resposta.condominio,
        unidade: resposta.unidade,
        meses_consultados: serie.length,
        meses_com_dados: comDados.length,
        media_consumo_agua: media,
        serie_em_ordem_cronologica: serie,
        observacao: 'Competência sem itens significa que não há filipeta processada naquele mês.',
      };
    }

    case 'abrir_chamado': {
      const assunto = String(args.assunto || '').trim();
      const mensagem = String(args.mensagem || '').trim();
      if (!assunto || !mensagem) return { erro: true, mensagem: 'Assunto e mensagem são obrigatórios.' };

      const data = await internalFetch(ctx, '/api/user/support', {
        method: 'POST',
        body: JSON.stringify({ subject: assunto.slice(0, 120), message: mensagem.slice(0, 4000) }),
      });
      if (data?.erro) return data;
      return { aberto: true, chamado_id: data?.id ?? null, assunto, aviso: 'O chamado foi registrado e a equipe responderá na aba Suporte.' };
    }

    case 'gerar_relatorio': {
      const mes = Number(args.mes);
      const ano = Number(args.ano);
      if (!mes || !ano || mes < 1 || mes > 12) {
        return { erro: true, mensagem: 'Informe mês (1-12) e ano.' };
      }
      const condominio = String(args.condominio || '').trim();
      if (!condominio) return { erro: true, mensagem: 'Informe o condomínio.' };

      // Valida antes de devolver o link, para não mandar link quebrado.
      const confere = await postJson(ctx, '/api/assistant/consumo', {
        condominio,
        unidade: args.unidade ? String(args.unidade) : undefined,
        bloco: args.bloco ? String(args.bloco) : undefined,
        mes,
        ano,
      });
      if (confere?.erro) return confere;

      const params = new URLSearchParams({
        condominio,
        mes: String(mes),
        ano: String(ano),
      });
      if (args.unidade) params.set('unidade', String(args.unidade));
      if (args.bloco) params.set('bloco', String(args.bloco));

      const base = `${ctx.baseUrl}/api/assistant/relatorio`;
      const paramsPdf = new URLSearchParams(params);
      paramsPdf.set('formato', 'html');
      const paramsCsv = new URLSearchParams(params);
      paramsCsv.set('formato', 'csv');

      return {
        pronto: true,
        condominio: confere.condominio,
        referencia: (confere.competencias || [])[0]?.referencia ?? null,
        link_para_salvar_em_pdf: `${base}?${paramsPdf.toString()}`,
        link_da_planilha_csv: `${base}?${paramsCsv.toString()}`,
        instrucao:
          'Envie os dois links ao usuário. O primeiro abre o relatório pronto (Ctrl+P salva em PDF) e o segundo baixa a planilha.',
      };
    }

    case 'unidades_sem_leitura': {
      const mes = Number(args.mes);
      const ano = Number(args.ano);
      if (!mes || !ano) return { erro: true, mensagem: 'Informe mês e ano.' };
      return postJson(ctx, '/api/assistant/consumo', {
        condominio: args.condominio ? String(args.condominio) : undefined,
        mes,
        ano,
        sem_leitura: true,
      });
    }

    case 'meus_chamados': {
      const data = await internalFetch(ctx, '/api/user/support?take=5');
      if (data?.erro) return data;
      const tickets = (data.tickets || data.data || data || []).slice(0, 5).map((t: any) => ({
        assunto: t.subject,
        status: t.status,
        complexo: t.complex?.socialName ?? null,
        aberto_em: t.createdAt,
      }));
      return { total: Array.isArray(tickets) ? tickets.length : 0, chamados: tickets };
    }

    case 'alterar_meu_email': {
      const novo = String(args.novo_email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) {
        return { erro: true, mensagem: 'E-mail inválido. Peça o e-mail correto ao usuário.' };
      }

      // Nunca aceitar id de terceiro: sempre o próprio usuário da sessão.
      const data = await internalFetch(ctx, `/api/user/users/${ctx.userId}`, {
        method: 'PUT',
        body: JSON.stringify({ email: novo }),
      });
      if (data?.erro) return data;

      return {
        alterado: true,
        novo_email: novo,
        aviso: 'O e-mail de acesso foi atualizado e o sistema enviou o aviso/credenciais para o novo endereço.',
      };
    }

    default:
      return { erro: true, mensagem: `Ferramenta desconhecida: ${nome}` };
  }
}
