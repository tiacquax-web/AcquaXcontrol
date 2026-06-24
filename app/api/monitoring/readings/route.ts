import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isSessionValid } from '@/lib/users'
import { PermissionAction, PermissionableEntity } from '@prisma/client'
import { userHasPermission } from '@/lib/userContexts'

/*
  POST /api/monitoring/readings
  Body:
  {
    meterIds: string[]
    fromDate: string (ISO)
    toDate: string (ISO)
    mode?: 'raw' | 'dailyLast'
    view?: 'cumulative' | 'simple'
    alertsOnly?: boolean
    includeStats?: boolean
    outlierSigma?: number (default 2)
  }

  Estratégia de busca de leituras (3 caminhos):
  1. meterId direto     — leituras manuais e GL já vinculadas
  2. deviceId via link  — leituras IoT cujo device tem MeterDeviceLink ativo no período
  3. registerName       — fallback: leituras salvas com registerName = chassi do medidor
     (cobre casos de importação IoT antiga sem deviceId correto)
*/

interface MonitoringRequestBody {
  meterIds: string[]
  fromDate: string
  toDate: string
  mode?: 'raw' | 'dailyLast'
  view?: 'cumulative' | 'simple'
  alertsOnly?: boolean
  includeStats?: boolean
  outlierSigma?: number
}

