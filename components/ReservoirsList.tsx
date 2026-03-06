"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Droplets, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ReservoirCard from "./ReservoirCard"
import { useToast } from "./ui/use-toast"
import { ReservoirReading } from '@/services/reservoirReadingsService'

interface Reservoir {
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
  readings?: ReservoirReading[]
}

interface ReservoirsListProps {
  companyId?: string
  complexId?: string
  search: string
  viewType: "Cards" | "List"
  dateRange: {
    from: Date
    to: Date
  }
  onReservoirClick?: (reservoir: Reservoir) => void
  showReadings?: boolean
}

// Hook para buscar reservatórios
const useReservoirs = (companyId?: string, complexId?: string, search?: string, dateRange?: { from: Date, to: Date }, includeReadings: boolean = false) => {
  const [data, setData] = useState<Reservoir[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Memoizar o dateRange para evitar re-renderizações desnecessárias
  const memoizedDateRange = useMemo(() => {
    if (!dateRange) return null;
    return {
      from: dateRange.from.getTime(),
      to: dateRange.to.getTime()
    };
  }, [dateRange?.from.getTime(), dateRange?.to.getTime()]);

  useEffect(() => {
    const fetchReservoirs = async () => {
      try {
        setLoading(true)
        
        const params = new URLSearchParams({
          search: search || '',
          take: '50',
          orderBy: 'name',
          orderDirection: 'asc'
        })

        if (companyId) {
          params.append('company_id', companyId)
        }

        if (complexId) {
          params.append('complex_id', complexId)
        }

        if (includeReadings) {
          params.append('includeReadings', 'true')
        }

        if (memoizedDateRange) {
          params.append('dateFrom', new Date(memoizedDateRange.from).toISOString())
          params.append('dateTo', new Date(memoizedDateRange.to).toISOString())
        }

        const response = await fetch(`/api/reservoirs?${params}`)
        
        if (!response.ok) {
          throw new Error('Erro ao carregar reservatórios')
        }

        const result = await response.json()
        setData(result.reservoirs || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchReservoirs()
  }, [companyId, complexId, search, memoizedDateRange, includeReadings])

  return { data, loading, error, refetch: () => {
    const fetchReservoirs = async () => {
      try {
        setLoading(true)
        
        const params = new URLSearchParams({
          search: search || '',
          take: '50',
          orderBy: 'name',
          orderDirection: 'asc'
        })

        if (companyId) {
          params.append('company_id', companyId)
        }

        const response = await fetch(`/api/reservoirs?${params}`)
        
        if (!response.ok) {
          throw new Error('Erro ao carregar reservatórios')
        }

        const result = await response.json()
        setData(result.reservoirs || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetchReservoirs()
  }}
}

export default function ReservoirsList({ 
  companyId, 
  complexId,
  search, 
  viewType, 
  dateRange,
  onReservoirClick,
  showReadings = true
}: ReservoirsListProps) {
  const { data: reservoirs, loading, error } = useReservoirs(companyId, complexId, search, dateRange, showReadings)
  const [viewModes, setViewModes] = useState<Record<string, 'accumulated' | 'consumed'>>({})
  const { toast } = useToast()

  const handleModeChange = (reservoirId: string, mode: 'accumulated' | 'consumed') => {
    setViewModes(prev => ({
      ...prev,
      [reservoirId]: mode
    }))
  }

  const getViewMode = (reservoirId: string): 'accumulated' | 'consumed' => {
    return viewModes[reservoirId] || 'accumulated'
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="max-w-lg mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar reservatórios: {error}
        </AlertDescription>
      </Alert>
    )
  }

  if (!reservoirs.length) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Droplets className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum reservatório encontrado</h3>
          <p className="text-muted-foreground text-center mb-4">
            {search 
              ? `Não foram encontrados reservatórios que correspondam à busca "${search}".`
              : 'Não há reservatórios cadastrados para esta empresa.'
            }
          </p>
          <Button className="mt-2">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Reservatório
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (viewType === "List") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5" />
              Reservatórios ({reservoirs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reservoirs.map((reservoir) => (
                <div 
                  key={reservoir.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onReservoirClick?.(reservoir)}
                >
                  <div className="flex items-center gap-3">
                    <Droplets className="h-8 w-8 text-blue-500" />
                    <div>
                      <h4 className="font-medium">{reservoir.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{reservoir.type}</Badge>
                        {reservoir.location && (
                          <span className="text-sm text-muted-foreground">{reservoir.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-semibold text-blue-600">
                      {reservoir.readings?.[0]?.level?.toFixed(2) || '--'} m
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {reservoir.readings?.[0]?.readingDate 
                        ? new Date(reservoir.readings[0].readingDate).toLocaleDateString('pt-BR')
                        : 'Sem leituras'
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {reservoirs.map((reservoir) => (
        <ReservoirCard
          key={reservoir.id}
          reservoir={reservoir}
          viewMode={getViewMode(reservoir.id)}
          onModeChange={(mode) => handleModeChange(reservoir.id, mode)}
          dateRange={dateRange}
          onCardClick={() => onReservoirClick?.(reservoir)}
          showReadings={showReadings}
        />
      ))}
    </div>
  )
}
