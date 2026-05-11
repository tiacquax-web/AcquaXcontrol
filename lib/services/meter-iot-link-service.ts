import prisma from '@/lib/prisma';

export async function syncExplicitMeterDeviceLink(params: {
  meterId: string;
  userId: string;
  deviceIdIoT?: string | null;
}): Promise<{
  meterId: string;
  deviceIdIoT: string | null;
  linked: boolean;
  message: string;
}> {
  const meter = await prisma.meter.findUnique({
    where: { id: params.meterId },
    select: {
      id: true,
      deviceIdIoT: true,
    },
  });

  if (!meter) {
    throw new Error('Medidor não encontrado para sincronização IoT.');
  }

  const explicitDeviceId = (params.deviceIdIoT || '').trim();

  if (!explicitDeviceId) {
    const previous = meter.deviceIdIoT;
    await prisma.meter.update({
      where: { id: meter.id },
      data: { deviceIdIoT: null },
    });

    if (previous) {
      await prisma.meterDeviceLink.updateMany({
        where: {
          meterId: meter.id,
          deviceId: previous,
          deletedAt: null,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        data: {
          deletedAt: new Date(),
          endDate: new Date(),
          updatedByUserId: params.userId,
        },
      });
    }

    return {
      meterId: meter.id,
      deviceIdIoT: null,
      linked: false,
      message: 'Vínculo explícito removido do medidor.',
    };
  }

  const conflictingMeter = await prisma.meter.findFirst({
    where: {
      id: { not: meter.id },
      deviceIdIoT: explicitDeviceId,
      deletedAt: null,
    },
    select: { id: true, register: true },
  });
  if (conflictingMeter) {
    throw new Error(
      `O device ${explicitDeviceId} já está vinculado explicitamente ao medidor ${conflictingMeter.register}.`,
    );
  }

  const iotDevice = await prisma.iotDevice.findFirst({
    where: { deviceId: explicitDeviceId, deletedAt: null },
    select: { id: true, deviceId: true },
  });

  if (!iotDevice) {
    await prisma.iotDevice.create({
      data: {
        deviceId: explicitDeviceId,
        remoteId: explicitDeviceId,
      },
    });
  }

  const conflictingLink = await prisma.meterDeviceLink.findFirst({
    where: {
      deviceId: explicitDeviceId,
      meterId: { not: meter.id },
      deletedAt: null,
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
    select: { id: true, meterId: true },
  });

  if (conflictingLink) {
    throw new Error(`O device ${explicitDeviceId} já possui vínculo ativo em outro medidor.`);
  }

  const activeLink = await prisma.meterDeviceLink.findFirst({
    where: {
      meterId: meter.id,
      deviceId: explicitDeviceId,
      deletedAt: null,
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
    select: { id: true },
  });

  if (!activeLink) {
    await prisma.meterDeviceLink.create({
      data: {
        meterId: meter.id,
        deviceId: explicitDeviceId,
        startDate: new Date(),
        createdByUserId: params.userId,
      },
    });
  }

  await prisma.meter.update({
    where: { id: meter.id },
    data: { deviceIdIoT: explicitDeviceId },
  });

  return {
    meterId: meter.id,
    deviceIdIoT: explicitDeviceId,
    linked: true,
    message: 'Vínculo explícito sincronizado com sucesso.',
  };
}
