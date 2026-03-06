import axios from 'axios'

const API_URL = '/api/monitoring'

export interface MonitoringReadingsRequest {
  meterIds: string[]
  fromDate: string
  toDate: string
  mode?: 'raw' | 'dailyLast'
  view?: 'cumulative' | 'simple'
  alertsOnly?: boolean
  includeStats?: boolean
  outlierSigma?: number
}

export async function getMonitoringReadings(payload: MonitoringReadingsRequest) {
  const { data } = await axios.post(`${API_URL}/readings`, payload)
  return data as MonitoringReadingsResponse
}

export interface MonitoringReadingsResponse {
  meters: Array<{
    meterId: string
    register: string
    rotation: string
    stats?: {
      totalConsumed: number
      avgDelta: number | null
      minDelta: number | null
      maxDelta: number | null
      stdDev: number | null
      negativeCount: number
      alertCount: number
      anomalies: Array<{ readingId: string, readAt: string, delta: number, anomalyTypes: string[] }>
    }
    readings: Array<{
      readingId: string
      meterId: string
      register: string
      date: string
      readAt: string
      value: number | string
      alerts: string[]
      isManualReading?: boolean
    }>
  }>
  distinctAlerts: string[]
}
