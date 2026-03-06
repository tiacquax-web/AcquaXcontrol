import { useState, useEffect, useMemo } from 'react'
import { useDebounce } from './use-debounce'
import { 
  getReservoirReadings, 
  ReservoirReading, 
  GetReservoirReadingsParams 
} from '@/services/reservoirReadingsService'

interface UseReservoirReadingsProps {
  reservoirId?: string
  companyId?: string
  dateRange?: { from: Date; to: Date }
  enabled?: boolean
  take?: number
  skip?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

interface UseReservoirReadingsReturn {
  data: ReservoirReading[]
  loading: boolean
  error: string | null
  totalCount: number
  refetch: () => void
}

export const useReservoirReadings = ({
  reservoirId,
  companyId,
  dateRange,
  enabled = true,
  take = 1000,
  skip = 0,
  orderBy = 'readingDate',
  orderDirection = 'desc'
}: UseReservoirReadingsProps): UseReservoirReadingsReturn => {
  const [data, setData] = useState<ReservoirReading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [sequence, setSequence] = useState(0)

  const refetch = () => {
    setSequence(prev => prev + 1)
  }

  // Debounce parameters to avoid too many requests
  const debouncedTake = useDebounce(take, 300)
  const debouncedSkip = useDebounce(skip, 300)

  // Memoizar dateRange para evitar re-renderizações desnecessárias
  const memoizedDateRange = useMemo(() => {
    if (!dateRange) return null;
    return {
      from: dateRange.from.getTime(),
      to: dateRange.to.getTime()
    };
  }, [dateRange?.from.getTime(), dateRange?.to.getTime()]);

  useEffect(() => {
    if (!enabled) {
      setData([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    const fetchReservoirReadings = async () => {
      try {
        setLoading(true)
        setError(null)

        const params: GetReservoirReadingsParams = {
          reservoirId,
          companyId,
          startDate: memoizedDateRange ? new Date(memoizedDateRange.from) : undefined,
          endDate: memoizedDateRange ? new Date(memoizedDateRange.to) : undefined,
          take: debouncedTake,
          skip: debouncedSkip,
          orderBy,
          orderDirection
        }

        const result = await getReservoirReadings(params)
        
        setData(result.reservoirReadings)
        setTotalCount(result.totalCount)
      } catch (err) {
        console.error('Error fetching reservoir readings:', err)
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
        setData([])
        setTotalCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchReservoirReadings()
  }, [
    enabled,
    reservoirId,
    companyId,
    memoizedDateRange,
    debouncedTake,
    debouncedSkip,
    orderBy,
    orderDirection,
    sequence
  ])

  return {
    data,
    loading,
    error,
    totalCount,
    refetch
  }
}
