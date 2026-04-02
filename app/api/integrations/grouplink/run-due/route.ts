import { NextRequest, NextResponse } from 'next/server';
import { GroupLinkSchedulerService } from '@/lib/services/grouplink-scheduler-service';

function resolveSecret(req: NextRequest): string {
  return (
    req.headers.get('x-grouplink-sync-secret')?.trim() ||
    req.nextUrl.searchParams.get('secret')?.trim() ||
    ''
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const secret = resolveSecret(req);
    const result = await GroupLinkSchedulerService.runDueSchedules(secret);
    return NextResponse.json(
      {
        message: 'Processamento de agendamentos Group Link concluído.',
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Falha ao processar agendamentos Group Link.',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 401 },
    );
  }
}
