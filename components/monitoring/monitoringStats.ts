export interface MonitoringReadingPoint {
  readingId: string
  meterId: string
  register: string
  date: string
  readAt: string | Date
  value: number | string
  alerts: string[]
}

export interface MonitoringMeterData {
  meterId: string
  register: string
  rotation: string
  readings: MonitoringReadingPoint[]
  stats?: any
}

export interface ComputedStats {
  totalConsumed: number | null
  avgDelta: number | null
  minDelta: number | null
  maxDelta: number | null
  stdDev: number | null
  negativeCount: number
  alertCount: number
  anomalies: Array<{ readingId: string; readAt: Date; delta: number; anomalyTypes: string[] }>
}

export function recomputeStats(meter: MonitoringMeterData, view: 'cumulative' | 'simple', sigma: number, filterAlerts?: string[]): ComputedStats {
  const rotation = meter.rotation || 'Crescente'
  // Filtra por tipos de alerta se necessário
  const filteredReadings = meter.readings.filter(r => {
    if (!filterAlerts || filterAlerts.length === 0) return true
    if (!r.alerts || r.alerts.length === 0) return false
    return r.alerts.some(a => filterAlerts.includes(a))
  })
  if (filteredReadings.length < 2) {
    return {
      totalConsumed: null,
      avgDelta: null,
      minDelta: null,
      maxDelta: null,
      stdDev: null,
      negativeCount: 0,
      alertCount: filteredReadings.filter(r => r.alerts?.length).length,
      anomalies: []
    }
  }

  // Precisamos das leituras em ordem cronológica com valor numérico cumulativo para calcular delta
  const ordered = [...filteredReadings].sort((a,b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime())
  const deltas: number[] = []
  for (let i=1;i<ordered.length;i++) {
    const prev = ordered[i-1]
    const curr = ordered[i]
    const prevVal = numericValue(prev.value)
    const currVal = numericValue(curr.value)
    // Se estamos em modo 'simple' e value já é delta (exceto primeiro '-') não recomputa
    let delta: number
    if (view === 'simple' && typeof curr.value === 'number' && typeof prev.value === 'number') {
      // value já é delta => precisamos derivar do cumulativo? O endpoint nos mandou 'value' = delta quando view simple.
      // Para garantir consistência, sempre recomputamos do cumulativo reconstruído: assumindo que leitura original cumulativa é crescente.
      delta = rotation === 'Decrescente' ? (prevVal - currVal) : (currVal - prevVal)
    } else {
      delta = rotation === 'Decrescente' ? (prevVal - currVal) : (currVal - prevVal)
    }
    deltas.push(delta)
  }
  const positive = deltas.filter(d => d > 0)
  const negative = deltas.filter(d => d < 0)
  const totalConsumed = rotation === 'Decrescente'
    ? (numericValue(ordered[0].value) - numericValue(ordered[ordered.length-1].value))
    : (numericValue(ordered[ordered.length-1].value) - numericValue(ordered[0].value))
  const avgDelta = positive.length ? positive.reduce((a,b)=>a+b,0)/positive.length : null
  let stdDev: number | null = null
  if (positive.length >= 3 && avgDelta !== null) {
    const variance = positive.reduce((acc,d)=>acc+Math.pow(d-avgDelta,2),0)/positive.length
    stdDev = Math.sqrt(variance)
  }
  const minDelta = positive.length ? Math.min(...positive) : null
  const maxDelta = positive.length ? Math.max(...positive) : null

  const anomalies: ComputedStats['anomalies'] = []
  for (let i=1;i<ordered.length;i++) {
    const delta = deltas[i-1]
    const base = ordered[i]
    const anomalyTypes: string[] = []
  if (delta < 0) anomalyTypes.push('NEGATIVE_CONSUMPTION')
    if (stdDev !== null && avgDelta !== null) {
      if (delta > avgDelta + sigma * stdDev) anomalyTypes.push('OUTLIER_HIGH')
      if (delta > 0 && delta < avgDelta - sigma * stdDev) anomalyTypes.push('OUTLIER_LOW')
    }
    if (base.alerts?.length) {
      anomalyTypes.push('HAS_ALERT', ...base.alerts)
    }
    if (anomalyTypes.length) {
      anomalies.push({ readingId: base.readingId, readAt: new Date(base.readAt), delta, anomalyTypes })
    }
  }

  return { totalConsumed, avgDelta, minDelta, maxDelta, stdDev, negativeCount: negative.length, alertCount: ordered.filter(r=>r.alerts?.length).length, anomalies }
}

function numericValue(v: number | string): number {
  if (typeof v === 'number') return v
  if (v === '-') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
