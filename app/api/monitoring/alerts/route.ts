/**
 * POST /api/monitoring/alerts
 *
 * Central consolidada de alertas e anomalias de consumo.
 *
 * Retorna, para cada medidor do contexto selecionado, as anomalias detectadas
 * no período informado. Anomalias incluem:
 *   - NEGATIVE_CONSUMPTION : leitura regressiva (delta < 0)
 *   - OUTLIER_HIGH         : consumo muito acima da média (Z-score > sigma)
 *   - OUTLIER_LOW          : consumo muito abaixo da média
 *   - ZERO_CONSUMPTION     : dias consecutivos com delta = 0 (possível falha)
 *
 * Body:
 * {
 *   complexId?:   string
 *   blockId?:     string
 *   apartmentId?: string
 *   companyId?:   string
 *   fromDate:     string  // ISO
 *   toDate:       string  // ISO
 *   sigma?:       number  // default 2
 *   minZeroDays?: number  // dias consecutivos sem consumo para gerar alerta (default 3)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AlertsBody {
  complexId?:   string;
  blockId?:     string;
  apartmentId?: string;
  companyId?:   string;
  fromDate:     string;
  toDate:       string;
  sigma?:       number;
  minZeroDays?: number;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (validSession as any).userId;

    const body: AlertsBody = await req.json();
    const from = new Date(body.fromDate);
    const to   = new Date(body.toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'fromDate ou toDate inválido' }, { status: 400 });
    }

    const sigma       = typeof body.sigma === 'number' ? body.sigma : 2;
    const minZeroDays = typeof body.minZeroDays === 'number' ? body.minZeroDays : 3;

    // ── Buscar medidores acessíveis ao usuário no contexto ───────────────────
    const contexts = await getUserContextsForActionOnEntity(userId, 'reading', 'read');

    // Filtro de medidores pelo contexto fornecido pelo cliente + permissões do usuário
    const meterWhere: any = { deletedAt: null };

    // Contexto explícito do request
    if (body.apartmentId) {
      meterWhere.apartmentId = body.apartmentId;
    } else if (body.blockId) {
      meterWhere.blockId = body.blockId;
    } else if (body.complexId) {
      meterWhere.complexId = body.complexId;
    } else if (body.companyId) {
      meterWhere.companyId = body.companyId;
    }

    // Filtro adicional por permissões do usuário (não-admin)
    if (!contexts.system) {
      const orConditions: any[] = [];
      if (contexts.apartmentIds.length) orConditions.push({ apartmentId: { in: contexts.apartmentIds } });
      if (contexts.blockIds.length)     orConditions.push({ blockId:     { in: contexts.blockIds } });
      if (contexts.complexIds.length)   orConditions.push({ complexId:   { in: contexts.complexIds } });
      if (contexts.companyIds.length)   orConditions.push({ companyId:   { in: contexts.companyIds } });
      if (orConditions.length === 0) {
        return NextResponse.json({ error: 'Sem permissão para acessar leituras.' }, { status: 403 });
      }
      meterWhere.OR = orConditions;
    }

    const meters = await prisma.meter.findMany({
      where: meterWhere,
      select: {
        id: true,
        register: true,
        rotation: true,
        glId: true,
        apartment: {
          select: {
            name: true,
            block: { select: { name: true, complex: { select: { socialName: true } } } },
          },
        },
      },
      take: 500, // segurança
    });

    if (meters.length === 0) {
      return NextResponse.json({ alerts: [], totalAnomalies: 0, metersAnalyzed: 0 });
    }

    const meterIds = meters.map((m) => m.id);
    const meterMap = new Map(meters.map((m) => [m.id, m]));
    const registerToMeterId = new Map(meters.map((m) => [m.register.toUpperCase(), m.id]));
    const registers = meters.map((m) => m.register.toUpperCase());

    // ── Buscar deviceIds vinculados (MeterDeviceLink ativo no período) ────────
    const meterDeviceLinks = await prisma.meterDeviceLink.findMany({
      where: {
        meterId:   { in: meterIds },
        deletedAt: null,
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      select: { meterId: true, deviceId: true },
    });
    const deviceIdToMeterId = new Map<string, string>();
    for (const link of meterDeviceLinks) deviceIdToMeterId.set(link.deviceId, link.meterId);
    const linkedDeviceIds = Array.from(deviceIdToMeterId.keys());

    // ── Buscar leituras do período (3 caminhos em paralelo) ───────────────────
    const baseWhere = { readAt: { gte: from, lte: to }, deletedAt: null };
    const sel = { id: true, meterId: true, deviceId: true, registerName: true, reading: true, readAt: true, isManualReading: true, alerts: true };

    const [byMeterIdReadings, byDeviceIdReadings, byRegisterReadings] = await Promise.all([
      prisma.reading.findMany({ where: { ...baseWhere, meterId: { in: meterIds } }, select: sel, orderBy: { readAt: 'asc' } }),
      linkedDeviceIds.length > 0
        ? prisma.reading.findMany({ where: { ...baseWhere, meterId: null, deviceId: { in: linkedDeviceIds } }, select: sel, orderBy: { readAt: 'asc' } })
        : Promise.resolve([]),
      registers.length > 0
        ? prisma.reading.findMany({ where: { ...baseWhere, meterId: null, deviceId: null, registerName: { in: registers } }, select: sel, orderBy: { readAt: 'asc' } })
        : Promise.resolve([]),
    ]);

    // Normalizar e deduplicar
    const allReadingsMap = new Map<string, any>();
    for (const r of byMeterIdReadings) {
      if (!allReadingsMap.has(r.id)) allReadingsMap.set(r.id, { ...r });
    }
    for (const r of byDeviceIdReadings) {
      if (allReadingsMap.has(r.id)) continue;
      const mid = deviceIdToMeterId.get(r.deviceId ?? '') ?? null;
      if (mid) allReadingsMap.set(r.id, { ...r, meterId: mid });
    }
    for (const r of byRegisterReadings) {
      if (allReadingsMap.has(r.id)) continue;
      const mid = registerToMeterId.get((r.registerName ?? '').toUpperCase()) ?? null;
      if (mid) allReadingsMap.set(r.id, { ...r, meterId: mid });
    }
    const rawReadings = Array.from(allReadingsMap.values());

    // ── Agrupar por medidor ──────────────────────────────────────────────────
    const byMeter: Record<string, typeof rawReadings> = {};
    for (const r of rawReadings) {
      if (!r.meterId) continue;
      if (!byMeter[r.meterId]) byMeter[r.meterId] = [];
      byMeter[r.meterId].push(r);
    }

    // ── Calcular anomalias por medidor ───────────────────────────────────────
    const alertsResult: any[] = [];
    let totalAnomalies = 0;

    for (const meterId of meterIds) {
      const meter = meterMap.get(meterId)!;
      let readings = byMeter[meterId] ?? [];

      // Pegar última leitura por dia (dailyLast)
      const dayMap = new Map<string, typeof rawReadings[0]>();
      for (const r of readings) {
        const day = isoDay(r.readAt);
        const ex = dayMap.get(day);
        if (!ex || r.readAt > ex.readAt) dayMap.set(day, r);
      }
      readings = Array.from(dayMap.values()).sort((a, b) => a.readAt.getTime() - b.readAt.getTime());

      if (readings.length < 2) continue;

      const rotation = meter.rotation || 'Crescente';

      // Calcular deltas
      const deltas: number[] = [];
      for (let i = 1; i < readings.length; i++) {
        const prev = Number(readings[i - 1].reading ?? 0);
        const curr = Number(readings[i].reading ?? 0);
        deltas.push(rotation === 'Decrescente' ? prev - curr : curr - prev);
      }

      // Estatísticas
      const positive = deltas.filter((d) => d > 0);
      const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : null;
      let stdDev: number | null = null;
      if (positive.length >= 3 && avg !== null) {
        const variance = positive.reduce((acc, d) => acc + (d - avg) ** 2, 0) / positive.length;
        stdDev = Math.sqrt(variance);
      }

      // Localização do medidor
      const location = [
        meter.apartment?.block?.complex?.socialName,
        meter.apartment?.block?.name ? `Bloco ${meter.apartment.block.name}` : null,
        meter.apartment?.name ? `Apto ${meter.apartment.name}` : null,
      ].filter(Boolean).join(' › ');

      const meterAnomalies: any[] = [];

      // Anomalias por delta
      for (let i = 1; i < readings.length; i++) {
        const delta = deltas[i - 1];
        const curr  = readings[i];
        const types: string[] = [];

        if (delta < 0) types.push('NEGATIVE_CONSUMPTION');
        if (avg !== null && stdDev !== null) {
          if (delta > avg + sigma * stdDev) types.push('OUTLIER_HIGH');
          if (delta > 0 && delta < avg - sigma * stdDev) types.push('OUTLIER_LOW');
        }

        // Alerta nativo do dispositivo (IoT ou GL via campo alerts)
        if (curr.alerts) {
          try {
            const parsed: string[] = JSON.parse(curr.alerts);
            if (parsed.length) types.push('HAS_ALERT', ...parsed);
          } catch { /* ignora parse error */ }
        }

        if (types.length > 0) {
          meterAnomalies.push({
            readingId: curr.id,
            date:      isoDay(curr.readAt),
            readAt:    curr.readAt.toISOString(),
            delta:     Math.round(delta * 1000) / 1000,
            types,
            isManual:  curr.isManualReading,
          });
        }
      }

      // Alerta de consumo zero consecutivo (possível falha/fuga não detectada)
      let zeroDaysCount = 0;
      let zeroStart: string | null = null;
      for (let i = 1; i < readings.length; i++) {
        const delta = deltas[i - 1];
        if (delta === 0) {
          zeroDaysCount++;
          if (!zeroStart) zeroStart = isoDay(readings[i - 1].readAt);
          if (zeroDaysCount >= minZeroDays) {
            const alreadyAdded = meterAnomalies.some(
              (a) => a.readingId === readings[i].id && a.types.includes('ZERO_CONSUMPTION')
            );
            if (!alreadyAdded) {
              meterAnomalies.push({
                readingId: readings[i].id,
                date:      isoDay(readings[i].readAt),
                readAt:    readings[i].readAt.toISOString(),
                delta:     0,
                types:     ['ZERO_CONSUMPTION'],
                zeroDaysCount,
                zeroStart,
                isManual:  readings[i].isManualReading,
              });
            }
          }
        } else {
          zeroDaysCount = 0;
          zeroStart = null;
        }
      }

      if (meterAnomalies.length > 0) {
        totalAnomalies += meterAnomalies.length;
        alertsResult.push({
          meterId,
          register: meter.register,
          glId:     meter.glId ?? null,
          location,
          totalReadings:   readings.length,
          totalAnomalies:  meterAnomalies.length,
          avgDailyDelta:   avg !== null ? Math.round(avg * 1000) / 1000 : null,
          stdDev:          stdDev !== null ? Math.round(stdDev * 1000) / 1000 : null,
          anomalies: meterAnomalies.sort((a, b) => b.readAt.localeCompare(a.readAt)),
        });
      }
    }

    // Ordenar: mais anomalias primeiro
    alertsResult.sort((a, b) => b.totalAnomalies - a.totalAnomalies);

    return NextResponse.json({
      fromDate:        from.toISOString().slice(0, 10),
      toDate:          to.toISOString().slice(0, 10),
      metersAnalyzed:  meters.length,
      metersWithAlerts: alertsResult.length,
      totalAnomalies,
      sigma,
      totalReadingsFound: rawReadings.length, // diagnóstico: quantas leituras foram encontradas
      alerts: alertsResult,
    });

  } catch (error: any) {
    console.error('[monitoring/alerts] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
