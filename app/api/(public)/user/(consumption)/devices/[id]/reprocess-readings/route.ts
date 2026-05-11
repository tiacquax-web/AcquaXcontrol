import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import FastReadingReprocessService from '@/lib/services/reading-fast-reprocess-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'deviceId não informado' }, { status: 400 });
    }

    const result = await FastReadingReprocessService.fastReprocessDevices(validSession.userId, [id]);
    return NextResponse.json({
      message: 'Reprocessamento executado',
      result,
    });

  } catch (error) {
    console.error('Erro no reprocessamento de leituras:', error);
    return NextResponse.json({ 
      error: 'Erro ao reprocessar leituras',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