function isoDay(d: Date) { return d.toISOString().split('T')[0] }

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('session')?.value
    const validSession = session ? await isSessionValid(session) : false
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const userId = validSession.userId

    const allowed = await userHasPermission(userId, PermissionableEntity.monitoringDashboard, PermissionAction.read)
    if (!allowed) return NextResponse.json({ error: 'Proibido' }, { status: 403 })

    const body: MonitoringRequestBody = await req.json()
    if (!body.meterIds || body.meterIds.length === 0) {
      return NextResponse.json({ error: 'meterIds é obrigatório' }, { status: 400 })
    }

    const from = new Date(body.fromDate)
    const to   = new Date(body.toDate)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'fromDate ou toDate inválido' }, { status: 400 })
    }

    const mode         = body.mode         || 'dailyLast'
    const view         = body.view         || 'cumulative'
    const alertsOnly   = body.alertsOnly   || false
    const includeStats = body.includeStats !== false
    const sigma        = body.outlierSigma || 2

    // ── 1. Busca metadados dos medidores ────────────────────────────────────────
    const meters = await prisma.meter.findMany({
      where: { id: { in: body.meterIds }, deletedAt: null },
      select: { id: true, register: true, rotation: true }
    })
    if (meters.length === 0) return NextResponse.json({ meters: [], distinctAlerts: [] })

    const meterById          = new Map(meters.map(m => [m.id, m]))
    const registerToMeterId  = new Map(meters.map(m => [m.register.toUpperCase(), m.id]))
    const registers          = meters.map(m => m.register.toUpperCase())

    // ── 2. Busca deviceIds vinculados (MeterDeviceLink ativo no período) ────────
    const meterDeviceLinks = await prisma.meterDeviceLink.findMany({
      where: {
        meterId: { in: body.meterIds },
        deletedAt: null,
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }]
      },
      select: { meterId: true, deviceId: true, startDate: true, endDate: true }
    })

    // Map: deviceId → meterId (para enriquecer leituras por deviceId)
    const deviceIdToMeterId = new Map<string, string>()
    for (const link of meterDeviceLinks) {
      deviceIdToMeterId.set(link.deviceId, link.meterId)
    }
    const linkedDeviceIds = Array.from(deviceIdToMeterId.keys())

    // ── 3. Busca leituras (3 caminhos em paralelo) ──────────────────────────────
    const baseWhere = {
      readAt:    { gte: from, lte: to },
      deletedAt: null,
      ...(alertsOnly ? { alerts: { not: null } } : {})
    }
    const readingSelect = {
      id: true, meterId: true, deviceId: true, registerName: true,
      reading: true, readAt: true, isManualReading: true, alerts: true,
    }

    const [byMeterIdRows, byDeviceIdRows, byRegisterNameRows] = await Promise.all([
      // Caminho 1: meterId
      prisma.reading.findMany({
        where: { ...baseWhere, meterId: { in: body.meterIds } },
        select: readingSelect,
        orderBy: { readAt: 'asc' }
      }),
      // Caminho 2: deviceId via link
      linkedDeviceIds.length > 0
        ? prisma.reading.findMany({
            where: { ...baseWhere, meterId: null, deviceId: { in: linkedDeviceIds } },
            select: readingSelect,
            orderBy: { readAt: 'asc' }
          })
        : Promise.resolve([]),
      // Caminho 3: registerName = chassi do medidor (fallback)
      registers.length > 0
        ? prisma.reading.findMany({
            where: { ...baseWhere, meterId: null, deviceId: null, registerName: { in: registers } },
            select: readingSelect,
            orderBy: { readAt: 'asc' }
          })
        : Promise.resolve([])
    ])

    // ── 4. Normalizar e deduplicar ──────────────────────────────────────────────
    const allReadingsMap = new Map<string, any>()

    for (const r of byMeterIdRows) {
      if (!allReadingsMap.has(r.id)) allReadingsMap.set(r.id, { ...r })
    }
    for (const r of byDeviceIdRows) {
      if (allReadingsMap.has(r.id)) continue
      const mid = deviceIdToMeterId.get(r.deviceId ?? '') ?? null
      if (mid) allReadingsMap.set(r.id, { ...r, meterId: mid })
    }
    for (const r of byRegisterNameRows) {
      if (allReadingsMap.has(r.id)) continue
      const mid = registerToMeterId.get((r.registerName ?? '').toUpperCase()) ?? null
      if (mid) allReadingsMap.set(r.id, { ...r, meterId: mid })
    }

    // Enriquecer com dados do meter (register + rotation)
    const allReadings = Array.from(allReadingsMap.values()).map(r => ({
      ...r,
      meter: meterById.get(r.meterId) ?? { register: r.registerName ?? r.deviceId ?? '', rotation: 'Crescente' }
    }))

    // ── 5. Agrupar por meterId ──────────────────────────────────────────────────
    const byMeter: Record<string, any[]> = {}
    for (const r of allReadings) {
      if (!r.meterId) continue
      if (!byMeter[r.meterId]) byMeter[r.meterId] = []
      byMeter[r.meterId].push(r)
    }

    // ── 6. Calcular séries e estatísticas ───────────────────────────────────────
    const metersResult: any[] = []
    const distinctAlertsSet = new Set<string>()

    for (const meterId of Object.keys(byMeter)) {
      let readings = byMeter[meterId]

      if (mode === 'dailyLast') {
        const map = new Map<string, any>()
        readings.forEach(r => {
          const day = isoDay(r.readAt)
          const ex = map.get(day)
          if (!ex || r.readAt > ex.readAt) map.set(day, r)
        })
        readings = Array.from(map.values()).sort((a, b) => a.readAt.getTime() - b.readAt.getTime())
      }

      if (readings.length === 0) continue

      // Parse alerts
      readings = readings.map(r => {
        let parsedAlerts: string[] = []
        if (r.alerts) { try { parsedAlerts = JSON.parse(r.alerts) } catch { parsedAlerts = [] } }
        parsedAlerts.forEach(a => distinctAlertsSet.add(a))
        return { ...r, alertsArr: parsedAlerts }
      })

      const rotation = readings[0].meter?.rotation || 'Crescente'

      // Deltas
      const deltas: number[] = []
      for (let i = 1; i < readings.length; i++) {
        const prev = Number(readings[i - 1].reading ?? 0)
        const curr = Number(readings[i].reading   ?? 0)
        deltas.push(rotation === 'Decrescente' ? prev - curr : curr - prev)
      }

      // Estatísticas
      let stats: any = null
      if (includeStats) {
        const positive = deltas.filter(d => d > 0)
        const negative = deltas.filter(d => d < 0)
        const totalConsumed = rotation === 'Decrescente'
          ? Number(readings[0].reading ?? 0) - Number(readings[readings.length - 1].reading ?? 0)
          : Number(readings[readings.length - 1].reading ?? 0) - Number(readings[0].reading ?? 0)
        const avgDelta = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : null
        let stdDev: number | null = null
        if (positive.length >= 3 && avgDelta !== null) {
          const variance = positive.reduce((acc, d) => acc + (d - avgDelta) ** 2, 0) / positive.length
          stdDev = Math.sqrt(variance)
        }

        const anomalies: any[] = []
        for (let i = 1; i < readings.length; i++) {
          const delta = deltas[i - 1]
          const base  = readings[i]
          const types: string[] = []
          if (delta < 0) types.push('NEGATIVE_CONSUMPTION')
          if (stdDev !== null && avgDelta !== null) {
            if (delta > avgDelta + sigma * stdDev) types.push('OUTLIER_HIGH')
            if (delta > 0 && delta < avgDelta - sigma * stdDev) types.push('OUTLIER_LOW')
          }
          if (base.alertsArr.length) types.push('HAS_ALERT', ...base.alertsArr)
          if (types.length) anomalies.push({ readingId: base.id, readAt: base.readAt, delta, anomalyTypes: types })
        }

        stats = {
          totalConsumed,
          avgDelta,
          minDelta: positive.length ? Math.min(...positive) : null,
          maxDelta: positive.length ? Math.max(...positive) : null,
          stdDev,
          negativeCount: negative.length,
          alertCount: readings.filter(r => r.alertsArr.length).length,
          anomalies
        }
      }

      const register = readings[0].meter?.register ?? ''
      const seriesData = readings.map((r, idx) => ({
        readingId: r.id,
        meterId,
        register,
        date:     mode === 'raw' ? r.readAt.toISOString() : isoDay(r.readAt),
        readAt:   r.readAt.toISOString(),
        value:    view === 'cumulative' ? Number(r.reading ?? 0) : (idx === 0 ? '-' : deltas[idx - 1]),
        alerts:   r.alertsArr,
        isManualReading: r.isManualReading,
      }))

      metersResult.push({ meterId, register, rotation, readings: seriesData, stats })
    }

    return NextResponse.json({
      meters: metersResult,
      distinctAlerts: Array.from(distinctAlertsSet)
    })

  } catch (error: any) {
    console.error('Erro em /api/monitoring/readings', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
