import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
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
    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get('take') || 25), 1), 200);
    const skip = Math.max(Number(req.nextUrl.searchParams.get('skip') || 0), 0);

    const details = await GrouplinkOperationalService.getIngestionDetails({ processingId, take, skip });
    if (!details) {
      return NextResponse.json({ error: 'Processamento não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    return serverError('admin-grouplink-ingestion-detail', error);
  }
}
