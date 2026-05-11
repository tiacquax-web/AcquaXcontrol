import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { serverError } from '@/lib/safeError';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const summary = await GrouplinkOperationalService.getObservabilitySummary();
    return NextResponse.json(summary);
  } catch (error) {
    return serverError('admin-grouplink-observability', error);
  }
}
