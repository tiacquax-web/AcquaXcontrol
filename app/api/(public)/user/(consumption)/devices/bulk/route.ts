import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import prisma from '@/lib/prisma';
import { GrouplinkOperationalService } from '@/lib/services/grouplink-operational-service';
import FastReadingReprocessService from '@/lib/services/reading-fast-reprocess-service';
import { logAdminAction } from '@/lib/services/admin-audit-service';

type BulkAction =
  | 'delete_selected'
  | 'set_pilot_mode'
  | 'unlink_selected'
  | 'reprocess_selected'
  | 'cleanup_unlinked';

interface BulkRequestBody {
  action: BulkAction;
  ids?: string[];
  deviceIds?: string[];
  pilotMode?: boolean;
  onlyPilot?: boolean;
  onlyWithoutReadings?: boolean;
  olderThanDays?: number;
  confirmationText?: string;
}

async function resolveDeviceIds(ids?: string[], deviceIds?: string[]): Promise<string[]> {
  if (deviceIds?.length) return deviceIds;
  if (!ids?.length) return [];

  const devices = await prisma.iotDevice.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { deviceId: true },
  });
  return devices.map((d) => d.deviceId);
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = (await req.json()) as BulkRequestBody;
    if (!body?.action) {
      return NextResponse.json({ error: 'Ação não informada.' }, { status: 400 });
    }

    if (body.action === 'delete_selected') {
      if (body.confirmationText !== 'EXCLUIR') {
        return NextResponse.json(
          { error: 'Confirmação dupla inválida. Envie confirmationText="EXCLUIR".' },
          { status: 400 },
        );
      }
      const result = await GrouplinkOperationalService.bulkDeleteDevices({
        ids: body.ids,
        deviceIds: body.deviceIds,
      });
      await logAdminAction({
        userId: validSession.userId,
        action: 'iot_bulk_delete_devices',
        status: 'success',
        requestPayload: {
          ids: body.ids,
          deviceIds: body.deviceIds,
        },
        responseSummary: result as unknown as Record<string, unknown>,
      });
      return NextResponse.json({ message: 'Dispositivos removidos em lote.', result });
    }

    if (body.action === 'cleanup_unlinked') {
      const result = await GrouplinkOperationalService.bulkDeleteDevices({
        onlyUnlinked: true,
        onlyPilot: body.onlyPilot,
        onlyWithoutReadings: body.onlyWithoutReadings ?? true,
        olderThanDays: body.olderThanDays,
      });
      return NextResponse.json({ message: 'Limpeza de dispositivos desvinculados concluída.', result });
    }

    if (body.action === 'set_pilot_mode') {
      const where: any = { deletedAt: null };
      if (body.ids?.length) where.id = { in: body.ids };
      if (body.deviceIds?.length) where.deviceId = { in: body.deviceIds };
      if (!where.id && !where.deviceId) {
        return NextResponse.json({ error: 'Nenhum dispositivo selecionado.' }, { status: 400 });
      }
      const updated = await prisma.iotDevice.updateMany({
        where,
        data: { pilotMode: body.pilotMode === true },
      });
      return NextResponse.json({
        message: `Modo piloto ${body.pilotMode ? 'ativado' : 'desativado'} para os dispositivos selecionados.`,
        updated: updated.count,
      });
    }

    if (body.action === 'unlink_selected') {
      const selectedDeviceIds = await resolveDeviceIds(body.ids, body.deviceIds);
      if (!selectedDeviceIds.length) {
        return NextResponse.json({ error: 'Nenhum dispositivo selecionado.' }, { status: 400 });
      }

      const now = new Date();
      const [links, meters] = await Promise.all([
        prisma.meterDeviceLink.updateMany({
          where: {
            deviceId: { in: selectedDeviceIds },
            deletedAt: null,
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
          data: {
            deletedAt: now,
            endDate: now,
            updatedByUserId: validSession.userId,
          },
        }),
        prisma.meter.updateMany({
          where: { deviceIdIoT: { in: selectedDeviceIds }, deletedAt: null },
          data: { deviceIdIoT: null },
        }),
      ]);

      return NextResponse.json({
        message: 'Dispositivos desvinculados com sucesso.',
        linksUpdated: links.count,
        metersUpdated: meters.count,
      });
    }

    if (body.action === 'reprocess_selected') {
      const selectedDeviceIds = await resolveDeviceIds(body.ids, body.deviceIds);
      if (!selectedDeviceIds.length) {
        return NextResponse.json({ error: 'Nenhum dispositivo selecionado.' }, { status: 400 });
      }

      const result = await FastReadingReprocessService.fastReprocessDevices(validSession.userId, selectedDeviceIds);
      return NextResponse.json({
        message: 'Reprocessamento executado.',
        result,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em ação bulk de dispositivos:', error);
    return NextResponse.json(
      {
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
