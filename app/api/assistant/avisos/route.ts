/**
 * GET /api/assistant/avisos — o que a Mariana fala primeiro.
 *
 * Só aparece o que o usuário PODE ver: morador recebe avisos da própria unidade,
 * síndico/administrador recebem pendências dos condomínios do seu escopo.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';
export const maxDuration = 20;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const numero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function GET(req: NextRequest): Promise<Response> {
  const session = req.cookies.get('session')?.value;
  const sessao = session ? await isSessionValid(session) : undefined;
  if (!sessao) return NextResponse.json({ avisos: [] });

  const userId = sessao.userId;
  const ctx = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
  const isSystem = ctx.system || ctx.companyIds.length > 0;
  const avisos: any[] = [];

  try {
    // ── Morador: a própria unidade ────────────────────────────────────────────
    if (!isSystem && ctx.apartmentIds.length) {
      const relatorios = await prisma.apartmentConsumptionReport.findMany({
        where: { deletedAt: null, apartmentId: { in: ctx.apartmentIds } },
        select: { monthRef: true, yearRef: true, utilityType: true, consumption: true, totalUnit: true },
        orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
        take: 24,
      });
      const agua = relatorios.filter(r => (r.utilityType || 'water') === 'water');
      if (agua.length >= 4) {
        const ultimo = agua[0];
        const anteriores = agua.slice(1, 4);
        const media = anteriores.reduce((a, r) => a + numero(r.consumption), 0) / anteriores.length;
        const atual = numero(ultimo.consumption);
        if (media > 0 && atual > media * 1.4) {
          const pct = Math.round(((atual - media) / media) * 100);
          avisos.push({
            tipo: 'consumo_alto',
            titulo: `Consumo ${pct}% acima da sua média`,
            detalhe: `Em ${MESES[Number(ultimo.monthRef) - 1]}/${ultimo.yearRef} você consumiu ${atual.toFixed(2)} m³ contra média de ${media.toFixed(2)} m³. Vale conferir vazamentos.`,
          });
        }
      }
      // Competência aberta sem leitura
      const hoje = new Date();
      const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
      const anoAtual = String(hoje.getFullYear());
      const temMesAtual = relatorios.some(r => r.monthRef === mesAtual && r.yearRef === anoAtual);
      if (!temMesAtual && agua.length) {
        avisos.push({
          tipo: 'leitura_pendente',
          titulo: `${MESES[Number(mesAtual) - 1]}/${anoAtual} ainda sem leitura`,
          detalhe: 'Assim que o fechamento do mês for processado, sua filipeta aparece aqui.',
        });
      }
    }

    // ── Síndico/administrador: pendências do escopo ───────────────────────────
    if (isSystem || ctx.complexIds.length) {
      const escopoComplexos = isSystem ? undefined : ctx.complexIds;
      const ultimas = await prisma.apartmentConsumptionReport.groupBy({
        by: ['monthRef', 'yearRef'],
        where: { deletedAt: null, ...(escopoComplexos ? { complexId: { in: escopoComplexos } } : {}) },
        _count: { _all: true },
        orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
        take: 1,
      });
      const ref = ultimas[0];
      if (ref) {
        const contas = await prisma.dealershipReading.findMany({
          where: {
            deletedAt: null,
            monthRef: ref.monthRef, yearRef: ref.yearRef,
            ...(escopoComplexos ? { complexId: { in: escopoComplexos } } : {}),
          },
          select: { coeficiente: true, complex: { select: { socialName: true } } },
        });
        const semTarifa = contas.filter(c => !String(c.coeficiente || '').trim());
        if (semTarifa.length) {
          const nomes = Array.from(new Set(semTarifa.map(c => (c.complex as any)?.socialName).filter(Boolean))).slice(0, 3);
          avisos.push({
            tipo: 'tarifa_vazia',
            titulo: `${semTarifa.length} conta(s) sem tarifa em ${MESES[Number(ref.monthRef) - 1]}/${ref.yearRef}`,
            detalhe: nomes.length
              ? `Sem a tarifa a filipeta sai sem o valor unitário. Pendente em: ${nomes.join(', ')}.`
              : 'Sem a tarifa a filipeta sai sem o valor unitário.',
          });
        }
      }
    }
  } catch (e: any) {
    console.error('[assistant/avisos] erro:', e?.message?.slice(0, 200));
  }

  return NextResponse.json({ avisos: avisos.slice(0, 3) });
}
