import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { serverError } from '@/lib/safeError';

interface ResetPilotBody {
  complexId?: string;
  clearPilotFlags?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ResetPilotBody;

    const result = await GrouplinkOperationalService.resetPilotEnvironment({
      complexId: body.complexId,
      clearPilotFlags: body.clearPilotFlags,
    });

    return NextResponse.json({
      message: 'Ambiente piloto resetado.',
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-pilot-reset', error);
  }
}
