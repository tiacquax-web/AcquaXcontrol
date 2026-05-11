import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkCsvIngestionService } from '@/lib/services/grouplink-csv-ingestion-service';
import { serverError } from '@/lib/safeError';

interface ReprocessFileBody {
  companyId?: string;
  storageIntegrationId?: string;
  objectKey: string;
  pilotModeOnly?: boolean;
  pilotComplexId?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json()) as ReprocessFileBody;
    if (!body.objectKey) {
      return NextResponse.json({ error: 'objectKey é obrigatório para reprocessar arquivo.' }, { status: 400 });
    }

    const service = new GrouplinkCsvIngestionService();
    const result = await service.run({
      trigger: 'manual',
      companyId: body.companyId,
      storageIntegrationId: body.storageIntegrationId,
      objectKey: body.objectKey,
      forceReprocess: true,
      pilotModeOnly: body.pilotModeOnly,
      pilotComplexId: body.pilotComplexId,
      limitFiles: 1,
    });

    return NextResponse.json({
      message: 'Reprocessamento de arquivo executado.',
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-reprocess-file', error);
  }
}
