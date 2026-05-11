import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';
import { serverError } from '@/lib/safeError';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ processingId: string }> },
): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const { processingId } = await params;
    const csv = await GrouplinkOperationalService.exportIngestionErrorsCsv(processingId);
    if (!csv) {
      return NextResponse.json({ error: 'Processamento não encontrado.' }, { status: 404 });
    }

    await logAdminAction({
      userId: auth.userId!,
      action: 'grouplink_export_ingestion_errors',
      target: processingId,
      status: 'success',
      responseSummary: { exported: true },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="grouplink-ingestion-errors-${processingId}.csv"`,
      },
    });
  } catch (error) {
    return serverError('admin-grouplink-ingestion-errors-export', error);
  }
}
