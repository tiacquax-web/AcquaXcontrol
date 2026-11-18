/**
 * app/api/maintenance/filipeta/route.ts
 *
 * Rota de manutenção (token) para CONFERIR o extrato individual (Filipeta) sem
 * enviar nada. Monta o mesmo payload usado pelo cron send-pending-emails e
 * devolve os números + o HTML renderizado.
 *
 * POST /api/maintenance/filipeta?token=...
 * { action: 'preview', complexName|complexId, month, year, utility, unit }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { buildFilipetaData, currentConsumptionOf, filipetaReportKey, previousMonthOf } from '@/lib/services/filipeta-context';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOKEN = 'acqua-control-mnt-2026-11-18';
const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as any;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (token !== TOKEN) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json().catch(() => ({} as any));
    const action = String((body as any).action || 'preview');

    const monthRef = String(Number((body as any).month)).padStart(2, '0');
    const yearRef = String(Number((body as any).year));
    if (!(body as any).month || !(body as any).year) {
      return NextResponse.json({ error: 'Informe month e year' }, { status: 400 });
    }
    const utility = String((body as any).utility || 'water').toLowerCase();

    let complexId = (body as any).complexId ? String((body as any).complexId) : null;
    if (!complexId) {
      const nome = String((body as any).complexName || '').trim();
      const complex = await prisma.complex.findFirst({
        where: { socialName: { contains: nome, mode: 'insensitive' } } as any,
        select: { id: true, socialName: true } as any,
      } as any) as any;
      if (!complex) return NextResponse.json({ error: `Condomínio não encontrado: ${nome}` }, { status: 404 });
      complexId = complex.id;
    }
    const complex: any = await prisma.complex.findFirst({ where: { id: complexId } as any, select: { id: true, socialName: true } as any } as any);

    const unitName = String((body as any).unit || '').trim();
    const apartments: any[] = (await prisma.apartment.findMany({
      where: { complexId, ...(unitName ? { name: unitName } : {}), ...NOT_DELETED } as any,
      select: { id: true, name: true, block: { select: { name: true } } } as any,
      orderBy: { name: 'asc' } as any,
      take: unitName ? 5 : 2,
    } as any)) as any[];
    if (apartments.length === 0) return NextResponse.json({ error: `Unidade não encontrada: ${unitName}` }, { status: 404 });

    const previousRef = previousMonthOf(monthRef, yearRef);
    const out: any[] = [];

    for (const apt of apartments) {
      const report: any = await prisma.apartmentConsumptionReport.findFirst({
        where: { apartmentId: apt.id, monthRef, yearRef, utilityType: utility as any, ...NOT_DELETED } as any,
        include: { lastReading: { select: { reading: true, readAtDate: true, nextReadingDate: true, readAt: true } } },
      } as any) as any;
      if (!report) {
        out.push({ unidade: apt.name, erro: `Sem relatório de ${utility} em ${monthRef}/${yearRef}` });
        continue;
      }
      const dealership: any = report.dealershipReadingId
        ? await prisma.dealershipReading.findFirst({ where: { id: report.dealershipReadingId } as any } as any)
        : null;
      const previousReport: any = await prisma.apartmentConsumptionReport.findFirst({
        where: {
          apartmentId: apt.id,
          monthRef: previousRef.monthRef,
          yearRef: previousRef.yearRef,
          ...(utility ? { utilityType: utility as any } : {}),
          ...NOT_DELETED,
        } as any,
        include: { lastReading: { select: { reading: true, readAtDate: true } } },
      } as any) as any;
      const unitsCount = report.dealershipReadingId
        ? Number(await prisma.apartmentConsumptionReport.count({ where: { dealershipReadingId: report.dealershipReadingId, ...NOT_DELETED } as any } as any))
        : null;

      let analysis: any = undefined;
      try {
        analysis = await getConsumptionAnalysis(apt.id, report.id, currentConsumptionOf(report), utility || null);
      } catch { /* análise é opcional */ }

      const data = buildFilipetaData({
        residentName: (body as any).residentName || 'Morador',
        apartmentName: apt.name,
        blockName: apt.block?.name || '',
        complexName: complex?.socialName || '',
        monthRef,
        yearRef,
        report,
        dealership,
        previousReport,
        unitsCount,
        analysis,
        isErrata: !!(body as any).errata,
      });
      const rendered = generateFilipetaEmail(data);

      out.push({
        unidade: apt.name,
        dados: {
          consumoIndividual: data.totalConsumption,
          indiceInicial: data.initialReading,
          indiceFinal: data.finalReading,
          valorConsumido: data.consumptionCost,
          valorTotal: data.totalUnit,
          consumoCondominio: data.condominiumConsumption,
          valorConta: data.condominiumBillValue,
          consumoPorEconomia: data.consumptionPerEconomy,
          periodo: `${data.periodStart || '—'} a ${data.periodEnd || '—'}`,
          proximaLeitura: data.nextReadingDate,
          utilidade: data.utilityType,
          unidadesNaConta: unitsCount,
          relatorioAnterior: previousReport
            ? { ref: filipetaReportKey(apt.id, previousRef.monthRef, previousRef.yearRef, previousReport.utilityType), leitura: previousReport?.lastReading?.reading ?? null }
            : null,
          analise: analysis ? { mesAnterior: analysis.previousConsumption, media: analysis.avg6Months, variacao: analysis.vsPreviousPct, tendencia: analysis.trend } : null,
        },
        assunto: rendered.subject,
        html: (body as any).html === false ? undefined : rendered.html,
        texto: rendered.text,
      });
    }

    return NextResponse.json({ acao: action, competencia: `${monthRef}/${yearRef}`, utilidade: utility, unidades: out });
  } catch (error: any) {
    console.error('[maintenance/filipeta]', error);
    return NextResponse.json({ error: 'Erro', detail: error?.message }, { status: 500 });
  }
}
