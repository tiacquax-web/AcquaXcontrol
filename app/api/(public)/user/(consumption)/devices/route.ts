import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { DeviceManagementService } from '@/lib/services/device-management-service';
import { cleanEntityBody } from '@/lib/prisma';

function getQueryParams(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id') || undefined;
  const remoteId = req.nextUrl.searchParams.get('remote_id') || undefined;
  const hasActiveLink = req.nextUrl.searchParams.get('has_active_link');
  const hasUnlinkedReadings = req.nextUrl.searchParams.get('has_unlinked_readings');
  const take = parseInt(req.nextUrl.searchParams.get('take') || '50');
  const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');

  return { 
    deviceId, 
    remoteId, 
    hasActiveLink: hasActiveLink ? hasActiveLink === 'true' : undefined,
    hasUnlinkedReadings: hasUnlinkedReadings ? hasUnlinkedReadings === 'true' : undefined,
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
    const { deviceId, remoteId, hasActiveLink, hasUnlinkedReadings, take, skip } = getQueryParams(req);

    console.log('Buscando devices...', { deviceId, remoteId, hasActiveLink, hasUnlinkedReadings, take, skip });

    // Buscar devices com status
    const result = await DeviceManagementService.findDevicesWithStatus(userId, {
      deviceId,
      remoteId,
      hasActiveLink,
      hasUnlinkedReadings,
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
//     if (apartmentId) contextType = ContextType.apartment;
//     else if (blockId) contextType = ContextType.block;
//     else if (complexId) contextType = ContextType.complex;
//     else if (companyId) contextType = ContextType.company;
//     const contextId =
//       contextType === ContextType.apartment
//         ? apartmentId
//         : contextType === ContextType.block
//         ? blockId
//         : contextType === ContextType.complex
//         ? complexId
//         : contextType === ContextType.company
//         ? companyId
//         : undefined;
//     if (!contextType || !contextId)
//       return NextResponse.json({ error: "No valid context was informed." }, { status: 400 });

//     // Busca o consumo do apartamento/medidor
//     let where: any = {};
//     if (apartmentId) where.apartmentId = apartmentId;
//     if (meterId) where.id = meterId;
//     // Filtro de período (exemplo: 2025-06)
//     // Aqui você pode adaptar para buscar por mês/ano, etc.
//     // Exemplo: period = "2025-06"
//     // ...

//     // Busca o medidor e consumo mais recente
//     const meter = await prisma.meter.findFirst({
//       where,
//       include: {
//         Readings: {
//           orderBy: { readAt: "desc" },
//           take: 1,
//         },
//         apartment: true,
//         typeMeter: true,
//       },
//     });
//     if (!meter)
//       return NextResponse.json({ error: "No meter found for the given context." }, { status: 404 });
//     const lastReading = meter.Readings[0];
//     const result = {
//       apartmentId: meter.apartmentId,
//       meterId: meter.id,
//       meterRegister: meter.register,
//       meterType: meter.typeMeter?.name,
//       lastReading: lastReading?.reading,
//       lastReadingDate: lastReading?.readAtDate,
//       unit: "m³",
//       period: period || (lastReading?.monthRef && lastReading?.yearRef ? `${lastReading.monthRef}/${lastReading.yearRef}` : undefined),
//       apartment: meter.apartment?.name,
//     };
//     return NextResponse.json(result);
//   } catch (error: any) {
//     console.error("Error fetching public consumption:", error);
//     return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
//   }
// }

// export async function POST(req: NextRequest): Promise<Response> {
//   try {
//     const reqBody = await req.json();
//     const body = cleanEntityBody(reqBody);
//     if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
//     if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
//     const created = await prisma.iotDevice.create({ data: body });
//     return NextResponse.json(created, { status: 201 });
//   } catch (error: any) {
//     console.error("Error creating device:", error);
//     return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
//   }
// }
