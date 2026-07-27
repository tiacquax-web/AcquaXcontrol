"use client"
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Activity, Wifi, TrendingUp, TrendingDown, Droplets, ChevronRight } from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, subDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMeters } from '@/hooks/useMeters'
import Link from 'next/link'

interface MonitoringReading {
  readingId: string
  meterId: string
  register: string
  date: string
  readAt: string
  value: number | string
  alerts: string[]
}

interface MeterData {
  meterId: string
  register: string
  readings: MonitoringReading[]
  stats?: {
    totalConsumed: number
    avgDelta: number | null
    alertCount: number
    anomalies: Array<{ readingId: string; readAt: string; delta: number; anomalyTypes: string[] }>
  }
}

export default function ResidentMonitoringCard({ apartmentId }: { apartmentId: string }) {
  const [loading, setLoading] = useState(true)
  const [metersData, setMetersData] = useState<MeterData[]>([])
  const [error, setError] = useState<string | null>(null)

  const { meters, loading: metersLoading } = useMeters({
    apartmentId,
    take: 20,
    enabled: !!apartmentId,
    withApartment: true,
    withBlock: true,
  })

  const glMeters = useMemo(() => meters.filter(m => !!(m as any).glId), [meters])
  const hasGL = glMeters.length > 0

  useEffect(() => {
    if (metersLoading) return
    if (glMeters.length === 0) {
      setMetersData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const fromDate = subDays(new Date(), 30)
    const toDate = new Date()

    fetch('/api/monitoring/readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        meterIds: glMeters.map(m => m.id),
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        mode: 'dailyLast',
        view: 'cumulative',
        includeStats: true,
        outlierSigma: 2,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error('Falha ao buscar leituras')
        return r.json()
      })
      .then(data => {
        setMetersData(data.meters || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [metersLoading, glMeters.length])

  // ALL hooks must be called before any early return — React rules of hooks
  const chartData = useMemo(() => {
    if (metersData.length === 0) return []
    const dateMap: Record<string, any> = {}
    metersData.forEach(m => {
      m.readings.forEach(r => {
        const key = r.date
        if (!dateMap[key]) {
          dateMap[key] = { date: key, timestamp: r.readAt }
        }
        const val = typeof r.value === 'number' ? Number(r.value.toFixed(3)) : r.value
        dateMap[key][m.meterId] = val
      })
    })
    return Object.values(dateMap).sort((a: any, b: any) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    )
  }, [metersData])

  const meterColors = useMemo(() => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
    return metersData.reduce((acc, m, i) => {
      acc[m.meterId] = colors[i % colors.length]
      return acc
    }, {} as Record<string, string>)
  }, [metersData])

  const allAlerts = useMemo(() => {
    const alerts: Array<{ meterId: string; register: string; readAt: string; alerts: string[]; delta?: number }> = []
    metersData.forEach(m => {
      if (m.stats?.anomalies) {
        m.stats.anomalies.forEach(a => {
          alerts.push({
            meterId: m.meterId,
            register: m.register,
            readAt: a.readAt,
            alerts: a.anomalyTypes,
            delta: a.delta,
          })
        })
      }
    })
    return alerts.sort((a, b) => b.readAt.localeCompare(a.readAt)).slice(0, 6)
  }, [metersData])

  const totalConsumed = metersData.reduce((sum, m) => sum + (m.stats?.totalConsumed || 0), 0)
  const totalAlerts = metersData.reduce((sum, m) => sum + (m.stats?.alertCount || 0), 0)
  const totalAnomalies = metersData.reduce((sum, m) => sum + (m.stats?.anomalies?.length || 0), 0)

  // Early returns — AFTER all hooks
  if (!metersLoading && !hasGL) return null

  if (loading || metersLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Monitoramento em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
          <div className="flex gap-3 mt-3">
            <Skeleton className="h-16 flex-1" />
            <Skeleton className="h-16 flex-1" />
            <Skeleton className="h-16 flex-1" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-500" />
            Monitoramento em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">Erro ao carregar: {error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <Activity className="w-5 h-5 text-blue-600" />
          <CardTitle className="text-base font-semibold">Monitoramento em Tempo Real</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            <Wifi className="w-2.5 h-2.5 mr-1" />
            {glMeters.length} medidor{glMeters.length !== 1 ? 'es' : ''} GL
          </Badge>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/monitoring" className="flex items-center gap-1 text-xs">
            Ver detalhes <ChevronRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-[10px] text-muted-foreground">Consumo 30d</p>
            </div>
            <p className="text-lg font-bold text-blue-600">{totalConsumed.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">m³</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-[10px] text-muted-foreground">Alertas</p>
            </div>
            <p className="text-lg font-bold text-amber-600">{totalAlerts}</p>
            <p className="text-[10px] text-muted-foreground">registro{totalAlerts !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="w-3.5 h-3.5 text-red-400" />
              <p className="text-[10px] text-muted-foreground">Anomalias</p>
            </div>
            <p className="text-lg font-bold text-red-600">{totalAnomalies}</p>
            <p className="text-[10px] text-muted-foreground">detectada{totalAnomalies !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Gráfico */}
        {chartData.length > 0 ? (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  {metersData.map(m => (
                    <linearGradient key={m.meterId} id={`grad-${m.meterId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={meterColors[m.meterId]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={meterColors[m.meterId]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => {
                    try { return format(parseISO(d), 'dd/MM') } catch { return d }
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  labelFormatter={(d) => {
                    try { return format(parseISO(String(d)), 'dd/MM/yyyy', { locale: ptBR }) } catch { return d }
                  }}
                  formatter={(value: number, name: string) => {
                    const meter = metersData.find(m => m.meterId === name)
                    return [`${Number(value).toFixed(3)} m³`, meter?.register || name]
                  }}
                />
                {metersData.map(m => (
                  <Area
                    key={m.meterId}
                    type="monotone"
                    dataKey={m.meterId}
                    stroke={meterColors[m.meterId]}
                    strokeWidth={2}
                    fill={`url(#grad-${m.meterId})`}
                    name={m.meterId}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-3 mt-2 px-2">
              {metersData.map(m => (
                <div key={m.meterId} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: meterColors[m.meterId] }} />
                  <span className="text-muted-foreground">{m.register}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Sem leituras nos últimos 30 dias</p>
          </div>
        )}

        {/* Alertas */}
        {allAlerts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Alertas Recentes</h3>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {allAlerts.map((alert, i) => {
                const isNegative = alert.alerts.includes('NEGATIVE_CONSUMPTION')
                const isOutlierHigh = alert.alerts.includes('OUTLIER_HIGH')
                const isOutlierLow = alert.alerts.includes('OUTLIER_LOW')
                const isDeviceAlert = alert.alerts.includes('HAS_ALERT')
                return (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                    <div className="shrink-0">
                      {isNegative && <TrendingDown className="w-4 h-4 text-red-500" />}
                      {isOutlierHigh && <TrendingUp className="w-4 h-4 text-orange-500" />}
                      {isOutlierLow && <TrendingDown className="w-4 h-4 text-blue-500" />}
                      {isDeviceAlert && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alert.register}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {isNegative ? 'Consumo negativo' : isOutlierHigh ? 'Pico alto' : isOutlierLow ? 'Baixo consumo' : 'Alerta dispositivo'}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {format(parseISO(alert.readAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        {alert.delta != null && ` · Δ ${alert.delta.toFixed(3)} m³`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
