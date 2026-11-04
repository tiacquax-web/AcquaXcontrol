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
const FETCH_TIMEOUT_MS = 20000;

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
  const achado = lista.find((c: any) =>
    norm(c.socialName || '').includes(alvo) || norm(c.aliasName || '').includes(alvo));
  if (!achado) return { erro: `Não encontrei o condomínio "${nome}" nos seus acessos.`, opcoes };
  return { id: achado.id };
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
        condominios: complexes.slice(0, 40),
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
      const escopo = await exigirEscopoAdmin(args, ctx);
      if (escopo.bloqueado) return escopo.resposta ?? { erro: true, mensagem: 'Consulta bloqueada.' };

      const qs = new URLSearchParams({ month: String(mes), year: String(ano) });
      if (args.tipo) qs.set('utility_type', String(args.tipo));
      if (escopo.complexId) qs.set('complex_id', escopo.complexId);
      const data = await internalFetch(ctx, `/api/meter-report?${qs.toString()}`);
      if (data?.erro) return data;

      let list = (data.list || []).map(resumirRelatorio);
      if (args.unidade) {
        const u = norm(String(args.unidade));
        list = list.filter((l: any) => norm(l.unidade || '').includes(u));
      }
      const tarifas = (data.dealershipReadings || [])
        .map((d: any) => ({ mes: d.monthRef, ano: d.yearRef, tarifa: d.coeficiente ?? null, valor_conta_condominio: d.totalValue ?? null }))
        .filter((d: any) => d.tarifa || d.valor_conta_condominio);

      if (!list.length) {
        return {
          encontrado: false,
          mensagem: `Não há filipeta registrada para ${MONTH_LABELS[mes - 1]}/${ano}. A conta desse mês pode ainda não ter sido processada.`,
          tarifas,
        };
      }
      // Muitas unidades (visão de administrador): devolve agregado em vez de despejar tudo.
      if (list.length > 25) {
        const consumos = list.map((l: any) => l.consumo).filter((v: any) => typeof v === 'number') as number[];
        const valores = list.map((l: any) => l.valor_total).filter((v: any) => typeof v === 'number') as number[];
        const soma = (a: number[]) => Number(a.reduce((x, y) => x + y, 0).toFixed(2));
        return {
          encontrado: true,
          referencia: `${MONTH_LABELS[mes - 1]}/${ano}`,
          modo: 'agregado',
          unidades_com_filipeta: list.length,
          consumo_total: consumos.length ? soma(consumos) : null,
          consumo_medio_por_unidade: consumos.length ? Number((soma(consumos) / consumos.length).toFixed(2)) : null,
          valor_total: valores.length ? soma(valores) : null,
          maiores_consumos: list.slice().sort((a: any, b: any) => (b.consumo || 0) - (a.consumo || 0)).slice(0, 10),
          tarifas,
          observacao: 'São muitas unidades. Se precisar de uma unidade específica, informe o condomínio e a unidade.',
        };
      }

      return { encontrado: true, referencia: `${MONTH_LABELS[mes - 1]}/${ano}`, linhas: list, tarifas };
    }

    case 'meu_historico_consumo': {
      const meses = Math.min(Math.max(Number(args.meses) || 12, 1), 24);
      const tipo = args.tipo ? String(args.tipo) : undefined;
      const { mes: mesAtual, ano: anoAtual } = hojeBR();

      const alvos: Array<{ mes: number; ano: number }> = [];
      for (let i = 0; i < meses; i++) {
        const d = new Date(Date.UTC(anoAtual, mesAtual - 1 - i, 1));
        alvos.push({ mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() });
      }

      const escopo = await exigirEscopoAdmin(args, ctx);
      if (escopo.bloqueado) return escopo.resposta ?? { erro: true, mensagem: 'Consulta bloqueada.' };
      const unidadeAlvo = args.unidade ? norm(String(args.unidade)) : null;

      // Busca os meses em paralelo (a rota leva ~2s por mês; em série estouraria o tempo).
      const respostas = await Promise.all(alvos.map(async (alvo) => {
        const qs = new URLSearchParams({ month: String(alvo.mes), year: String(alvo.ano) });
        if (tipo) qs.set('utility_type', tipo);
        if (escopo.complexId) qs.set('complex_id', escopo.complexId);
        const data = await internalFetch(ctx, `/api/meter-report?${qs.toString()}`);
        return { alvo, data };
      }));

      const serie: any[] = [];
      let modoAgregado = false;
      for (const { alvo, data } of respostas) {
        if (!data || data?.erro) continue;

        let itens: any[] = data.list || [];
        if (unidadeAlvo) {
          itens = itens.filter((i: any) => norm(i.apartment?.name || '').includes(unidadeAlvo));
        }

        const tarifa = (data.dealershipReadings || [])[0]?.coeficiente ?? null;

        if (itens.length > 1) {
          // Visão de administrador: agrega o condomínio em vez de listar unidades.
          modoAgregado = true;
          const consumos = itens.map(i => i.consumption).filter((v: any) => typeof v === 'number') as number[];
          const valores = itens.map(i => i.totalUnit).filter((v: any) => typeof v === 'number') as number[];
          const soma = (a: number[]) => Number(a.reduce((x, y) => x + y, 0).toFixed(2));
          serie.push({
            referencia: `${MONTH_LABELS[alvo.mes - 1]}/${alvo.ano}`,
            mes: alvo.mes,
            ano: alvo.ano,
            unidades: itens.length,
            consumo: consumos.length ? n2(soma(consumos)) : null,
            valor_total: valores.length ? soma(valores) : null,
            tarifa,
          });
        } else {
          const item = itens[0];
          serie.push({
            referencia: `${MONTH_LABELS[alvo.mes - 1]}/${alvo.ano}`,
            mes: alvo.mes,
            ano: alvo.ano,
            consumo: item ? item.consumption ?? null : null,
            valor_total: item ? item.totalUnit ?? null : null,
            tarifa,
          });
        }
      }

      const comConsumo = serie.filter(s => typeof s.consumo === 'number');
      const media = comConsumo.length
        ? Number((comConsumo.reduce((a, s) => a + s.consumo, 0) / comConsumo.length).toFixed(2))
        : null;

      return {
        meses_consultados: serie.length,
        escopo: modoAgregado ? 'condominio (soma das unidades)' : 'unidade',
        media_consumo: media,
        serie_em_ordem_cronologica: serie.slice().reverse(),
        observacao: 'Consumo nulo significa que não há filipeta processada naquele mês.',
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
