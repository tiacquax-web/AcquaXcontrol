import { serverError } from '@/lib/safeError';
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getAllUnlinkedReadings } from '@/lib/userData';

function getQueryParams(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id') || undefined;
  const remoteId = req.nextUrl.searchParams.get('remote_id') || undefined;
  const dateFrom = req.nextUrl.searchParams.get('date_from') 
    ? new Date(req.nextUrl.searchParams.get('date_from')!) 
    : undefined;
  const dateTo = req.nextUrl.searchParams.get('date_to') 
    ? new Date(req.nextUrl.searchParams.get('date_to')!) 
    : undefined;
  const take = parseInt(req.nextUrl.searchParams.get('take') || '50');
  const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');

  return { deviceId, remoteId, dateFrom, dateTo, take, skip };
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const { deviceId, remoteId, dateFrom, dateTo, take, skip } = getQueryParams(req);

    console.log('Buscando leituras não vinculadas...', { deviceId, remoteId, dateFrom, dateTo, take, skip });

    // Usar função do userData.ts que já faz todas as validações
    const result = await getAllUnlinkedReadings(userId, { deviceId, take, skip });

    if (result.error) {
      return NextResponse.json({
        error: result.error
      }, { status: result.status });
    }

    return NextResponse.json({
      readings: result.readings,
      total: result.totalCount,
      deviceGroups: result.deviceGroups,
      pagination: {
        take,
        skip,
        hasMore: result.totalCount > skip + take
      }
    });

  } catch (error) {
    console.error('Erro ao buscar leituras não vinculadas:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
