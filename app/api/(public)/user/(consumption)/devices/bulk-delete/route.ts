import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { DeviceManagementService } from '@/lib/services/device-management-service';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;

    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const body = await req.json().catch(() => ({}));

    const semLink = !!body?.semLink;
    const comLeiturasDesvinculadas = !!body?.comLeiturasDesvinculadas;

    const result = await DeviceManagementService.bulkDeleteDevices(userId, {
      hasActiveLink: semLink ? false : undefined,
      hasUnlinkedReadings: comLeiturasDesvinculadas ? true : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Falha na exclusão em lote' }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Dispositivos excluídos com sucesso',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
