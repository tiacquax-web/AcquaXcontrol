"use client"
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, AlertTriangle, TrendingUp, TrendingDown, Minus, Wifi } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface GLMeterCard {
  meterId: string
  register: string
  glId: string | null
  status: string
  apartment?: { name: string; block?: { name: string } } | null
  lastReading?: { value: number; readAt: string } | null
  readings7d?: Array<{ date: string; value: number }>
  stats?: {
    totalConsumed: number
    avgDelta: number | null
    alertCount: number
    anomaliesCount: number
  } | null
  loading?: boolean
}

function Sparkline({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const width = 100
  const height = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const path = `M ${points.join(' L ')}`
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={areaPath} fill={color} fillOpacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffD = Math.floor(diffH / 24)
  if (diffD > 0) return `${diffD}d atrás`
  if (diffH > 0) return `${diffH}h atrás`
  const diffM = Math.floor(diffMs / (1000 * 60))
  if (diffM > 0) return `${diffM}min atrás`
  return 'agora'
}

export default function GLOverviewCards({ meters, onSelectMeter }: { meters: GLMeterCard[]; onSelectMeter?: (meterId: string) => void }) {
  if (meters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wifi className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground font-medium">Nenhum medidor com monitoramento GL ativo</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Os medidores deste condomínio não possuem integração GroupLink (glId) configurada.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {meters.map(m => {
        const isActive = m.status === 'Ativo'
        const hasData = !!m.lastReading
        const sparkData = m.readings7d?.map(r => r.value).filter(v => typeof v === 'number') as number[] || []
        const trend = m.stats?.avgDelta != null ? m.stats.avgDelta : null
        const hasAlerts = (m.stats?.alertCount || 0) > 0
        const hasAnomalies = (m.stats?.anomaliesCount || 0) > 0

        return (
          <Card
            key={m.meterId}
            className={`border shadow-sm transition-all cursor-pointer hover:shadow-md ${onSelectMeter ? 'hover:border-primary/30' : ''}`}
            onClick={() => onSelectMeter?.(m.meterId)}
          >
            <CardContent className="p-3 space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    <span className="font-medium text-sm truncate">{m.register}</span>
                  </div>
                  {m.apartment?.name && (
                    <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
                      {m.apartment.block?.name} • {m.apartment.name}
                    </span>
                  )}
                </div>
                {hasAlerts && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {m.stats!.alertCount}
                  </Badge>
                )}
              </div>

              {/* Body */}
              {m.loading ? (
                <div className="h-[68px] flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground animate-pulse">carregando...</span>
                </div>
              ) : !hasData ? (
                <div className="h-[68px] flex flex-col items-center justify-center gap-1">
                  <Activity className="h-5 w-5 text-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground">Sem leituras recentes</span>
                </div>
              ) : (
                <div className="flex items-end justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-lg font-bold tabular-nums leading-none">
                      {Number(m.lastReading!.value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      última: {timeAgo(m.lastReading!.readAt)}
                    </div>
                    {trend != null && (
                      <div className="flex items-center gap-0.5 text-[10px]">
                        {trend > 0 ? (
                          <><TrendingUp className="h-2.5 w-2.5 text-emerald-500" /><span className="text-emerald-600">média {trend.toFixed(1)}</span></>
                        ) : trend < 0 ? (
                          <><TrendingDown className="h-2.5 w-2.5 text-red-500" /><span className="text-red-500">{trend.toFixed(1)}</span></>
                        ) : (
                          <><Minus className="h-2.5 w-2.5 text-muted-foreground" /><span className="text-muted-foreground">estável</span></>
                        )}
                      </div>
                    )}
                  </div>
                  {sparkData.length >= 2 && (
                    <Sparkline data={sparkData} color={hasAlerts ? '#ef4444' : '#3b82f6'} />
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1.5 border-t">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {hasAnomalies ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-amber-600 border-amber-300">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {m.stats!.anomaliesCount} anom.
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-600 border-emerald-300">
                      normal
                    </Badge>
                  )}
                </div>
                {m.glId && (
                  <span className="text-[9px] text-muted-foreground/60 font-mono truncate max-w-[80px]" title={`GL: ${m.glId}`}>
                    GL: {m.glId.substring(0, 8)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
