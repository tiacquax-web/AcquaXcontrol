/**
 * GET /api/assistant/relatorio
 *
 * Gera o arquivo do levantamento/filipeta para a Mariana (assistente).
 * formato=csv  → planilha para baixar
 * formato=html → página pronta para imprimir / salvar em PDF
 *
 * Escopo: o mesmo do usuário logado (nunca recebe permissionamento do cliente).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function normalizar(v: string): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function num(v: any): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function arred(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Consumo/valor conforme o tipo (mesma regra do resto do sistema). */
function valores(item: any): { consumo: number; valor: number } {
  const t = String(item.utilityType || 'water');
  if (t === 'gas') return { consumo: num(item.consumptionGasValue), valor: num(item.totalGasValue) };
  if (t === 'energy') return { consumo: num(item.consumptionEnergyValue), valor: num(item.totalEnergyValue) };
  return { consumo: num(item.consumption), valor: num(item.totalUnit) };
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = req.cookies.get('session')?.value;
  const sessao = session ? await isSessionValid(session) : undefined;
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  const userId = sessao.userId;

  const p = req.nextUrl.searchParams;
  const condominio = (p.get('condominio') || '').trim();
  const unidade = (p.get('unidade') || '').trim();
  const bloco = (p.get('bloco') || '').trim();
  const formato = (p.get('formato') || 'html').toLowerCase();
  const mes = String(Number(p.get('mes')) || 0).padStart(2, '0');
  const ano = String(Number(p.get('ano')) || 0);

  if (!condominio || mes === '00' || ano === '0') {
    return NextResponse.json({ erro: 'Informe condomínio, mês e ano.' }, { status: 400 });
  }

  // ── Escopo ────────────────────────────────────────────────────────────────
  const ctx = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
  const isSystem = ctx.system || ctx.companyIds.length > 0;
  const escopoComplexo = !isSystem && ctx.complexIds.length ? { id: { in: ctx.complexIds } } : {};
  const escopoApartamento = !isSystem && !ctx.complexIds.length ? { id: { in: ctx.apartmentIds } } : {};

  // Morador puro: só pode resolver o condomínio das próprias unidades.
  let idsPermitidos: string[] | undefined;
  if (!isSystem) {
    idsPermitidos = ctx.complexIds.length ? ctx.complexIds : undefined;
    if (!idsPermitidos && ctx.apartmentIds.length) {
      const meus = await prisma.apartment.findMany({
        where: { id: { in: ctx.apartmentIds } },
        select: { complexId: true, block: { select: { complexId: true } } },
      });
      idsPermitidos = Array.from(new Set(
        meus.map(a => a.complexId || a.block?.complexId).filter(Boolean) as string[],
      ));
    }
  }

  const todos = await prisma.complex.findMany({
    where: {
      deletedAt: null,
      ...escopoComplexo,
      ...(idsPermitidos ? { id: { in: idsPermitidos } } : {}),
    },
    select: { id: true, socialName: true, aliasName: true },
    take: 600,
  });
  const alvo = normalizar(condominio);
  const pontos = (c: any) => {
    const nomes = [c.socialName, c.aliasName].filter(Boolean).map(normalizar);
    if (nomes.some((n: string) => n === alvo)) return 3;
    if (nomes.some((n: string) => n.startsWith(alvo))) return 2;
    if (nomes.some((n: string) => n.includes(alvo))) return 1;
    return 0;
  };
  const achado = todos.map(c => ({ c, p: pontos(c) })).filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p)[0];
  if (!achado) return NextResponse.json({ erro: 'condominio_nao_encontrado', mensagem: `Condomínio "${condominio}" não encontrado.` }, { status: 404 });

  const complexId = achado.c.id;
  const condominioNome = achado.c.socialName;

  // ── Unidade(s) ────────────────────────────────────────────────────────────
  let apartmentIds: string[] | undefined;
  if (unidade) {
    const numeroUnidade = unidade.replace(/[^0-9A-Za-z]/g, '');
    const candidatas = await prisma.apartment.findMany({
      where: { deletedAt: null, complexId, ...(escopoApartamento.id ? escopoApartamento : {}) },
      select: { id: true, name: true, block: { select: { name: true } } },
    });
    const filtradas = candidatas.filter(a => {
      const nome = String(a.name || '').replace(/[^0-9A-Za-z]/g, '');
      const casaUnidade = nome === numeroUnidade || (numeroUnidade.length >= 2 && nome.includes(numeroUnidade));
      const casaBloco = !bloco || normalizar(String(a.block?.name || '')) === normalizar(bloco);
      return casaUnidade && casaBloco;
    });
    if (!filtradas.length) {
      return NextResponse.json({ erro: 'unidade_nao_encontrada', mensagem: `Unidade ${unidade} não encontrada.` }, { status: 404 });
    }
    apartmentIds = filtradas.map(a => a.id);
  }

  // ── Dados ─────────────────────────────────────────────────────────────────
  const where: Record<string, any> = {
    deletedAt: null, complexId, monthRef: mes, yearRef: ano,
    ...(apartmentIds ? { apartmentId: { in: apartmentIds } } : {}),
  };
  if (!isSystem && escopoApartamento.id && !apartmentIds) where.apartmentId = escopoApartamento.id;

  const linhas = await prisma.apartmentConsumptionReport.findMany({
    where,
    select: {
      monthRef: true, yearRef: true, utilityType: true,
      consumption: true, totalUnit: true,
      consumptionGasValue: true, totalGasValue: true,
      consumptionEnergyValue: true, totalEnergyValue: true,
      apartment: { select: { name: true, block: { select: { name: true } } } },
    },
    orderBy: [{ apartment: { block: { name: 'asc' } } }, { apartment: { name: 'asc' } }],
    take: 2000,
  });

  const conta = await prisma.dealershipReading.findFirst({
    where: { deletedAt: null, complexId, monthRef: mes, yearRef: ano },
    select: { coeficiente: true, totalValue: true },
  });

  const tipoLabel: Record<string, string> = { water: 'Água', gas: 'Gás', energy: 'Energia' };
  const registros = linhas.map(l => {
    const { consumo, valor } = valores(l);
    return {
      bloco: l.apartment?.block?.name || '',
      unidade: l.apartment?.name || '',
      tipo: tipoLabel[String(l.utilityType || 'water')] || String(l.utilityType || ''),
      consumo: arred(consumo),
      valor: arred(valor),
    };
  });

  const totalConsumo = arred(registros.reduce((a, r) => a + r.consumo, 0));
  const totalValor = arred(registros.reduce((a, r) => a + r.valor, 0));
  const referencia = `${MESES[Number(mes) - 1]}/${ano}`;
  const tarifa = (conta?.coeficiente || '').trim() || 'não informada';
  const titulo = `Levantamento — ${condominioNome}${unidade ? ` — Unidade ${unidade}${bloco ? ' bl. ' + bloco : ''}` : ''} — ${referencia}`;

  if (formato === 'csv') {
    const cab = ['Bloco', 'Unidade', 'Tipo', 'Consumo', 'Valor (R$)'];
    const corpo = registros.map(r => [r.bloco, r.unidade, r.tipo, String(r.consumo).replace('.', ','), String(r.valor).replace('.', ',')]);
    corpo.push(['', '', 'TOTAL', String(totalConsumo).replace('.', ','), String(totalValor).replace('.', ',')]);
    const csv = '\uFEFF' + [cab, ...corpo].map(l => l.join(';')).join('\r\n');
    const nomeArquivo = `levantamento-${normalizar(condominioNome).replace(/ /g, '-')}-${mes}-${ano}${unidade ? '-' + unidade : ''}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const linhasHtml = registros.map(r => `
      <tr><td>${r.bloco}</td><td>${r.unidade}</td><td>${r.tipo}</td>
      <td class="n">${r.consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="n">R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #0d9488; color: #fff; font-size: 11px; text-transform: uppercase; }
  td.n { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; border-top: 2px solid #0d9488; }
  .aviso { margin-top: 16px; font-size: 11px; color: #777; }
  @media print { @page { size: A4 landscape; margin: 10mm } .noprint { display: none } }
</style></head><body>
  <h1>${titulo}</h1>
  <div class="sub">Tarifa da conta: ${tarifa} · Gerado em ${new Date().toLocaleString('pt-BR')} · Mariana, assistente AcquaX</div>
  <table>
    <thead><tr><th>Bloco</th><th>Unidade</th><th>Tipo</th><th>Consumo</th><th>Valor</th></tr></thead>
    <tbody>${linhasHtml || '<tr><td colspan="5">Sem leituras processadas nesta competência.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">TOTAL (${registros.length} registros)</td>
      <td class="n">${totalConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="n">R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr></tfoot>
  </table>
  <p class="aviso">Documento gerado automaticamente. Confirme os valores com a equipe antes de decisões.</p>
  <p class="noprint" style="margin-top:16px;font-size:12px;color:#0d9488">Use Ctrl+P (Cmd+P) para salvar em PDF.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
