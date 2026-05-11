import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { GrouplinkCsvIngestionService } from '@/lib/services/grouplink-csv-ingestion-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';
import { serverError } from '@/lib/safeError';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ processingId: string }> },
): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const { processingId } = await params;
    const processing = await prisma.storageFileProcessing.findFirst({
      where: { id: processingId, deletedAt: null },
      include: {
        errors: {
          where: {
            deletedAt: null,
            lineNumber: { gt: 1 },
          },
          select: { lineNumber: true },
        },
      },
    });

    if (!processing) {
      return NextResponse.json({ error: 'Processamento não encontrado.' }, { status: 404 });
    }

    const lineNumbers = Array.from(new Set(processing.errors.map((err) => err.lineNumber))).sort((a, b) => a - b);
    if (!lineNumbers.length) {
      return NextResponse.json({ error: 'Não há linhas com falha para reprocessar.' }, { status: 400 });
    }

    const service = new GrouplinkCsvIngestionService();
    const result = await service.run({
      trigger: 'manual',
      companyId: processing.companyId,
      storageIntegrationId: processing.storageIntegrationId,
      objectKey: processing.objectKey,
      forceReprocess: true,
      lineNumbers,
      correlationId: randomUUID(),
      limitFiles: 1,
    });

    await logAdminAction({
      userId: auth.userId!,
      action: 'grouplink_reprocess_only_failures',
      target: processingId,
      status: 'success',
      correlationId: result.correlationId,
      requestPayload: {
        objectKey: processing.objectKey,
        lineNumbers,
      },
      responseSummary: {
        processedFiles: result.processedFiles,
        failedFiles: result.failedFiles,
        rowErrors: result.rowErrors,
      },
    });

    return NextResponse.json({
      message: 'Reprocessamento apenas de falhas concluído.',
      lineNumbers,
      result,
    });
  } catch (error) {
    return serverError('admin-grouplink-ingestion-reprocess-failures', error);
  }
}
