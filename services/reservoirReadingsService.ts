// services/reservoirReadingsService.ts

export interface ReservoirReading {
  id: string
  reservoirId: string
  level: number
  rawLevel?: number
  distance?: number
  temperature?: number
  temperatureSecondary?: number
  batteryVoltage?: number
  batteryVoltageSecondary?: number
  signalQuality?: number
  signalStrength?: number
  gatewaySignalQuality?: number
  gatewaySignalStrength?: number
  speed1?: number
  speed2?: number
  readingDate: Date
  receivedAt: Date
  telegramMessageId?: string
  telegramChannelName?: string
  telegramDeviceName?: string
  reservoir?: {
    id: string
    name: string
    type: string
    capacity?: number
    minLevel?: number
    maxLevel?: number
    location?: string
    isActive?: boolean
    company?: {
      id: string
      name: string
    }
  }
}

export interface GetReservoirReadingsParams {
  reservoirId?: string
  companyId?: string
  startDate?: Date
  endDate?: Date
  minLevel?: number
  maxLevel?: number
  search?: string
  take?: number
  skip?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export interface ReservoirReadingsResponse {
  reservoirReadings: ReservoirReading[]
  totalCount: number
}

export const getReservoirReadings = async (params: GetReservoirReadingsParams = {}): Promise<ReservoirReadingsResponse> => {
  const searchParams = new URLSearchParams()
  
  if (params.reservoirId) searchParams.append('reservoir_id', params.reservoirId)
  if (params.companyId) searchParams.append('company_id', params.companyId)
  if (params.startDate) searchParams.append('start_date', params.startDate.toISOString())
  if (params.endDate) searchParams.append('end_date', params.endDate.toISOString())
  if (params.minLevel !== undefined) searchParams.append('min_level', params.minLevel.toString())
  if (params.maxLevel !== undefined) searchParams.append('max_level', params.maxLevel.toString())
  if (params.search) searchParams.append('search', params.search)
  if (params.take) searchParams.append('take', params.take.toString())
  if (params.skip) searchParams.append('skip', params.skip.toString())
  if (params.orderBy) searchParams.append('orderBy', params.orderBy)
  if (params.orderDirection) searchParams.append('orderDirection', params.orderDirection)

  const response = await fetch(`/api/reservoir-readings?${searchParams.toString()}`)
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar leituras dos reservatórios')
  }

  return response.json()
}

export const createReservoirReading = async (data: {
  reservoirId: string
  level: number
  rawLevel?: number
  distance?: number
  temperature?: number
  batteryVoltage?: number
  signalQuality?: number
  readingDate: Date
}): Promise<{ reservoirReading: ReservoirReading; message: string }> => {
  const response = await fetch('/api/reservoir-readings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao criar leitura do reservatório')
  }

  return response.json()
}
