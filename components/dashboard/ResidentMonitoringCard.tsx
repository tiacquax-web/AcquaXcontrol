"use client"
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Activity, Wifi, TrendingUp, TrendingDown, Droplets, ChevronRight } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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
  delta?: number | null
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

const METER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

// Custom dot para o tooltip do Recharts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  let dateLabel = label
  try { dateLabel = format(parseISO(String(label)), 'dd/MM/yyyy', { locale: ptBR }) } catch {}
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold mb-2 text-foreground">{dateLabel}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-foreground">{Number(p.value).toFixed(3)} m³</span>
        </div>
      ))}
    </div>
  )
}

export default function ResidentMonitoringCard({ apartmentId }: { apartmentId: string }) {
  const [loading, setLoading] = useState(true)
  const [metersData, setMetersData] = useState<MeterData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedMeters, setSelectedMeters] = useState<Set<string>>(new Set())

  const { meters, loading: metersLoading } = useMeters({
    apartmentId,
    take: 20,
    enabled: !!apartmentId,
    withApartment: true,
    withBlock: true,
  })

  const glMeters = useMemo(() => meters.filter(m => !!(m as any).glId), [meters])
  const hasGL = glMeters.length > 0

  // Inicializa todos selecionados quando os dados chegam
  useEffect(() => {
    if (metersData.length > 0 && selectedMeters.size === 0) {
      setSelectedMeters(new Set(metersData.map(m => m.meterId)))
    }
  }, [metersData])

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
        view: 'delta',        // sempre modo consumo (delta)
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

  // ─── Todos os hooks acima — early returns apenas após ───
  const meterColorMap = useMemo(() => {
    return metersData.reduce((acc, m, i) => {
      acc[m.meterId] = METER_COLORS[i % METER_COLORS.length]
      return acc
    }, {} as Record<string, string>)
  }, [metersData])

  // Montar dados do gráfico em modo consumo (delta diário)
  const chartData = useMemo(() => {
    if (metersData.length === 0) return []
    const dateMap: Record<string, any> = {}

    metersData.forEach(m => {
      if (!selectedMeters.has(m.meterId)) return
      m.readings.forEach(r => {
        const key = r.date
        if (!dateMap[key]) {
          dateMap[key] = { date: key, timestamp: r.readAt }
        }
        // delta = consumo do dia
        const val = r.delta != null ? Number(r.delta) : 0
        if (val >= 0) dateMap[key][m.meterId] = Number(val.toFixed(4))
      })
    })

    return Object.values(dateMap)
      .sort((a: any, b: any) => String(a.timestamp).localeCompare(String(b.timestamp)))
  }, [metersData, selectedMeters])

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

  const toggleMeter = (meterId: string) => {
    setSelectedMeters(prev => {
      const next = new Set(prev)
      if (next.has(meterId)) {
        // Não permite desselecionar o último
        if (next.size === 1) return prev
        next.delete(meterId)
      } else {
        next.add(meterId)
      }
      return next
    })
  }

  // ─── Early returns ───────────────────────────────────────────────────────────
  if (!metersLoading && !hasGL) return null

  if (loading || metersLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Consumo em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full mb-3" />
          <Skeleton className="h-52 w-full" />
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
      <Card className="w-full border-destructive">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-destructive" />
            Consumo em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Erro ao carregar: {error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <Activity className="w-5 h-5 text-blue-600 shrink-0" />
          <CardTitle className="text-base font-semibold">Consumo em Tempo Real</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            <Wifi className="w-2.5 h-2.5 mr-1" />
            {glMeters.length} medidor{glMeters.length !== 1 ? 'es' : ''} GL · 30 dias
          </Badge>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/monitoring" className="flex items-center gap-1 text-xs">
            Ver detalhes <ChevronRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Toggles de medidor ── */}
        {metersData.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {metersData.map((m) => {
              const isActive = selectedMeters.has(m.meterId)
              const color = meterColorMap[m.meterId]
              // Abreviar o register para caber no botão
              const label = m.register.length > 22 ? m.register.slice(0, 22) + '…' : m.register
              return (
                <button
                  key={m.meterId}
                  onClick={() => toggleMeter(m.meterId)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                    isActive
                      ? 'border-transparent text-white'
                      : 'border-border text-muted-foreground bg-transparent'
                  }`}
                  style={isActive ? { backgroundColor: color } : {}}
                  title={m.register}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isActive ? 'white' : color }}
                  />
                  {label}
                </button>
              )
            })}
            {selectedMeters.size < metersData.length && (
              <button
                onClick={() => setSelectedMeters(new Set(metersData.map(m => m.meterId)))}
                className="px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todos
              </button>
            )}
          </div>
        )}

        {/* ── Stats rápidas ── */}
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

        {/* ── Gráfico de barras — consumo diário (delta) ── */}
        {chartData.length > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2 px-1">Consumo diário (m³) — últimos 30 dias</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => {
                    try { return format(parseISO(d), 'dd/MM') } catch { return d }
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v) => `${v} m³`} />
                <Tooltip content={<CustomTooltip />} />
                {metersData
                  .filter(m => selectedMeters.has(m.meterId))
                  .map(m => (
                    <Bar
                      key={m.meterId}
                      dataKey={m.meterId}
                      name={m.register.length > 20 ? m.register.slice(0, 20) + '…' : m.register}
                      fill={meterColorMap[m.meterId]}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={18}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-36 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Sem leituras nos últimos 30 dias</p>
          </div>
        )}

        {/* ── Alertas recentes ── */}
        {allAlerts.length > 0 && (
          <div className="space-y-2 pt-1 border-t">
            <div className="flex items-center gap-2 pt-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Alertas Recentes</h3>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
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
                      {isDeviceAlert && !isNegative && !isOutlierHigh && !isOutlierLow && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate max-w-[160px]" title={alert.register}>{alert.register}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
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
