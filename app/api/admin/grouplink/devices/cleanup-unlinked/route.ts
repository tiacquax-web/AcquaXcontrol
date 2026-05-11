import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';
import { serverError } from '@/lib/safeError';

interface CleanupBody {
  onlyPilot?: boolean;
  onlyWithoutReadings?: boolean;
  olderThanDays?: number;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json().catch(() => ({}))) as CleanupBody;
    const result = await GrouplinkOperationalService.bulkDeleteDevices({
      onlyUnlinked: true,
      onlyPilot: body.onlyPilot,
      onlyWithoutReadings: body.onlyWithoutReadings ?? true,
      olderThanDays: body.olderThanDays,
    });

    await logAdminAction({
      userId: auth.userId!,
      action: 'grouplink_cleanup_unlinked_devices',
      status: 'success',
      requestPayload: body as unknown as Record<string, unknown>,
      responseSummary: result as unknown as Record<string, unknown>,
    });

    return NextResponse.json({
      message: 'Dispositivos desvinculados limpos com sucesso.',
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-cleanup-unlinked', error);
  }
}
