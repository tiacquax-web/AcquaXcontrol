import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkOperationalService, type DeviceChassiImportRow } from '@/lib/services/grouplink-operational-service';
import { serverError } from '@/lib/safeError';

interface ImportBody {
  rows: DeviceChassiImportRow[];
  pilotMode?: boolean;
  pilotComplexId?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json()) as ImportBody;
    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha enviada para importação.' }, { status: 400 });
    }

    const result = await GrouplinkOperationalService.importDevicesByChassi(body.rows, {
      pilotMode: body.pilotMode,
      pilotComplexId: body.pilotComplexId,
    });

    return NextResponse.json({
      message: 'Importação em massa (device_id x chassi) concluída.',
      summary: {
        success: result.success.length,
        ignored: result.ignored.length,
        errors: result.errors.length,
      },
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-devices-import', error);
  }
}
