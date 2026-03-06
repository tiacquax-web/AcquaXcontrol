import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { DeviceManagementService } from '@/lib/services/device-management-service';

function getQueryParams(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id') || undefined;
  const remoteId = req.nextUrl.searchParams.get('remote_id') || undefined;
  const hasActiveLink = req.nextUrl.searchParams.get('has_active_link');
  const take = parseInt(req.nextUrl.searchParams.get('take') || '50');
  const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');

  return { 
    deviceId, 
    remoteId, 
    hasActiveLink: hasActiveLink ? hasActiveLink === 'true' : undefined,
    take, 
    skip 
  };
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
    const { deviceId, remoteId, hasActiveLink, take, skip } = getQueryParams(req);

    console.log('Buscando devices...', { deviceId, remoteId, hasActiveLink, take, skip });

    // Buscar devices com status
    const result = await DeviceManagementService.findDevicesWithStatus(userId, {
      deviceId,
      remoteId,
      hasActiveLink,
      take,
      skip
    });

    return NextResponse.json({
      devices: result.devices,
      total: result.total,
      pagination: {
        take,
        skip,
        hasMore: result.total > skip + take
      }
    });

  } catch (error) {
    console.error('Erro ao buscar devices:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
