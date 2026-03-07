// app/api/meter-report/route.ts
// Retorna filipeta data agregada por mês/ano/condomínio (sem precisar do dealershipReadingId)
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

function getPreviousMonths(year: number, month: number, count: number) {
  const date = new Date(year, month - 1, 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    date.setMonth(date.getMonth() - 1);
    result.push({
      yearRef: String(date.getFullYear()),
      monthRef: String(date.getMonth() + 1).padStart(2, '0'),
    });
  }
  return result;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const monthRef = req.nextUrl.searchParams.get('month') || '';
    const yearRef = req.nextUrl.searchParams.get('year') || '';
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined;
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined;

    if (!monthRef || !yearRef) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    // Determinar contexto do usuário (morador vs admin)
    const contexts = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
    const isSystem = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0 || contexts.blockIds.length > 0;
    const userApartmentIds = contexts.apartmentIds;

    // Build where clause for reports
    const where: any = {
      monthRef: monthRef.padStart(2, '0'),
      yearRef,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    };

    if (complexId) {
      where.complexId = complexId;
    }

    if (apartmentId) {
      where.apartmentId = apartmentId;
    } else if (!isSystem && userApartmentIds.length > 0) {
      // Morador: filtra apenas seus apartamentos
      where.apartmentId = { in: userApartmentIds };
    } else if (!isSystem && userApartmentIds.length === 0) {
      return NextResponse.json({ list: [], totalCount: 0, dealershipReadings: [] });
    }

    const currentReports = await prisma.apartmentConsumptionReport.findMany({
      where,
      include: {
        apartment: {
          include: {
            block: {
              include: {
                complex: { include: { company: true } },
              },
            },
          },
        },
        lastReading: true,
      },
      orderBy: [{ complexId: 'asc' }],
    });

    if (currentReports.length === 0) {
      return NextResponse.json({ list: [], totalCount: 0, dealershipReadings: [] });
    }

    // Sort by block name then apartment name
    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    currentReports.sort((a, b) => {
      const blockA = (a.apartment as any)?.block?.name || '';
      const blockB = (b.apartment as any)?.block?.name || '';
      const apartA = (a.apartment as any)?.name || '';
      const apartB = (b.apartment as any)?.name || '';
      const bc = collator.compare(blockA, blockB);
      return bc !== 0 ? bc : collator.compare(apartA, apartB);
    });

    // Fetch dealership readings for this month/year/complex to get billing info
    const drWhere: any = {
      monthRef: monthRef.padStart(2, '0'),
      yearRef,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    };
    if (complexId) drWhere.complexId = complexId;

    const dealershipReadings = await prisma.dealershipReading.findMany({
      where: drWhere,
      include: { complex: { include: { company: true } }, dealership: true },
    });

    // Index dealership readings by id for quick lookup
    const drById: Record<string, any> = {};
    dealershipReadings.forEach(dr => { drById[dr.id] = dr; });

    // Historical data
    const apartmentIds = [...new Set(currentReports.map(r => r.apartmentId))];
    const firstReport = currentReports[0];
    const previousMonthRefs = getPreviousMonths(Number(firstReport.yearRef), Number(firstReport.monthRef), 3);

    const historicalReports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        apartmentId: { in: apartmentIds },
        OR: [
          ...previousMonthRefs.map(ref => ({ monthRef: ref.monthRef, yearRef: ref.yearRef })),
        ],
        AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
      },
      include: { lastReading: true },
      orderBy: { yearRef: 'desc' },
    });

    const historicalByApartment: Record<string, any[]> = {};
    historicalReports.forEach(r => {
      if (!historicalByApartment[r.apartmentId]) historicalByApartment[r.apartmentId] = [];
      historicalByApartment[r.apartmentId].push(r);
    });

    // Sort historical descending
    Object.values(historicalByApartment).forEach(arr =>
      arr.sort((a, b) => {
        const da = new Date(Number(a.yearRef), Number(a.monthRef) - 1);
        const db = new Date(Number(b.yearRef), Number(b.monthRef) - 1);
        return db.getTime() - da.getTime();
      })
    );

    const enrichedReports = currentReports.map(r => ({
      ...r,
      history: historicalByApartment[r.apartmentId] || [],
      dealershipReading: r.dealershipReadingId ? drById[r.dealershipReadingId] || null : null,
    }));

    return NextResponse.json({
      list: enrichedReports,
      totalCount: enrichedReports.length,
      dealershipReadings,
    });
  } catch (e: any) {
    console.error('[API meter-report]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
