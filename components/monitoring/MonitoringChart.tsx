"use client"
import ReadingsChart2 from '@/components/readings-chart-2'
import { ConsumptionChartConfig } from '@/components/readings-chart-2'

interface MonitoringChartProps {
  meters: Array<{
    meterId: string
    register: string
    readings: Array<{
      date: string
      readAt: string
      value: number | string
      meterId: string
      register: string
      alerts: string[]
      readingId: string
      isManualReading?: boolean
    }>
  }>
  view: 'cumulative' | 'simple'
  mode: 'raw' | 'dailyLast'
  height?: number
  onSelectPoint?: (readingId: string) => void
  hiddenMeters?: Record<string, boolean>
}

// Gera cores determinísticas simples (placeholder fase 1)
function colorFor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 65%, 50%)`
}

export default function MonitoringChart({ meters, view, mode, height = 380, onSelectPoint, hiddenMeters = {} }: MonitoringChartProps) {
  // Unificar datas e montar dataset wide para Recharts (mesmo padrão do ReadingsChart2)
  const dateMap: Record<string, any> = {}
  meters.forEach(m => {
    if (hiddenMeters[m.meterId]) return
    m.readings.forEach(r => {
      const key = r.date
      if (!dateMap[key]) {
        dateMap[key] = { date: key, __meta: {}, __timestamp: r.readAt }
      }
      const numericValue = typeof r.value === 'number' ? Number(r.value.toFixed(3)) : r.value
      dateMap[key][m.meterId] = numericValue
      dateMap[key].__meta[m.meterId] = { readingId: r.readingId, readAt: r.readAt }
      if (!dateMap[key].__timestamp || dateMap[key].__timestamp > r.readAt) {
        dateMap[key].__timestamp = r.readAt
      }
    })
  })
  const data = Object.values(dateMap).sort((a: any, b: any) => {
    const aKey = a.__timestamp ?? a.date
    const bKey = b.__timestamp ?? b.date
    return String(aKey).localeCompare(String(bKey))
  })

  const config: ConsumptionChartConfig = {}
  meters.forEach(m => {
    if (hiddenMeters[m.meterId]) return
    config[m.meterId] = { label: m.register, color: colorFor(m.register) }
  })

  return (
    <ReadingsChart2
      title={view === 'cumulative' ? 'Leituras Acumuladas' : 'Consumos'}
      description='Dados consolidados dos medidores selecionados'
      data={data as any}
      config={config}
      xAxisKey='date'
      xAxisLabel='Data'
      dateFormat={mode === 'raw' ? 'dd/MM HH:mm' : 'dd/MM'}
      height={height}
      onSelectPoint={(payload: any) => {
        if (!onSelectPoint) return
        const meta = payload?.__meta
        if (meta && typeof meta === 'object') {
          const first = Object.values(meta)[0] as { readingId?: string } | undefined
          if (first?.readingId) {
            onSelectPoint(first.readingId)
            return
          }
        }
        const firstMeter = meters.find(m => !hiddenMeters[m.meterId] && m.readings.some(r => r.date === payload.date))
        if (firstMeter) {
          const reading = firstMeter.readings.find(r => r.date === payload.date)
          if (reading) onSelectPoint(reading.readingId)
        }
      }}
    />
  )
}
