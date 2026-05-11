import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';
import { serverError } from '@/lib/safeError';

interface ResetPilotBody {
  complexId?: string;
  clearPilotFlags?: boolean;
  confirmationText?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ResetPilotBody;
    if (body.confirmationText !== 'RESETAR PILOTO') {
      await logAdminAction({
        userId: auth.userId!,
        action: 'grouplink_pilot_reset',
        target: body.complexId,
        status: 'blocked',
        requestPayload: { complexId: body.complexId, clearPilotFlags: body.clearPilotFlags },
        responseSummary: { reason: 'confirmation_text_invalid' },
      });
      return NextResponse.json(
        { error: 'Confirmação inválida. Envie confirmationText="RESETAR PILOTO".' },
        { status: 400 },
      );
    }

    const result = await GrouplinkOperationalService.resetPilotEnvironment({
      complexId: body.complexId,
      clearPilotFlags: body.clearPilotFlags,
    });

    await logAdminAction({
      userId: auth.userId!,
      action: 'grouplink_pilot_reset',
      target: body.complexId,
      status: 'success',
      requestPayload: { complexId: body.complexId, clearPilotFlags: body.clearPilotFlags },
      responseSummary: result as unknown as Record<string, unknown>,
    });

    return NextResponse.json({
      message: 'Ambiente piloto resetado.',
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-pilot-reset', error);
  }
}
