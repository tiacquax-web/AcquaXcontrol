/**
 * POST /api/assistant/consumo
 *
 * Consulta rápida e AGREGADA de consumo para o assistente IA.
 *
 * POR QUÊ: a rota /api/meter-report monta o relatório completo (apartamento,
 * bloco, condomínio, leituras, fotos) de cada unidade — ótimo para a tela, mas
 * pesado demais para a IA, que estourava o tempo da função. Aqui fazemos uma
 * única consulta enxuta e devolvemos só números somados.
 *
 * ESCOPO: nunca recebe ids do cliente. O escopo sai das permissões do próprio
 * usuário (mesma regra da tela), então morador vê só a própria unidade.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function normalizar(valor: string): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quantos caracteres iniciais os dois nomes normalizados têm em comum (para sugerir). */
function prefixoComum(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Lista de referências (mês/ano) das últimas N competências, da mais antiga para a mais nova. */
function ultimasCompetencias(quantidade: number): Array<{ mes: string; ano: string }> {
  const hoje = new Date();
  const lista: Array<{ mes: string; ano: string }> = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push({ mes: String(d.getMonth() + 1).padStart(2, '0'), ano: String(d.getFullYear()) });
  }
  return lista;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const sessao = session ? await isSessionValid(session) : undefined;
    if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    const userId = sessao.userId;

    const body = await req.json().catch(() => ({}));
    const condominio: string = typeof body?.condominio === 'string' ? body.condominio : '';
    const unidade: string = typeof body?.unidade === 'string' ? body.unidade : '';
    const bloco: string = typeof body?.bloco === 'string' ? body.bloco : '';
    const tipo: string = (body?.tipo || '').toLowerCase();
    const meses = Math.min(Math.max(Number(body?.meses) || 1, 1), 12);
    const mesPedido = Number(body?.mes) || 0;
    const semLeitura = Boolean(body?.sem_leitura);
    const anoPedido = Number(body?.ano) || 0;

    // ── Escopo do usuário (mesma regra da tela) ───────────────────────────────
    const ctx = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
    const isSystem = ctx.system || ctx.companyIds.length > 0;

    const escopo: Record<string, any> = {};
    if (!isSystem) {
      if (ctx.complexIds.length) escopo.complexId = { in: ctx.complexIds };
      else if (ctx.apartmentIds.length) escopo.apartmentId = { in: ctx.apartmentIds };
      else return NextResponse.json({ erro: 'sem_permissao', mensagem: 'Você não tem acesso a relatórios de consumo.' });
    }

    // Quem é morador puro (só apartamento) só pode citar o condomínio das próprias
    // unidades: derivamos a lista a partir dos apartamentos dele.
    let complexosPermitidos = ctx.complexIds;
    if (!isSystem && !complexosPermitidos.length && ctx.apartmentIds.length) {
      const meus = await prisma.apartment.findMany({
        where: { id: { in: ctx.apartmentIds } },
        select: { block: { select: { complexId: true } }, complexId: true },
      });
      complexosPermitidos = Array.from(new Set(
        meus.map(a => a.complexId || a.block?.complexId).filter(Boolean) as string[],
      ));
    }

    // ── Condomínio: resolver por nome DENTRO do escopo do usuário ─────────────
    let complexId: string | null = null;
    let condominioNome: string | null = null;
    if (condominio) {
      const alvo = normalizar(condominio);
      const candidatos = await prisma.complex.findMany({
        where: {
          deletedAt: null,
          ...(escopo.complexId ? { id: escopo.complexId } : {}),
          ...(isSystem ? {} : { id: { in: complexosPermitidos } }),
          ...(isSystem && body?.companyId ? { companyId: body.companyId } : {}),
        },
        select: { id: true, socialName: true, aliasName: true, company: { select: { name: true } } },
        take: 600, // nomes são poucos; o casamento é feito por nome normalizado (sem acento)
      });
      const pontuar = (c: any) => {
        const nomes = [c.socialName, c.aliasName].filter(Boolean).map(normalizar);
        if (nomes.some((n: string) => n === alvo)) return 0;
        if (nomes.some((n: string) => n.startsWith(alvo))) return 1;
        if (nomes.some((n: string) => n.includes(alvo))) return 2;
        return 3;
      };
      const achados = candidatos
        .filter(c => pontuar(c) < 3)
        .sort((a, b) => pontuar(a) - pontuar(b) || String(a.socialName).length - String(b.socialName).length);
      if (!achados.length) {
        // Sem casamento: sugere os nomes mais parecidos (prefixo comum), para o modelo
        // confirmar com o usuário em vez de simplesmente dizer "não encontrei".
        const parecidos = [...candidatos]
          .sort((a, b) => prefixoComum(normalizar(a.socialName || ''), alvo)
            - prefixoComum(normalizar(b.socialName || ''), alvo))
          .reverse()
          .filter(c => prefixoComum(normalizar(c.socialName || ''), alvo) >= 3);
        return NextResponse.json({
          erro: 'condominio_nao_encontrado',
          mensagem: `Não encontrei o condomínio "${condominio}" nos seus acessos.`,
          sugestoes: parecidos.slice(0, 8).map(c => c.socialName),
          total_condominios: candidatos.length,
        });
      }
      complexId = achados[0].id;
      condominioNome = achados[0].socialName;
    } else if (escopo.complexId?.in?.length === 1) {
      complexId = escopo.complexId.in[0];
    }

    // ── Unidade (opcional) ───────────────────────────────────────────────────
    let apartmentIds: string[] | null = null;
    if (unidade) {
      const aptos = await prisma.apartment.findMany({
        where: {
          deletedAt: null,
          name: unidade.trim(),
          ...(complexId ? { complexId } : {}),
          ...(escopo.apartmentId ? { id: escopo.apartmentId } : {}),
          ...(bloco ? { block: { name: bloco.trim() } } : {}),
        },
        select: { id: true, name: true, block: { select: { name: true } } },
        take: 10,
      });
      if (!aptos.length) {
        return NextResponse.json({ erro: 'unidade_nao_encontrada', mensagem: `Não encontrei a unidade ${unidade}${condominioNome ? ` no ${condominioNome}` : ''}.` });
      }
      if (aptos.length > 1 && !bloco) {
        return NextResponse.json({
          precisa_bloco: true,
          condominio: condominioNome,
          unidade,
          blocos: aptos.map(a => a.block?.name).filter(Boolean),
          mensagem: `A unidade ${unidade} existe em mais de um bloco. Pergunte ao usuário qual bloco.`,
        });
      }
      apartmentIds = aptos.map(a => a.id);
    }

    // ── Competências consultadas ─────────────────────────────────────────────
    let competenciaAutomatica = false;
    let competencias = mesPedido && anoPedido
      ? [{ mes: String(mesPedido).padStart(2, '0'), ano: String(anoPedido) }]
      : ultimasCompetencias(meses);

    // Sem mês informado e pedindo uma competência só: usa a última que TEM dados,
    // em vez do mês corrente (que normalmente ainda não foi processado).
    if (!mesPedido && !anoPedido && meses === 1) {
      const ultimo = await prisma.apartmentConsumptionReport.findFirst({
        where: {
          deletedAt: null,
          ...(complexId ? { complexId } : {}),
          ...(apartmentIds ? { apartmentId: { in: apartmentIds } } : {}),
        },
        select: { monthRef: true, yearRef: true },
        orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
      });
      if (ultimo) {
        competencias = [{ mes: ultimo.monthRef, ano: ultimo.yearRef }];
        competenciaAutomatica = true;
      }
    }

    const where: Record<string, any> = {
      deletedAt: null,
      monthRef: { in: competencias.map(c => c.mes) },
      yearRef: { in: competencias.map(c => c.ano) },
      ...escopo,
      ...(complexId ? { complexId } : {}),
      ...(apartmentIds ? { apartmentId: { in: apartmentIds } } : {}),
      ...(tipo === 'water' || tipo === 'gas' || tipo === 'energy' ? { utilityType: tipo as any } : {}),
    };

    // Modo "unidades sem leitura": lista as unidades do condomínio sem relatório na competência.
    if (semLeitura) {
      if (!complexId || !mesPedido || !anoPedido) {
        return NextResponse.json({ erro: 'informe_mes_ano', mensagem: 'Informe o condomínio, o mês e o ano para listar as unidades sem leitura.' });
      }
      const aptos = await prisma.apartment.findMany({
        where: { deletedAt: null, complexId, ...escopo },
        select: { id: true, name: true, block: { select: { name: true } } },
      });
      const comRelatorio = await prisma.apartmentConsumptionReport.findMany({
        where: {
          deletedAt: null, complexId,
          monthRef: String(mesPedido).padStart(2, '0'), yearRef: String(anoPedido),
        },
        select: { apartmentId: true },
        distinct: ['apartmentId'],
      });
      const lidos = new Set(comRelatorio.map(r => r.apartmentId));
      const pendentes = aptos.filter(a => !lidos.has(a.id));
      return NextResponse.json({
        condominio: condominioNome,
        referencia: `${MESES[mesPedido - 1]}/${anoPedido}`,
        total_unidades: aptos.length,
        com_leitura: lidos.size,
        sem_leitura: pendentes.length,
        unidades_sem_leitura: pendentes.slice(0, 60).map(a => ({ bloco: a.block?.name || '', unidade: a.name })),
      });
    }

    const linhas = await prisma.apartmentConsumptionReport.findMany({
      where,
      select: {
        monthRef: true, yearRef: true, utilityType: true, apartmentId: true,
        consumption: true, totalUnit: true,
        consumptionGasValue: true, totalGasValue: true,
        consumptionEnergyValue: true, totalEnergyValue: true,
      },
    });

    const numero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    // ── Tarifa das contas do condomínio (por competência/tipo) ────────────────
    const contas = complexId
      ? await prisma.dealershipReading.findMany({
          where: {
            deletedAt: null,
            complexId,
            monthRef: { in: competencias.map(c => c.mes) },
            yearRef: { in: competencias.map(c => c.ano) },
          },
          select: { monthRef: true, yearRef: true, type: true, coeficiente: true, totalValue: true },
        })
      : [];
    const tarifaPorCompetencia = new Map<string, { tarifa: string | null; valorConta: number }>();
    for (const c of contas) {
      tarifaPorCompetencia.set(`${c.monthRef}/${c.yearRef}`, {
        tarifa: (c.coeficiente || '').trim() || null,
        valorConta: numero(c.totalValue),
      });
    }

    const porMesTipo = new Map<string, { consumo: number; valor: number; unidades: Set<string> }>();
    for (const l of linhas) {
      const t = (l.utilityType as string) || 'water';
      const chave = `${l.monthRef}/${l.yearRef}|${t}`;
      const atual = porMesTipo.get(chave) || { consumo: 0, valor: 0, unidades: new Set<string>() };
      if (t === 'gas') {
        atual.consumo += numero(l.consumptionGasValue);
        atual.valor += numero(l.totalGasValue);
      } else if (t === 'energy') {
        atual.consumo += numero(l.consumptionEnergyValue);
        atual.valor += numero(l.totalEnergyValue);
      } else {
        atual.consumo += numero(l.consumption);
        atual.valor += numero(l.totalUnit);
      }
      atual.unidades.add(l.apartmentId);
      porMesTipo.set(chave, atual);
    }

    const arred = (v: number) => Math.round(v * 100) / 100;
    const periodo = competencias.map(c => {
      const chave = `${c.mes}/${c.ano}`;
      const tarifa = tarifaPorCompetencia.get(chave) || { tarifa: null, valorConta: 0 };
      const tipos = ['water', 'gas', 'energy']
        .map(t => {
          const dado = porMesTipo.get(`${chave}|${t}`);
          if (!dado || dado.unidades.size === 0) return null;
          return { tipo: t, consumo: arred(dado.consumo), valor_total: arred(dado.valor), unidades: dado.unidades.size };
        })
        .filter(Boolean);
      return {
        referencia: `${MESES[Number(c.mes) - 1]}/${c.ano}`,
        mes: c.mes,
        ano: c.ano,
        tipos,
        tarifa: tarifa.tarifa,
        valor_conta_condominio: arred(tarifa.valorConta),
      };
    });

    return NextResponse.json({
      condominio: condominioNome,
      complex_id: complexId,
      apartment_ids: apartmentIds,
      competencia_automatica: competenciaAutomatica,
      unidade: unidade
        ? `${unidade}${apartmentIds && apartmentIds.length > 1 ? ' (mais de uma unidade com esse número)' : ''}`
        : null,
      bloco: bloco || null,
      competencias: periodo,
      competencias_com_dados: periodo.filter(p => p.tipos.length > 0).length,
    });
  } catch (error: any) {
    console.error('[assistant/consumo] erro:', error?.message || error);
    const debug = req.headers.get('x-mariana-debug') === '1';
    return NextResponse.json({
      erro: 'interno',
      mensagem: 'Falha ao consultar o consumo.',
      ...(debug ? { detalhe: String(error?.message || error).slice(0, 300) } : {}),
    }, { status: 500 });
  }
}
