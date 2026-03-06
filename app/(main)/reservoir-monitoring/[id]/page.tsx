"use client"

import {
  ArrowLeft,
  Droplets,
  Thermometer,
  Battery,
  Signal,
  Gauge,
  AlertTriangle,
  Calendar,
  Download,
  Settings,
  Activity,
  TrendingUp,
  TrendingDown
} from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useReservoirPermissions, useReservoirReadings } from "@/hooks"
import { DatePickerComponent } from "@/components/date-picker"
import ReservoirGraphChart from "@/components/ReservoirGraphChart"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { DateRange } from "react-day-picker"
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

const getReservoirTypeLabel = (type: string) => {
  const types: Record<string, string> = {
    WATER: 'Água',
    FUEL: 'Combustível', 
    CHEMICAL: 'Químico',
    OTHER: 'Outro'
  }
  return types[type] || type
}

const getReservoirTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    WATER: 'bg-blue-100 text-blue-800',
    FUEL: 'bg-orange-100 text-orange-800',
    CHEMICAL: 'bg-purple-100 text-purple-800',
    OTHER: 'bg-gray-100 text-gray-800'
  }
  return colors[type] || 'bg-gray-100 text-gray-800'
}

const getLevelStatus = (level: number, minLevel?: number, maxLevel?: number) => {
  if (minLevel && level <= minLevel) {
    return { status: 'critical', color: 'text-red-600', icon: AlertTriangle, bg: 'bg-red-50' }
  }
  if (maxLevel && level >= maxLevel * 0.9) {
    return { status: 'high', color: 'text-green-600', icon: Droplets, bg: 'bg-green-50' }
  }
  if (minLevel && level <= minLevel * 1.2) {
    return { status: 'low', color: 'text-yellow-600', icon: AlertTriangle, bg: 'bg-yellow-50' }
  }
  return { status: 'normal', color: 'text-blue-600', icon: Droplets, bg: 'bg-blue-50' }
}

const sixMonthsAgo = new Date(new Date().setMonth(new Date().getMonth() - 6))

