import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isSessionValid } from '@/lib/users'
import { PermissionAction, PermissionableEntity } from '@prisma/client'
import { userHasPermission } from '@/lib/userContexts'

/*
  Fase 1 - Endpoint de agregação para dashboard de monitoramento de leituras.
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
    const to = new Date(body.toDate)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'fromDate ou toDate inválido' }, { status: 400 })
    }

    const mode = body.mode || 'dailyLast'
    const view = body.view || 'cumulative'
    const alertsOnly = body.alertsOnly || false
    const includeStats = body.includeStats !== false // default true
    const sigma = body.outlierSigma || 2

    // Busca dados dos medidores solicitados (register + rotation) para poder
    // localizar leituras por registerName quando meterId não estiver preenchido
    const meters = await prisma.meter.findMany({
      where: { id: { in: body.meterIds }, deletedAt: null },
      select: { id: true, register: true, rotation: true }
    })
    const meterById = new Map(meters.map(m => [m.id, m]))
    const registerToMeterId = new Map(meters.map(m => [m.register.toUpperCase(), m.id]))

    // Busca leituras brutas:
    // 1ª tentativa: por meterId (leituras já vinculadas)
    // 2ª tentativa: por registerName (leituras IoT salvas pelo chassi, sem meterId)
    const registers = meters.map(m => m.register.toUpperCase())

    const [byMeterIdReadings, byRegisterReadings] = await Promise.all([
      prisma.reading.findMany({
        where: {
          meterId: { in: body.meterIds },
          readAt: { gte: from, lte: to },
          deletedAt: null,
          ...(alertsOnly ? { alerts: { not: null } } : {})
        },
        select: {
          id: true,
          meterId: true,
          registerName: true,
          reading: true,
          readAt: true,
          isManualReading: true,
          alerts: true,
        },
        orderBy: { readAt: 'asc' }
      }),
      registers.length > 0
        ? prisma.reading.findMany({
            where: {
              meterId: null,          // não vinculada a medidor
              registerName: { in: registers },
              readAt: { gte: from, lte: to },
              deletedAt: null,
              ...(alertsOnly ? { alerts: { not: null } } : {})
            },
            select: {
              id: true,
              meterId: true,
              registerName: true,
              reading: true,
              readAt: true,
              isManualReading: true,
              alerts: true,
            },
            orderBy: { readAt: 'asc' }
          })
        : Promise.resolve([])
    ])

    // Normalizar: para leituras por registerName, mapear ao meterId correspondente
    const normalizedRegisterReadings = byRegisterReadings.map(r => ({
      ...r,
      meterId: registerToMeterId.get((r.registerName ?? '').toUpperCase()) ?? null
    })).filter(r => r.meterId !== null)

    // Juntar as duas listas, deduplicar pelo id da reading
    const allReadingsMap = new Map<string, any>()
    for (const r of [...byMeterIdReadings, ...normalizedRegisterReadings]) {
      if (!r.meterId) continue
      if (!allReadingsMap.has(r.id)) allReadingsMap.set(r.id, r)
    }
    const rawReadings = Array.from(allReadingsMap.values())

    // Enriquecer com register e rotation do meter
    const rawReadingsEnriched = rawReadings.map(r => ({
      ...r,
      meter: meterById.get(r.meterId!) ?? { register: r.registerName ?? '', rotation: 'Crescente' }
    }))

    // Agrupar por meter
    const byMeter: Record<string, any[]> = {}
    rawReadingsEnriched.forEach(r => {
      if (!r.meterId) return
      if (!byMeter[r.meterId]) byMeter[r.meterId] = []
      byMeter[r.meterId].push(r)
    })

    function isoDay(d: Date) { return d.toISOString().split('T')[0] }

    const metersResult: any[] = []
    const distinctAlertsSet = new Set<string>()

    for (const meterId of Object.keys(byMeter)) {
      let readings = byMeter[meterId]

      if (mode === 'dailyLast') {
        // Pegar última leitura do dia
        const map = new Map<string, any>()
        readings.forEach(r => {
          const day = isoDay(r.readAt)
          const existing = map.get(day)
          if (!existing || existing.readAt < r.readAt) {
            map.set(day, r)
          }
        })
        readings = Array.from(map.values()).sort((a, b) => a.readAt.getTime() - b.readAt.getTime())
      }

      if (readings.length === 0) continue

      // Parse alerts para array
      readings = readings.map(r => {
        let parsedAlerts: string[] = []
        if (r.alerts) {
          try { parsedAlerts = JSON.parse(r.alerts) } catch { parsedAlerts = [] }
        }
        parsedAlerts.forEach(a => distinctAlertsSet.add(a))
        return { ...r, alertsArr: parsedAlerts }
      })

      // Calcular deltas (consumo entre leituras)
      let deltas: number[] = []
      const rotation = readings[0].meter.rotation || 'Crescente'
      for (let i = 1; i < readings.length; i++) {
        const prev = readings[i - 1]
        const curr = readings[i]
        const prevVal = Number(prev.reading ?? 0)
        const currVal = Number(curr.reading ?? 0)
        const delta = rotation === 'Decrescente' ? prevVal - currVal : currVal - prevVal
        deltas.push(delta)
      }

      // Estatísticas
      let stats: any = null
      if (includeStats) {
        const positive = deltas.filter(d => d > 0)
        const negative = deltas.filter(d => d < 0)
        const totalConsumed = rotation === 'Decrescente'
          ? (Number(readings[0].reading ?? 0) - Number(readings[readings.length - 1].reading ?? 0))
          : (Number(readings[readings.length - 1].reading ?? 0) - Number(readings[0].reading ?? 0))
        const avgDelta = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : null
        let stdDev: number | null = null
        if (positive.length >= 3 && avgDelta !== null) {
          const variance = positive.reduce((acc, d) => acc + Math.pow(d - avgDelta, 2), 0) / positive.length
          stdDev = Math.sqrt(variance)
        }
        const minDelta = positive.length ? Math.min(...positive) : null
        const maxDelta = positive.length ? Math.max(...positive) : null

        // Identificar anomalias
        const anomalies: any[] = []
        for (let i = 1; i < readings.length; i++) {
          const delta = deltas[i - 1]
          const base = readings[i]
          const anomalyTypes: string[] = []
          if (delta < 0) anomalyTypes.push('NEGATIVE_CONSUMPTION')
          if (stdDev !== null && avgDelta !== null) {
            if (delta > avgDelta + sigma * stdDev) anomalyTypes.push('OUTLIER_HIGH')
            if (delta > 0 && delta < avgDelta - sigma * stdDev) anomalyTypes.push('OUTLIER_LOW')
          }
          if (base.alertsArr.length) {
            anomalyTypes.push('HAS_ALERT', ...base.alertsArr)
          }
          if (anomalyTypes.length) {
            anomalies.push({ readingId: base.id, readAt: base.readAt, delta, anomalyTypes })
          }
        }

        stats = {
          totalConsumed,
          avgDelta,
          minDelta,
          maxDelta,
          stdDev,
          negativeCount: negative.length,
          alertCount: readings.filter(r => r.alertsArr.length).length,
          anomalies
        }
      }

      // Formatar dados para gráfico: dependente do view
      const seriesData = readings.map((r, idx) => {
        const dateKey = mode === 'raw' ? r.readAt.toISOString() : isoDay(r.readAt)
        let value: number | string
        if (view === 'cumulative') {
          value = Number(r.reading ?? 0)
        } else {
          if (idx === 0) value = '-'
          else value = deltas[idx - 1]
        }
        return {
          readingId: r.id,
          meterId,
          register: readings[0].meter.register,
          date: dateKey,
          readAt: r.readAt.toISOString(),
          value,
          alerts: r.alertsArr,
          isManualReading: r.isManualReading,
        }
      })

      metersResult.push({
        meterId,
        register: readings[0].meter.register,
        rotation,
        readings: seriesData,
        stats
      })
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
