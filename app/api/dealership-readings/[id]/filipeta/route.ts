// app/api/dealership-readings/[id]/filipeta/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';

// Helper function to get previous months
const getPreviousMonths = (year: number, month: number, count: number) => {
  let date = new Date(year, month - 1, 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    date.setMonth(date.getMonth() - 1);
    result.push({
      yearRef: String(date.getFullYear()),
      monthRef: String(date.getMonth() + 1).padStart(2, '0'),
    });
  }
  return result;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dealershipReadingId: string = 'unknown';
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    dealershipReadingId = id;

    if (!dealershipReadingId) {
      return NextResponse.json({ error: 'Bad Request: Dealership Reading ID is required' }, { status: 400 });
    }

    const dealershipReading = await prisma.dealershipReading.findUnique({
      where: { id: dealershipReadingId },
      include: { complex: { include: { company: true } }, dealership: true },
    });

    if (!dealershipReading) {
      return NextResponse.json({ error: 'Not Found: Dealership reading not found' }, { status: 404 });
    }

    const currentReports = await prisma.apartmentConsumptionReport.findMany({
      where: { dealershipReadingId: dealershipReadingId, deletedAt: null },
      include: {
        apartment: { include: { block: { include: { complex: { include: { company: true } } } } } },
        lastReading: true,
      },
    });

    if (!currentReports || currentReports.length === 0) {
      return NextResponse.json({ error: 'Not Found: No apartment reports found for this dealership reading' }, { status: 404 });
    }

    const order = req.nextUrl.searchParams.get('order') || 'block_apartment';

    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    currentReports.sort((a, b) => {
      const blockA = a.apartment?.block?.name || '';
      const blockB = b.apartment?.block?.name || '';
      const apartmentA = a.apartment?.name || '';
      const apartmentB = b.apartment?.name || '';

      if (order === 'apartment_block') {
        const apartmentCompare = collator.compare(apartmentA, apartmentB);
        if (apartmentCompare !== 0) {
          return apartmentCompare;
        }
        return collator.compare(blockA, blockB);
      }

      const blockCompare = collator.compare(blockA, blockB);
      if (blockCompare !== 0) {
        return blockCompare;
      }
      return collator.compare(apartmentA, apartmentB);
    });

    const apartmentIds = currentReports.map(r => r.apartmentId);
    const firstReport = currentReports[0];
    const previousMonthRefs = getPreviousMonths(Number(firstReport.yearRef), Number(firstReport.monthRef), 6); // Fetch last 6 for safety

    const historicalReports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        apartmentId: { in: apartmentIds },
        deletedAt: null,
        OR: previousMonthRefs.map(ref => ({
          monthRef: ref.monthRef,
          yearRef: ref.yearRef,
        })),
      },
      include: {
        lastReading: true,
      },
      orderBy: {
        yearRef: 'desc',
      },
    });

    const historicalReportsByApartment = historicalReports.reduce((acc, report) => {
      if (!acc[report.apartmentId]) {
        acc[report.apartmentId] = [];
      }
      acc[report.apartmentId].push(report);
      return acc;
    }, {} as Record<string, any[]>);

    const enrichedReports = currentReports.map(currentReport => {
      const history = historicalReportsByApartment[currentReport.apartmentId] || [];
      // Sort history descending by date to easily find previous months
      history.sort((a, b) => {
        const dateA = new Date(Number(a.yearRef), Number(a.monthRef) - 1);
        const dateB = new Date(Number(b.yearRef), Number(b.monthRef) - 1);
        return dateB.getTime() - dateA.getTime();
      });
      return {
        ...currentReport,
        history: history, // Attach all found historical reports
      };
    });

    const responseData = {
      list: enrichedReports,
      totalCount: enrichedReports.length,
      dealershipReading: dealershipReading,
    };

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error(`[API_FILIPETA_ERROR] Prisma query failed for dealership reading ${dealershipReadingId}:`, error.message, error.stack);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
