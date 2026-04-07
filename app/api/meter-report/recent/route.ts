import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || '';
    const requestedMonthsLimit = Number(req.nextUrl.searchParams.get('months_limit') || '48');
    const monthsLimit = Number.isFinite(requestedMonthsLimit)
      ? Math.min(Math.max(requestedMonthsLimit, 1), 48)
      : 48;

    if (!apartmentId) {
      return NextResponse.json({ error: 'apartment_id is required' }, { status: 400 });
    }

    const contexts = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
    const hasElevatedAccess = Boolean(
      contexts.system
      || contexts.companyIds.length > 0
      || contexts.complexIds.length > 0
      || contexts.blockIds.length > 0
    );

    if (!hasElevatedAccess) {
      const canAccessApartment = contexts.apartmentIds.includes(apartmentId);
      if (!canAccessApartment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const reports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        apartmentId,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
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
      orderBy: [
        { yearRef: 'desc' },
        { monthRef: 'desc' },
      ],
    });

    const months: Array<{ monthRef: string; yearRef: string; list: typeof reports }> = [];
    const monthIndex = new Map<string, number>();

    for (const report of reports) {
      const key = `${report.yearRef}-${report.monthRef}`;
      const existingIdx = monthIndex.get(key);

      if (existingIdx != null) {
        months[existingIdx].list.push(report);
        continue;
      }

      if (months.length >= monthsLimit) {
        break;
      }

      monthIndex.set(key, months.length);
      months.push({
        monthRef: report.monthRef,
        yearRef: report.yearRef,
        list: [report],
      });
    }

    return NextResponse.json({ months });
  } catch (e: any) {
    console.error('[API meter-report/recent]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
