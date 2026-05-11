import { NextRequest, NextResponse } from 'next/server';
import { serverError } from '@/lib/safeError';
import { GrouplinkCsvIngestionService } from '@/lib/services/grouplink-csv-ingestion-service';

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return true;

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const querySecret = req.nextUrl.searchParams.get('token') || '';

  return bearer === expectedSecret || querySecret === expectedSecret;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
    }

    const service = new GrouplinkCsvIngestionService();
    const pilotModeOnly = req.nextUrl.searchParams.get('pilot_only') === 'true';
    const pilotComplexId = req.nextUrl.searchParams.get('pilot_complex_id') || undefined;
    const result = await service.run({
      trigger: 'cron',
      forceReprocess: false,
      pilotModeOnly,
      pilotComplexId,
    });

    return NextResponse.json({
      message: 'Rotina automática de ingestão Grouplink executada.',
      result,
    });
  } catch (error) {
    return serverError('cron-grouplink-ingestion', error);
  }
}
