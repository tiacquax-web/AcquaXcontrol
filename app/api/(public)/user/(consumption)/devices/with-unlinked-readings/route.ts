import { serverError } from '@/lib/safeError';
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { ReadingLinkService } from '@/lib/services/reading-link-service';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;

    console.log('Buscando dispositivos com leituras desvinculadas...');

    // Buscar dispositivos com leituras desvinculadas
    const devices = await ReadingLinkService.getDevicesWithUnlinkedReadings(userId);

    return NextResponse.json({
      devices
    });

  } catch (error) {
    console.error('Erro ao buscar dispositivos com leituras desvinculadas:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
