/**
 * POST /api/admin/devices/cleanup
 *
 * Remove (soft-delete) todos os dispositivos IoT que NÃO estão vinculados ao
 * condomínio East Side Méier, mantendo apenas os dispositivos úteis.
 *
 * Estratégia:
 *   - "East Side Méier" é identificado pelo nome do complexo (case-insensitive)
 *   - Dispositivos a manter = IotDevices com MeterDeviceLink apontando para um
 *     Meter cujo Apartment -> Block -> Complex tem nome "east side" ou "eastsider"
 *   - Também mantém dispositivos sem nenhum link (orphans) para não perder dados acidentalmente
 *     → o body pode enviar { deleteOrphans: true } para apagar órfãos também
 *
 * Modos:
 *   GET  → diagnóstico (preview): mostra o que seria deletado sem deletar
 *   POST → executa a limpeza (soft-delete via deletedAt)
 *
 *   Body POST: { dryRun?: boolean, deleteOrphans?: boolean }
 *   dryRun=true  → mesma resposta do GET, não deleta
 *   dryRun=false → executa o soft-delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function handler(req: NextRequest, isGet: boolean): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { default: prisma } = await import('@/lib/prisma');

    // Verifica permissão de sistema (admin/programador)
    const userPerm = await (prisma as any).permission.findFirst({
      where: {
        deletedAt: null,
        userId,
        entity: 'system',
        action: 'create',
      },
    });
    if (!userPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let dryRun = true;
    let deleteOrphans = false;

    if (!isGet) {
      const body = await req.json().catch(() => ({}));
      dryRun = body.dryRun !== false; // default true — só executa se explicitamente false
      deleteOrphans = body.deleteOrphans === true;
    }

    // ── 1. Encontra todos os IotDevices ativos ──────────────────────────────────
    const allDevices = await prisma.iotDevice.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        deviceId: true,
        name: true,
        remoteId: true,
        meterDeviceLinks: {
          where: { deletedAt: null },
          select: {
            id: true,
            meter: {
              select: {
                id: true,
                register: true,
                glId: true,
                apartment: {
                  select: {
                    block: {
                      select: {
                        complex: {
                          select: { id: true, name: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // ── 2. Classifica cada device ───────────────────────────────────────────────
    const eastSiderNames = ['east side', 'eastsider', 'east sider'];

    const toKeep: typeof allDevices = [];
    const toDelete: typeof allDevices = [];
    const orphans: typeof allDevices = [];

    for (const device of allDevices) {
      if (device.meterDeviceLinks.length === 0) {
        orphans.push(device);
        if (deleteOrphans) {
          toDelete.push(device);
        } else {
          toKeep.push(device);
        }
        continue;
      }

      // Verifica se pelo menos um link aponta para um complexo East Side Méier
      const isEastSider = device.meterDeviceLinks.some((link) => {
        const complexName = link.meter?.apartment?.block?.complex?.name ?? '';
        return eastSiderNames.some((n) => complexName.toLowerCase().includes(n));
      });

      if (isEastSider) {
        toKeep.push(device);
      } else {
        toDelete.push(device);
      }
    }

    // ── 3. Preview (diagnóstico) ────────────────────────────────────────────────
    const summary = {
      dryRun,
      totalAtivos: allDevices.length,
      manter: toKeep.length,
      deletar: toDelete.length,
      orphans: orphans.length,
      deleteOrphans,
      dispositivosParaManter: toKeep.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        remoteId: d.remoteId,
        links: d.meterDeviceLinks.length,
        complexos: [...new Set(d.meterDeviceLinks.map(
          (l) => l.meter?.apartment?.block?.complex?.name ?? '?'
        ))],
      })),
      dispositivosParaDeletar: toDelete.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        remoteId: d.remoteId,
        links: d.meterDeviceLinks.length,
        complexos: [...new Set(d.meterDeviceLinks.map(
          (l) => l.meter?.apartment?.block?.complex?.name ?? 'sem link'
        ))],
      })),
    };

    if (dryRun || isGet) {
      return NextResponse.json({ ok: true, preview: true, ...summary });
    }

    // ── 4. Executa soft-delete ──────────────────────────────────────────────────
    const now = new Date();
    const idsToDelete = toDelete.map((d) => d.id);

    if (idsToDelete.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nada para deletar', ...summary });
    }

    await prisma.iotDevice.updateMany({
      where: { id: { in: idsToDelete } },
      data: { deletedAt: now },
    });

    return NextResponse.json({
      ok: true,
      executado: true,
      deletados: idsToDelete.length,
      mantidos: toKeep.length,
      ...summary,
    });
  } catch (error: any) {
    console.error('[devices/cleanup]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handler(req, true);
}

export async function POST(req: NextRequest) {
  return handler(req, false);
}
