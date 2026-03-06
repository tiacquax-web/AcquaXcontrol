"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Droplets, Thermometer, Battery, Signal, Gauge, AlertTriangle, Calendar, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import ReservoirGraphChart from './ReservoirGraphChart';
import { useReservoirReadings } from '@/hooks'
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

interface ReservoirCardProps {
  reservoir: Reservoir
  viewMode: 'accumulated' | 'consumed'
  onModeChange: (mode: 'accumulated' | 'consumed') => void
  dateRange: { from: Date, to: Date }
  onCardClick?: () => void
  showReadings?: boolean
}

const getReservoirTypeLabel = (type: string) => {
  const types: Record<string, string> = {
    WATER_TANK: 'Caixa d\'água',
    CISTERN: 'Cisterna',
    POOL: 'Piscina',
    FOUNTAIN: 'Chafariz',
    EMERGENCY_TANK: 'Reserva de emergência',
    TREATMENT_TANK: 'Tanque de tratamento'
  }
  return types[type] || type
}

const getReservoirTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    WATER_TANK: 'bg-blue-100 text-blue-800 border-blue-200',
    CISTERN: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    POOL: 'bg-teal-100 text-teal-800 border-teal-200',
    FOUNTAIN: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    EMERGENCY_TANK: 'bg-orange-100 text-orange-800 border-orange-200',
    TREATMENT_TANK: 'bg-purple-100 text-purple-800 border-purple-200'
  }
  return colors[type] || 'bg-gray-100 text-gray-800 border-gray-200'
}

const getLevelStatus = (level: number, minLevel?: number, maxLevel?: number) => {
  if (minLevel && level <= minLevel) {
    return { status: 'critical', color: 'text-red-600', icon: AlertTriangle }
  }
  if (maxLevel && level >= maxLevel * 0.9) {
    return { status: 'high', color: 'text-green-600', icon: Droplets }
  }
  if (minLevel && level <= minLevel * 1.2) {
    return { status: 'low', color: 'text-yellow-600', icon: AlertTriangle }
  }
  return { status: 'normal', color: 'text-blue-600', icon: Droplets }
}

export default function ReservoirCard({ 
  reservoir, 
  viewMode, 
  onModeChange, 
  dateRange,
  onCardClick,
  showReadings = true
}: ReservoirCardProps) {
  // Buscar leituras do reservatório em tempo real
  const { data: readings, loading: loadingReadings, error: readingsError } = useReservoirReadings({
    reservoirId: reservoir.id,
    dateRange,
    enabled: showReadings,
    take: 500 // Limite razoável para gráfico
  })

  // Usar leituras do hook se disponíveis, senão usar as que vêm com o reservatório
  const reservoirReadings = (readings && readings.length > 0) ? readings : (reservoir.readings || [])
  
  const latestReading = reservoirReadings?.[0]
  const levelStatus = getLevelStatus(latestReading?.level || 0, reservoir.minLevel, reservoir.maxLevel)
  const LevelIcon = levelStatus.icon

  const capacityPercentage = reservoir.capacity && latestReading?.level
    ? Math.min(Math.round((latestReading.level / reservoir.capacity) * 100), 100)
    : null

  return (
    <Card className="w-full hover:shadow-lg transition-shadow duration-200 cursor-pointer" onClick={onCardClick}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold">{reservoir.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getReservoirTypeColor(reservoir.type)}>
                {getReservoirTypeLabel(reservoir.type)}
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                Ativa
               </Badge>
            </div>
            {reservoir.location && (
              <p className="text-sm text-muted-foreground mt-1">{reservoir.location}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1 p-0">
        {/* Nível Atual */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <LevelIcon className={`h-5 w-5 ${levelStatus.color}`} />
            <div>
              <p className="text-sm font-medium">Nível Atual</p>
              <p className={`text-2xl font-bold ${levelStatus.color}`}>
                {latestReading?.level?.toFixed(2) || '--'} m
              </p>
              {capacityPercentage !== null && (
                <p className="text-sm text-muted-foreground">
                  {capacityPercentage}% da capacidade
                </p>
              )}
            </div>
          </div>
          {latestReading?.readingDate && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Última leitura</p>
              <p className="text-sm">
                {format(new Date(latestReading.readingDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>

        {/* Dados Técnicos */}
        {latestReading && (
          <div className="grid grid-cols-2 gap-3 p-2">
            {latestReading.temperature && (
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                <Thermometer className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Temperatura</p>
                  <p className="text-sm font-medium">{latestReading.temperature.toFixed(1)}°C</p>
                </div>
              </div>
            )}

            {latestReading.batteryVoltage && (
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                <Battery className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Bateria</p>
                  <p className="text-sm font-medium">{latestReading.batteryVoltage.toFixed(1)}V</p>
                </div>
              </div>
            )}

            {latestReading.signalQuality && (
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                <Signal className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Sinal</p>
                  <p className="text-sm font-medium">{latestReading.signalQuality.toFixed(0)} dB</p>
                </div>
              </div>
            )}

            {reservoir.capacity && (
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                <Gauge className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Capacidade</p>
                  <p className="text-sm font-medium">{reservoir.capacity.toFixed(0)} m³</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controles de Modo */}
        {showReadings && (
          <div className="flex gap-2">
            {/* <Button
              variant={viewMode === 'accumulated' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onModeChange('accumulated')
              }}
            >
              Acumulado
            </Button> */}
            {/* <Button
              variant={viewMode === 'consumed' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onModeChange('consumed')
              }}
            >
              Consumido
            </Button> */}
          </div>
        )}

        {/* Gráfico */}
        {showReadings && (
          <div className="h-64 overflow-hidden relative">
            {loadingReadings && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {readingsError && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <p className="text-sm text-muted-foreground">Erro ao carregar dados</p>
              </div>
            )}
            <ReservoirGraphChart
              readings={reservoirReadings}
              viewMode={viewMode}
              dateRange={dateRange}
              interval={viewMode === 'consumed' ? 'day' : undefined}
              height={200}
              reservoir={reservoir}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
