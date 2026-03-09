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
    const { searchParams } = new URL(req.url);
    
    const take = parseInt(searchParams.get('take') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');
    const deviceId = searchParams.get('deviceId') || undefined;

    console.log('Buscando leituras desvinculadas...', { take, skip, deviceId });

    // Buscar leituras desvinculadas
    const result = await ReadingLinkService.getAllUnlinkedReadings(userId, {
      take,
      skip,
      deviceId
    });

    return NextResponse.json({
      readings: result.readings,
      totalCount: result.totalCount,
      deviceGroups: result.deviceGroups,
      pagination: {
        take,
        skip,
        hasMore: result.totalCount > skip + take
      }
    });

  } catch (error) {
    console.error('Erro ao buscar leituras desvinculadas:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
