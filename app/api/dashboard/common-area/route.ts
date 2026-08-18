import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: sessionError || 'Não autorizado' }, { status: sessionStatus || 401 });
    }

    const complexId = req.nextUrl.searchParams.get('complex_id');
    const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());
    if (!complexId) {
      return NextResponse.json({ error: 'complex_id é obrigatório' }, { status: 400 });
    }
    if (!/^\d{4}$/.test(year)) {
      return NextResponse.json({ error: 'year inválido' }, { status: 400 });
    }

    // Tenta primeiro permissão de dealershipReading (Admin/Síndico)
    const contexts = await getUserContextsForActionOnEntity(userId, 'dealershipReading', 'read');
    let allowed = contexts.system
      || contexts.complexIds.includes(complexId)
      || contexts.companyIds.length > 0;

    // Se não tiver, tenta permissão de morador (apartmentConsumptionReport)
    if (!allowed) {
      const aptContexts = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
      // Verifica se o morador tem acesso a algum condomínio que coincida com o complexId
      // ou se ele tem apartamentos vinculados a blocos deste condomínio.
      // O getUserContextsForActionOnEntity já retorna complexIds permitidos para o morador.
      allowed = aptContexts.complexIds.includes(complexId);
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão para este condomínio' }, { status: 403 });
    }

    const readings = await prisma.dealershipReading.findMany({
      where: {
        complexId,
        yearRef: year,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        monthRef: true,
        type: true,
        diffCost: true,
        totalValue: true,
        dealershipConsumption: true,
        monthlyConsumption: true,
        readingDate: true,
        readingDateNext: true,
      },
      orderBy: { monthRef: 'asc' },
    });

    const monthly = MONTH_NAMES.map((label, index) => ({
      month: String(index + 1).padStart(2, '0'),
      label,
      areaCommon: null as number | null,
      totalBill: null as number | null,
      condominiumConsumption: null as number | null,
      readingDate: null as string | null,
      nextReadingDate: null as string | null,
    }));

    // Normalmente há uma leitura de água por mês. Se houver mais de uma leitura
    // do mesmo mês, priorizamos água para não misturar Área Comum com gás.
    const byMonth = new Map<string, (typeof readings)[number]>();
    for (const reading of readings) {
      const month = String(reading.monthRef).padStart(2, '0');
      const existing = byMonth.get(month);
      if (!existing || (reading.type === 'water' && existing.type !== 'water')) {
        byMonth.set(month, reading);
      }
    }

    monthly.forEach(item => {
      const reading = byMonth.get(item.month);
      if (!reading) return;
      item.areaCommon = Number(reading.diffCost ?? 0);
      item.totalBill = Number(reading.totalValue ?? 0);
      item.condominiumConsumption = Number(reading.dealershipConsumption ?? reading.monthlyConsumption ?? 0);
      item.readingDate = reading.readingDate;
      item.nextReadingDate = reading.readingDateNext;
    });

    const values = monthly.map(item => item.areaCommon).filter((value): value is number => value != null);
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;
    const peak = monthly.reduce<{ label: string; value: number } | null>((current, item) => {
      if (item.areaCommon == null) return current;
      if (!current || item.areaCommon > current.value) return { label: item.label, value: item.areaCommon };
      return current;
    }, null);

    return NextResponse.json({
      year,
      complexId,
      months: monthly,
      summary: {
        total,
        average,
        peak,
        monthsWithData: values.length,
      },
    });
  } catch (error: any) {
    console.error('[dashboard/common-area]', error);
    return NextResponse.json({ error: 'Erro ao carregar acompanhamento da Área Comum' }, { status: 500 });
  }
}
