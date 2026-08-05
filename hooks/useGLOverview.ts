import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useMeters } from './useMeters'
import { useUserContext } from './useUserContext'

interface GLMeterOverview {
  meterId: string
  register: string
  glId: string | null
  status: string
  apartment: { name: string; block?: { name: string } } | null
  lastReading: { value: number; readAt: string } | null
  readings7d: Array<{ date: string; value: number }>
  stats: { totalConsumed: number; avgDelta: number | null; alertCount: number; anomaliesCount: number } | null
}

export function useGLOverview(complexId?: string) {
  const { context: userContext } = useUserContext()
  const [overview, setOverview] = useState<GLMeterOverview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detect which complexes have GL
  const glComplexIds = userContext?.glComplexIds || []
  const targetComplexId = complexId || (glComplexIds.length === 1 ? glComplexIds[0] : undefined)

  // Fetch meters with glId for the target complex
  const { meters, loading: metersLoading } = useMeters({
    complexId: targetComplexId,
    take: 200,
    enabled: !!targetComplexId,
    withApartment: true,
    withBlock: true,
  })

  const glmMeters = meters.filter(m => !!(m as any).glId)

  const fetchOverview = useCallback(async () => {
    if (glmMeters.length === 0) {
      setOverview([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const meterIds = glmMeters.map(m => m.id)
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 7)
      const toDate = new Date()

      const { data } = await axios.post('/api/monitoring/readings', {
        meterIds,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        mode: 'dailyLast',
        view: 'cumulative',
        includeStats: true,
      })

      const overviewData: GLMeterOverview[] = glmMeters.map(meter => {
        const meterData = data.meters?.find((md: any) => md.meterId === meter.id)
        const readings = meterData?.readings || []
        const lastReading = readings.length > 0
          ? { value: readings[readings.length - 1].value, readAt: readings[readings.length - 1].readAt }
          : null

        return {
          meterId: meter.id,
          register: meter.register,
          glId: (meter as any).glId,
          status: meter.status || 'Ativo',
          apartment: (meter as any).apartment
            ? { name: (meter as any).apartment.name, block: (meter as any).apartment.block ? { name: (meter as any).apartment.block.name } : undefined }
            : null,
          lastReading,
          readings7d: readings.map((r: any) => ({ date: r.date, value: Number(r.value) || 0 })),
          stats: meterData?.stats
            ? {
                totalConsumed: meterData.stats.totalConsumed || 0,
                avgDelta: meterData.stats.avgDelta,
                alertCount: meterData.stats.alertCount || 0,
                anomaliesCount: meterData.stats.anomalies?.length || 0,
              }
            : null,
        }
      })

      setOverview(overviewData)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar overview GL')
      // Still set meters with basic info even if readings fail
      setOverview(glmMeters.map(meter => ({
        meterId: meter.id,
        register: meter.register,
        glId: (meter as any).glId,
        status: meter.status || 'Ativo',
        apartment: (meter as any).apartment
          ? { name: (meter as any).apartment.name, block: (meter as any).apartment.block ? { name: (meter as any).apartment.block.name } : undefined }
          : null,
        lastReading: null,
        readings7d: [],
        stats: null,
      })))
    } finally {
      setLoading(false)
    }
  }, [glmMeters.length])

  useEffect(() => {
    if (!metersLoading && glmMeters.length > 0) {
      fetchOverview()
    } else if (!metersLoading && glmMeters.length === 0) {
      setOverview([])
      setLoading(false)
    }
  }, [metersLoading, glmMeters.length])

  return { overview, loading: loading || metersLoading, error, glmMeters, refetch: fetchOverview }
}
