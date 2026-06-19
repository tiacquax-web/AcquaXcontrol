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

    // Optional filters: block and apartment
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined;
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined;
    // meta_only=1 → return only the dealershipReading record (no apartment queries)
    // Used by the pre-load filter pattern so the page knows complexId immediately.
    const metaOnly = req.nextUrl.searchParams.get('meta_only') === '1';

    const dealershipReading = await prisma.dealershipReading.findUnique({
      where: { id: dealershipReadingId },
      include: { complex: { include: { company: true } }, dealership: true },
    });

    if (!dealershipReading) {
      return NextResponse.json({ error: 'Not Found: Dealership reading not found' }, { status: 404 });
    }

    // Fast path: caller only needs metadata (e.g. complexId for pre-loading filters)
    if (metaOnly) {
      return NextResponse.json({
        list: [],
        totalCount: 0,
        dealershipReading,
      });
    }

    // Build apartment filter.
    // When BOTH blockId and apartmentId are provided, enforce both constraints so
    // the two dropdowns behave as fully independent, AND-combined filters.
    // When only one is provided, filter by that one alone.
    const apartmentFilter = apartmentId && blockId
      ? { id: apartmentId, blockId: blockId }   // both selected → AND-filter
      : apartmentId
        ? { id: apartmentId }                   // only apartment selected
        : blockId
          ? { blockId: blockId }                // only block selected
          : undefined;                          // no filter

    // deletedAt filter is handled globally by the Prisma soft-delete middleware —
    // do NOT add explicit { deletedAt: null } here (absent-key docs would be excluded).
    const currentReports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        dealershipReadingId: dealershipReadingId,
        ...(apartmentFilter ? { apartment: apartmentFilter } : {}),
      },
      include: {
        apartment: { include: { block: { include: { complex: { include: { company: true } } } } } },
        lastReading: true,
      },
    });

    if (!currentReports || currentReports.length === 0) {
      // Return empty list (not 404) when filters narrow to zero results so the
      // UI can display "nenhuma filipeta encontrada" rather than crashing.
      return NextResponse.json({ list: [], totalCount: 0, dealershipReading });
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
      if (!acc[report.apartmentId!]) {
        acc[report.apartmentId!] = [];
      }
      acc[report.apartmentId!].push(report);
      return acc;
    }, {} as Record<string, any[]>);

    // ── Fallback de urlCover ──────────────────────────────────────────────────
    // Quando um relatório não tem lastReadingId (ex: importado via combined-import
    // com policy=skip, ou medidor não encontrado pelo chassi), buscamos a leitura
    // mais recente do apartamento no mesmo mês/ano para preencher a foto.
    const reportsWithoutLastReading = currentReports.filter(r => !r.lastReadingId);
    let fallbackReadingsByApartment: Record<string, any> = {};

    if (reportsWithoutLastReading.length > 0) {
      const fallbackApartmentIds = reportsWithoutLastReading.map(r => r.apartmentId);
      // Usar o mês/ano do primeiro relatório (todos são do mesmo dealershipReading → mesmo período)
      const fallbackMonthRef = firstReport.monthRef;
      const fallbackYearRef = firstReport.yearRef;

      const fallbackReadings = await prisma.reading.findMany({
        where: {
          apartmentId: { in: fallbackApartmentIds },
          monthRef: fallbackMonthRef,
          yearRef: fallbackYearRef,
          deletedAt: null,
          urlCover: { not: null },
        },
        orderBy: { readAt: 'desc' },
        select: {
          id: true,
          apartmentId: true,
          urlCover: true,
          reading: true,
          readAt: true,
          readAtDate: true,
          monthRef: true,
          yearRef: true,
          meterId: true,
          isManualReading: true,
          isPreReading: true,
          registerName: true,
          nextReadingDate: true,
        },
      });

      // Manter apenas a leitura mais recente por apartamento (já está ordenado por readAt desc)
      for (const r of fallbackReadings) {
        if (!fallbackReadingsByApartment[r.apartmentId!]) {
          fallbackReadingsByApartment[r.apartmentId!] = r;
        }
      }
    }

    const enrichedReports = currentReports.map(currentReport => {
      const history = historicalReportsByApartment[currentReport.apartmentId] || [];
      // Sort history descending by date to easily find previous months
      history.sort((a, b) => {
        const dateA = new Date(Number(a.yearRef), Number(a.monthRef) - 1);
        const dateB = new Date(Number(b.yearRef), Number(b.monthRef) - 1);
        return dateB.getTime() - dateA.getTime();
      });

      // Se não tem lastReading, usar o fallback (leitura mais recente do período com urlCover)
      const effectiveLastReading = currentReport.lastReading
        ?? fallbackReadingsByApartment[currentReport.apartmentId]
        ?? null;

      return {
        ...currentReport,
        lastReading: effectiveLastReading,
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
