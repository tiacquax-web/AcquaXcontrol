import { serverError } from '@/lib/safeError';
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { DeviceManagementService } from '@/lib/services/device-management-service';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = validSession.userId;
    const body = await req.json();

    // Validar dados obrigatórios
    if (!body.meterId || !body.deviceId || !body.startDate) {
      return NextResponse.json({
        error: 'Dados obrigatórios: meterId, deviceId, startDate'
      }, { status: 400 });
    }

    const linkData = {
      meterId: body.meterId,
      deviceId: body.deviceId,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined
    };

    console.log('Criando link meter-device...', linkData);

    // Criar o link
    const result = await DeviceManagementService.createMeterDeviceLink(userId, linkData);

    if (!result.success) {
      return NextResponse.json({
        error: result.error || 'Erro ao criar link'
      }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Link criado com sucesso',
      linkId: result.linkId
    }, { status: 201 });

  } catch (error) {
    console.error('Erro ao criar link meter-device:', error);
    
    return NextResponse.json({
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
