import { NextRequest, NextResponse } from 'next/server';
import { GlImportService } from '@/lib/services/gl-import-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

function buildDateRange(fromDaysAgo: number): Date[] {
  const dates: Date[] = [];
  for (let i = fromDaysAgo; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(12, 0, 0, 0);
    dates.push(d);
  }
  return dates;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const daysBack = body.days ?? 30;

    const dates = buildDateRange(daysBack);
    console.log(`[temp-retro-import] Processando ${dates.length} dias (${dates[0].toISOString().slice(0,10)} → ${dates[dates.length-1].toISOString().slice(0,10)})`);

    let totalFilesFound = 0, totalImported = 0, totalSkipped = 0, totalErrors = 0;
    const byDay: any[] = [];

    for (const date of dates) {
      const dayStr = date.toISOString().slice(0, 10);
      try {
        const result = await GlImportService.runImport(date);
        totalFilesFound += result.filesFound;
        totalImported += result.imported;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        if (result.filesFound > 0 || result.imported > 0) {
          byDay.push({ date: dayStr, filesFound: result.filesFound, imported: result.imported, skipped: result.skipped });
        }
        console.log(`[temp-retro-import] ${dayStr}: files=${result.filesFound} imported=${result.imported} skipped=${result.skipped}`);
      } catch (e: any) {
        console.error(`[temp-retro-import] Erro no dia ${dayStr}:`, e.message);
        byDay.push({ date: dayStr, error: e.message });
        totalErrors++;
      }
    }

    return NextResponse.json({
      success: true,
      daysProcessed: dates.length,
      totalFilesFound,
      totalImported,
      totalSkipped,
      totalErrors,
      byDay: byDay.filter(d => d.filesFound > 0 || d.imported > 0 || d.error),
      message: `Importação retroativa (${daysBack} dias) concluída.`,
    });
  } catch (err: any) {
    console.error('[temp-retro-import] erro:', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
