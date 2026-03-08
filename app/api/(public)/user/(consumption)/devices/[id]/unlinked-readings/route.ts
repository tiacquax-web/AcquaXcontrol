import { serverError } from '@/lib/safeError';
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUnlinkedReadingsForDevice } from '@/lib/userData';

export async function GET(req: NextRequest,{ params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const { id: deviceId } = await params;
    const { searchParams } = new URL(req.url);
    
    const take = parseInt(searchParams.get('take') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');

    console.log('Buscando leituras desvinculadas para dispositivo...', { deviceId, take, skip });

    // Usar função do userData.ts que já faz todas as validações
    const result = await getUnlinkedReadingsForDevice(userId, deviceId, { take, skip });

    if (result.error) {
      return NextResponse.json({
        error: result.error
      }, { status: result.status });
    }

    return NextResponse.json({
      readings: result.readings,
      totalCount: result.totalCount,
      deviceInfo: result.deviceInfo,
      pagination: {
        take,
        skip,
        hasMore: result.totalCount > skip + take
      }
    });

  } catch (error) {
    console.error('Erro ao buscar leituras desvinculadas do dispositivo:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}