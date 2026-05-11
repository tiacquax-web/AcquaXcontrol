import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { serverError } from '@/lib/safeError';

interface PilotConfigBody {
  complexId?: string;
  deviceIds?: string[];
  replaceDeviceSelection?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = (await req.json()) as PilotConfigBody;

    if (body.complexId) {
      await prisma.complex.updateMany({
        where: { deletedAt: null },
        data: { pilotMode: false },
      });
      await prisma.complex.update({
        where: { id: body.complexId },
        data: { pilotMode: true },
      });
    }

    if (body.deviceIds?.length) {
      if (body.replaceDeviceSelection) {
        await prisma.iotDevice.updateMany({
          where: { deletedAt: null },
          data: { pilotMode: false },
        });
      }

      await prisma.iotDevice.updateMany({
        where: {
          deletedAt: null,
          OR: [{ id: { in: body.deviceIds } }, { deviceId: { in: body.deviceIds } }],
        },
        data: { pilotMode: true },
      });
    }

    return NextResponse.json({
      message: 'Configuração de piloto atualizada.',
      complexId: body.complexId || null,
      selectedDevices: body.deviceIds?.length || 0,
    });
  } catch (error) {
    return serverError('admin-grouplink-pilot-configure', error);
  }
}