export default function ReservoirDetailsPage() {
  const { canViewReservoirReadings } = useReservoirPermissions()
  const params = useParams()
  const router = useRouter()
  const reservoirId = params.id as string
  
  // Avaliar permissão uma vez no início do componente
  const hasReadingPermission = canViewReservoirReadings()
  
  const [reservoir, setReservoir] = useState<Reservoir | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: sixMonthsAgo, to: new Date() })
  const [viewMode, setViewMode] = useState<'accumulated' | 'consumed'>('accumulated')

  // Buscar leituras do reservatório em tempo real
  const { data: readings, loading: loadingReadings, error: readingsError } = useReservoirReadings({
    reservoirId,
    dateRange: dateRange ? { from: dateRange.from!, to: dateRange.to! } : undefined,
    enabled: !!reservoirId && hasReadingPermission,
    take: 1000
  })

  useEffect(() => {
    const fetchReservoir = async () => {
      // Verificar permissão no momento da execução
      if (!canViewReservoirReadings()) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/reservoirs/${reservoirId}?includeReadings=true`)
        
        if (!response.ok) {
          throw new Error(`Erro ao carregar dados do reservatório: ${response.status}`)
        }

        const data = await response.json()
        setReservoir(data.reservoir)
        setError(null)
      } catch (err) {
        console.error('Erro ao buscar reservatório:', err)
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
        setReservoir(null)
      } finally {
        setLoading(false)
      }
    }

    if (reservoirId) {
      fetchReservoir()
    }
  }, [reservoirId]) // Apenas reservoirId como dependência

  // Verificação de permissões - movida para depois de todos os hooks
  if (!hasReadingPermission) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <AlertDescription>
            Você não possui permissão para acessar os detalhes dos reservatórios.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !reservoir) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Reservatório não encontrado'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const latestReading = reservoir.readings?.[0]
  const levelStatus = getLevelStatus(latestReading?.level || 0, reservoir.minLevel, reservoir.maxLevel)
  const LevelIcon = levelStatus.icon

  const capacityPercentage = reservoir.capacity 
    ? Math.round((latestReading?.level || 0) / reservoir.capacity * 100)
    : null

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.back()}
              className="h-auto p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Droplets className="h-8 w-8 text-blue-500" />
                {reservoir.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={getReservoirTypeColor(reservoir.type)}>
                  {getReservoirTypeLabel(reservoir.type)}
                </Badge>
                {/* {!reservoir.isActive && (
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                    Inativo
                  </Badge>
                )} */}
              </div>
            </div>
          </div>
          {reservoir.location && (
            <p className="text-muted-foreground ml-10">{reservoir.location}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DatePickerComponent
            isRangeable={true}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
        </div>
      </div>

      {/* Status Cards - Layout melhorado inspirado na imagem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Principal com Visual do Reservatório */}
        <Card className="col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Droplets className="h-6 w-6 text-blue-500" />
                  {reservoir.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`${getReservoirTypeColor(reservoir.type)} border-0`}>
                    {getReservoirTypeLabel(reservoir.type)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Capacidade: {reservoir.capacity ? `${reservoir.capacity.toFixed(0)}L` : '--'}
                  </span>
                </div>
              </div>
              <Badge 
                variant={reservoir.isActive ? "default" : "secondary"}
                className={reservoir.isActive ? "bg-green-100 text-green-800" : ""}
              >
                {reservoir.isActive ? "Normal" : "Inativo"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Visual do Reservatório */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative">
                {/* Container do reservatório */}
                <div className="w-32 h-48 border-4 border-gray-300 rounded-lg bg-gray-50 relative overflow-hidden">
                  {/* Nível da água */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-blue-400 transition-all duration-500"
                    style={{ 
                      height: `${capacityPercentage || 0}%`,
                      backgroundColor: levelStatus.color === 'text-red-600' ? '#ef4444' : 
                                     levelStatus.color === 'text-yellow-600' ? '#f59e0b' : '#3b82f6'
                    }}
                  />
                </div>
                {/* Porcentagem */}
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
                  <div className={`text-4xl font-bold ${levelStatus.color}`}>
                    {capacityPercentage || 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Informações do Nível */}
            <div className="space-y-2 text-center">
              <div className={`text-3xl font-bold ${levelStatus.color}`}>
                {latestReading?.level?.toFixed(2) || '--'} m
              </div>
              {latestReading?.readingDate && (
                <p className="text-sm text-muted-foreground">
                  Última leitura: {format(new Date(latestReading.readingDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Grid de Informações */}
        <div className="space-y-4">
          {/* Volume Atual e Disponível */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {reservoir.capacity && latestReading?.level 
                      ? (reservoir.capacity * (latestReading.level / (reservoir.maxLevel || 1))).toFixed(0) 
                      : '--'
                    }L
                  </div>
                  <div className="text-sm text-muted-foreground">Volume Atual</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {reservoir.capacity && latestReading?.level 
                      ? (reservoir.capacity - (reservoir.capacity * (latestReading.level / (reservoir.maxLevel || 1)))).toFixed(0) 
                      : '--'
                    }L
                  </div>
                  <div className="text-sm text-muted-foreground">Disponível</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Consumo e Autonomia */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    2.5L/min
                  </div>
                  <div className="text-sm text-muted-foreground">Consumo Atual</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    20h
                  </div>
                  <div className="text-sm text-muted-foreground">Autonomia</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Dados Técnicos */}
          {(latestReading?.temperature || latestReading?.batteryVoltage || latestReading?.signalQuality) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dados Técnicos</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-4 text-center">
                  {latestReading?.temperature && (
                    <div>
                      <div className="flex items-center justify-center mb-1">
                        <Thermometer className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="text-lg font-bold">{latestReading.temperature.toFixed(1)}°C</div>
                      <div className="text-xs text-muted-foreground">Temperatura</div>
                    </div>
                  )}
                  {latestReading?.batteryVoltage && (
                    <div>
                      <div className="flex items-center justify-center mb-1">
                        <Battery className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="text-lg font-bold">{latestReading.batteryVoltage.toFixed(1)}V</div>
                      <div className="text-xs text-muted-foreground">Bateria</div>
                    </div>
                  )}
                  {latestReading?.signalQuality && (
                    <div>
                      <div className="flex items-center justify-center mb-1">
                        <Signal className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="text-lg font-bold">{latestReading.signalQuality.toFixed(0)} dB</div>
                      <div className="text-xs text-muted-foreground">Sinal</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Controles de Gráfico */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Histórico de Níveis
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'accumulated' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('accumulated')}
              >
                Acumulado
              </Button>
              <Button
                variant={viewMode === 'consumed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('consumed')}
              >
                Consumido
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-96 relative">
            {loadingReadings && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Carregando dados...</span>
                </div>
              </div>
            )}
            {readingsError && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <p className="text-sm text-destructive">Erro ao carregar leituras: {readingsError}</p>
              </div>
            )}
            <ReservoirGraphChart
              readings={readings.length > 0 ? readings : (reservoir?.readings || [])}
              viewMode={viewMode}
              dateRange={dateRange ? { from: dateRange.from!, to: dateRange.to! } : { from: sixMonthsAgo, to: new Date() }}
              interval={viewMode === 'consumed' ? 'day' : undefined}
              height={384}
              reservoir={{
                name: reservoir.name,
                type: reservoir.type,
                capacity: reservoir.capacity,
                minLevel: reservoir.minLevel,
                maxLevel: reservoir.maxLevel
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
