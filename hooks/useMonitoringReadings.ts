import { useEffect, useState } from 'react'
import { getMonitoringReadings, MonitoringReadingsRequest, MonitoringReadingsResponse } from '@/services/monitoringService'
import { useDebounce } from './use-debounce'

export function useMonitoringReadings(params: MonitoringReadingsRequest, enabled: boolean = true) {
  const [data, setData] = useState<MonitoringReadingsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebounce(params, 300)

  useEffect(() => {
    if (!enabled || !debounced.meterIds?.length) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getMonitoringReadings(debounced)
      .then(res => { if (!cancelled) setData(res) })
      .catch(err => { if (!cancelled) setError(err?.response?.data?.error || err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debounced, enabled])

  return { data, loading, error }
}
