/**
 * GET /api/admin/gl/deep-diagnostics
 *
 * Diagnóstico profundo da integração GL para East Side Méier.
 * Verifica tudo que pode impedir monitoramento de funcionar:
 *   1. Medidores com glId no banco (count + amostra)
 *   2. Readings GL no banco (count, período, amostras)
 *   3. O que a query de monitoramento retornaria para os 5 primeiros meters
 *   4. MeterDeviceLinks existentes
 *   5. IotDevices existentes (count)
 *   6. Últimas 10 leituras de qualquer tipo
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { default: prisma } = await import('@/lib/prisma');

    // ── 1. Medidores East Side Méier com glId ───────────────────────────────────
    const eastSiderMeters = await prisma.meter.findMany({
      where: {
        deletedAt: null,
        glId: { not: null },
        apartment: {
          block: {
            complex: {
              name: { contains: 'east', mode: 'insensitive' },
            },
          },
        },
      },
      select: {
        id: true,
        register: true,
        glId: true,
        apartment: {
          select: {
            name: true,
            block: {
              select: {
                name: true,
                complex: { select: { name: true } },
              },
            },
          },
        },
      },
      take: 20,
    });

    const allEastSiderMeterIds = await prisma.meter.findMany({
      where: {
        deletedAt: null,
        glId: { not: null },
        apartment: {
          block: {
            complex: {
              name: { contains: 'east', mode: 'insensitive' },
            },
          },
        },
      },
      select: { id: true },
    }).then((ms) => ms.map((m) => m.id));

    // ── 2. Readings GL ──────────────────────────────────────────────────────────
    const totalGlReadings = await prisma.reading.count({
      where: {
        deletedAt: null,
        meterId: { in: allEastSiderMeterIds },
      },
    });

    const latestGlReadings = await prisma.reading.findMany({
      where: {
        deletedAt: null,
        meterId: { in: allEastSiderMeterIds },
      },
      orderBy: { readAt: 'desc' },
      take: 10,
      select: {
        id: true,
        meterId: true,
        reading: true,
        readAt: true,
        readAtDate: true,
        registerName: true,
        remoteId: true,
        monthRef: true,
        yearRef: true,
        isManualReading: true,
      },
    });

    const oldestGlReading = await prisma.reading.findFirst({
      where: {
        deletedAt: null,
        meterId: { in: allEastSiderMeterIds },
      },
      orderBy: { readAt: 'asc' },
      select: { readAt: true, meterId: true },
    });

    // ── 3. Readings por qualquer via (sem filtro de meterId) ────────────────────
    // Conta TODAS as leituras no banco (para debug)
    const totalAllReadings = await prisma.reading.count({
      where: { deletedAt: null },
    });

    const latestAnyReadings = await prisma.reading.findMany({
      where: { deletedAt: null },
      orderBy: { readAt: 'desc' },
      take: 10,
      select: {
        id: true,
        meterId: true,
        deviceId: true,
        registerName: true,
        reading: true,
        readAt: true,
        isManualReading: true,
      },
    });

    // ── 4. MeterDeviceLinks ─────────────────────────────────────────────────────
    const meterDeviceLinks = await prisma.meterDeviceLink.findMany({
      where: { deletedAt: null },
      take: 20,
      select: {
        id: true,
        deviceId: true,
        meterId: true,
        startDate: true,
        endDate: true,
        meter: { select: { register: true, glId: true } },
      },
    });

    // ── 5. IotDevices ───────────────────────────────────────────────────────────
    const totalIotDevices = await prisma.iotDevice.count({
      where: { deletedAt: null },
    });

    const sampleIotDevices = await prisma.iotDevice.findMany({
      where: { deletedAt: null },
      take: 10,
      select: {
        id: true,
        deviceId: true,
        name: true,
        remoteId: true,
        lastReading: true,
        lastSeenDate: true,
      },
    });

    // ── 6. Todos os condomínios (para verificar o nome) ─────────────────────────
    const complexes = await prisma.complex.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    // ── Resposta ─────────────────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      condomínios: complexes,
      eastSiderMeters: {
        total: allEastSiderMeterIds.length,
        amostra: eastSiderMeters,
      },
      readingsGL: {
        total: totalGlReadings,
        maisRecentes: latestGlReadings,
        maisAntiga: oldestGlReading,
        alerta:
          totalGlReadings === 0
            ? '❌ ZERO readings GL — importação não rodou ou glId não está mapeado corretamente'
            : `✅ ${totalGlReadings} readings GL no banco`,
      },
      todasReadings: {
        total: totalAllReadings,
        maisRecentes: latestAnyReadings,
      },
      meterDeviceLinks: {
        total: meterDeviceLinks.length,
        amostra: meterDeviceLinks,
      },
      iotDevices: {
        total: totalIotDevices,
        amostra: sampleIotDevices,
      },
    });
  } catch (error: any) {
    console.error('[deep-diagnostics]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
