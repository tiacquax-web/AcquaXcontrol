import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';
import { serverError } from '@/lib/safeError';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const csv = await GrouplinkOperationalService.exportLinksReportCsv();
    await logAdminAction({
      userId: auth.userId!,
      action: 'grouplink_export_links_report',
      status: 'success',
      responseSummary: { exported: true },
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="grouplink-links-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return serverError('admin-grouplink-links-export', error);
  }
}
