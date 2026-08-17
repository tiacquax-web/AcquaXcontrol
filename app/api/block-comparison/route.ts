/**
 * GET /api/block-comparison?complexId=xxx&month=06&year=2026
 *
 * Retorna comparação de consumo entre blocos de um condomínio.
 * Usado pelo dashboard do síndico.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('session')?.value;
  const validSession = session ? await isSessionValid(session) : false;
  if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const complexId = req.nextUrl.searchParams.get('complexId');
  const month = req.nextUrl.searchParams.get('month');
  const year = req.nextUrl.searchParams.get('year');

  if (!complexId || !month || !year) {
    return NextResponse.json({ error: 'complexId, month e year são obrigatórios' }, { status: 400 });
  }

  // Verificar permissão
  const userId = (validSession as any).userId;
  const contexts = await getUserContextsForActionOnEntity(userId, 'reading', 'read');
  const hasAccess = contexts.system || contexts.complexIds.includes(complexId);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  // Buscar relatórios agrupados por bloco
  const reports = await prisma.apartmentConsumptionReport.findMany({
    where: {
      deletedAt: null,
      monthRef: month,
      yearRef: year,
      apartment: {
        deletedAt: null,
        block: { complexId, deletedAt: null },
      },
    },
    select: {
      consumption: true,
      totalConsumption: true,
      totalUnit: true,
      apartment: {
        select: {
          name: true,
          block: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Agrupar por bloco
  const byBlock: Record<string, {
    blockName: string;
    totalConsumption: number;
    totalValue: number;
    unitCount: number;
    units: { name: string; consumption: number }[];
  }> = {};

  for (const r of reports) {
    const block = r.apartment?.block;
    if (!block) continue;
    if (!byBlock[block.id]) {
      byBlock[block.id] = {
        blockName: block.name,
        totalConsumption: 0,
        totalValue: 0,
        unitCount: 0,
        units: [],
      };
    }
    const consumption = r.totalConsumption ?? r.consumption ?? 0;
    byBlock[block.id].totalConsumption += consumption;
    byBlock[block.id].totalValue += r.totalUnit ?? 0;
    byBlock[block.id].unitCount++;
    byBlock[block.id].units.push({ name: r.apartment?.name ?? '?', consumption });
  }

  const blocks = Object.values(byBlock).map(b => ({
    ...b,
    avgConsumption: b.unitCount > 0 ? b.totalConsumption / b.unitCount : 0,
  })).sort((a, b) => b.totalConsumption - a.totalConsumption);

  return NextResponse.json({ blocks, monthRef: month, yearRef: year });
}
