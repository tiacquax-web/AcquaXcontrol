import { NextRequest, NextResponse } from 'next/server';
import { GlImportService } from '@/lib/services/gl-import-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const fromDaysAgo = body.fromDays ?? 27;
    const toDaysAgo = body.toDays ?? 0;

    let totalFilesFound = 0, totalImported = 0, totalSkipped = 0, totalErrors = 0;
    const byDay: any[] = [];

    for (let i = fromDaysAgo; i >= toDaysAgo; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      d.setUTCHours(12, 0, 0, 0);
      const dayStr = d.toISOString().slice(0, 10);

      try {
        const result = await GlImportService.runImport(d);
        totalFilesFound += result.filesFound;
        totalImported += result.imported;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        if (result.filesFound > 0 || result.imported > 0) {
          byDay.push({ date: dayStr, filesFound: result.filesFound, imported: result.imported, skipped: result.skipped });
        }
      } catch (e: any) {
        byDay.push({ date: dayStr, error: e.message });
        totalErrors++;
      }
    }

    return NextResponse.json({
      success: true,
      daysProcessed: fromDaysAgo - toDaysAgo + 1,
      totalFilesFound,
      totalImported,
      totalSkipped,
      totalErrors,
      byDay,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
