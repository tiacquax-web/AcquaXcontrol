import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContexts } from '@/lib/userContexts';
import { serverError } from '@/lib/safeError';
import { GrouplinkCsvIngestionService } from '@/lib/services/grouplink-csv-ingestion-service';

interface ManualIngestionBody {
  companyId?: string;
  storageIntegrationId?: string;
  limitFiles?: number;
  forceReprocess?: boolean;
  objectKey?: string;
  pilotModeOnly?: boolean;
  pilotComplexId?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contexts = await getUserContexts(userId);
    const isAdmin = contexts.system;
    const canRunIngestion = isAdmin || contexts.companyIds.length > 0;
    if (!canRunIngestion) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ManualIngestionBody;

    if (body.companyId && !isAdmin && !contexts.companyIds.includes(body.companyId)) {
      return NextResponse.json({ error: 'Sem permissão para executar ingestão nesta empresa.' }, { status: 403 });
    }

    const service = new GrouplinkCsvIngestionService();
    const result = await service.run({
      trigger: 'manual',
      companyId: body.companyId,
      storageIntegrationId: body.storageIntegrationId,
      limitFiles: body.limitFiles,
      forceReprocess: body.forceReprocess,
      objectKey: body.objectKey,
      pilotModeOnly: body.pilotModeOnly,
      pilotComplexId: body.pilotComplexId,
    });

    return NextResponse.json({
      message: 'Ingestão Grouplink executada com sucesso.',
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-ingestion', error);
  }
}
