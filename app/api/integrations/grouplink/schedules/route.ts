import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import {
  GroupLinkSchedulerService,
  GroupLinkComplexScheduleConfig,
} from '@/lib/services/grouplink-scheduler-service';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) {
      return NextResponse.json({ error: error || 'Não autorizado' }, { status: status || 401 });
    }

    const complexId = req.nextUrl.searchParams.get('complexId')?.trim();
    if (!complexId) {
      return NextResponse.json({ error: 'Informe complexId.' }, { status: 400 });
    }

    const data = await GroupLinkSchedulerService.getComplexSchedule(userId, complexId);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar agendamento.' },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) {
      return NextResponse.json({ error: error || 'Não autorizado' }, { status: status || 401 });
    }

    const body = (await req.json()) as GroupLinkComplexScheduleConfig;
    if (!body?.complexId) {
      return NextResponse.json({ error: 'Informe complexId.' }, { status: 400 });
    }

    const data = await GroupLinkSchedulerService.updateComplexSchedule(userId, body);
    return NextResponse.json({ message: 'Agendamento atualizado com sucesso.', data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar agendamento.' },
      { status: 400 },
    );
  }
}
