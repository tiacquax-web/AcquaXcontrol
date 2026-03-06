"use client"

import { useMemo, useState, useEffect } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts"
import { format, parse, differenceInDays, differenceInWeeks, differenceInMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Componente customizado para tooltip
const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const timestamp = data.timestamp
    const formattedDate = format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-foreground mb-2">{formattedDate}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-muted-foreground">{entry.name}:</span>
            <span className="text-sm font-medium text-foreground">
              {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
              {entry.dataKey === 'level' && ' m'}
              {entry.dataKey === 'consumption' && ' m³'}
              {entry.dataKey === 'variation' && ' m'}
              {entry.dataKey === 'temperature' && '°C'}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

interface ReservoirReading {
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
  readingDate: Date | string
  receivedAt: Date | string
  telegramMessageId?: string
  telegramChannelName?: string
  telegramDeviceName?: string
  isProcessed?: boolean
  processingErrors?: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
  deletedAt?: Date | string | null
  createdByUserId?: string | null
  updatedByUserId?: string | null
}

interface ReservoirGraphProps {
  readings: ReservoirReading[]
  viewMode: 'accumulated' | 'consumed'
  dateRange: { from: Date, to: Date }
  interval?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'reading'
  height?: number
  reservoir?: {
    name: string
    type: string
    capacity?: number
    minLevel?: number
    maxLevel?: number
  }
  onIntervalChange?: (interval: string) => void
}

interface ChartData {
  date: string
  level?: number
  consumption?: number
  variation?: number
  temperature?: number
  timestamp: number
}

const chartConfig = {
  level: {
    label: "Nível (m)",
    color: "hsl(var(--chart-1))",
  },
  consumption: {
    label: "Consumo (m³)",
    color: "hsl(var(--chart-1))", // Azul para consumo também
  },
  variation: {
    label: "Variação (m)",
    color: "hsl(var(--chart-1))", // Azul para variação
  },
  temperature: {
    label: "Temperatura (°C)",
    color: "hsl(var(--chart-3))",
  },
}

// Função para determinar intervalos disponíveis baseado nos dados
const getAvailableIntervals = (readings: ReservoirReading[], dateRange: { from: Date, to: Date }) => {
  if (!readings || readings.length === 0) return []
  
  const intervals = []
  const daysDifference = differenceInDays(dateRange.to, dateRange.from)
  const weeksDifference = differenceInWeeks(dateRange.to, dateRange.from)
  const monthsDifference = differenceInMonths(dateRange.to, dateRange.from)
  
  // Por leitura - sempre disponível se há leituras
  if (readings.length > 1) {
    intervals.push({ id: 'reading', label: 'Por leitura' })
  }
  
  // Por dia - disponível se há pelo menos 1 dia de diferença
  if (daysDifference >= 1) {
    intervals.push({ id: 'day', label: 'Por dia' })
  }
  
  // Por semana - disponível se há pelo menos 1 semana de diferença
  if (weeksDifference >= 1) {
    intervals.push({ id: 'week', label: 'Por semana' })
  }
  
  // Por mês - disponível se há pelo menos 1 mês de diferença
  if (monthsDifference >= 1) {
    intervals.push({ id: 'month', label: 'Por mês' })
  }
  
  // Por ano - disponível se há pelo menos 12 meses de diferença
  if (monthsDifference >= 12) {
    intervals.push({ id: 'year', label: 'Por ano' })
  }
  
  return intervals
}

const getIntervalFormat = (interval: string) => {
  switch (interval) {
    case 'hour':
      return 'dd/MM HH:mm'
    case 'day':
      return 'dd/MM'
    case 'week':
      return 'dd/MM'
    case 'month':
      return 'MMM/yyyy'
    default:
      return 'dd/MM'
  }
}

const groupReadingsByInterval = (readings: ReservoirReading[], interval: string) => {
  const grouped: Record<string, ReservoirReading[]> = {}
  
  readings.forEach(reading => {
    const date = new Date(reading.readingDate)
    let key: string
    
    switch (interval) {
      case 'hour':
        key = format(date, 'yyyy-MM-dd HH:00')
        break
      case 'day':
        key = format(date, 'yyyy-MM-dd')
        break
      case 'week':
        const startOfWeek = new Date(date)
        startOfWeek.setDate(date.getDate() - date.getDay())
        key = format(startOfWeek, 'yyyy-MM-dd')
        break
      case 'month':
        key = format(date, 'yyyy-MM')
        break
      case 'year':
        key = format(date, 'yyyy')
        break
      case 'reading':
        // Para leituras individuais, cada leitura é seu próprio grupo
        key = reading.id
        break
      default:
        key = format(date, 'yyyy-MM-dd')
    }
    
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(reading)
  })
  
  return grouped
}

const calculateVariationByReading = (readings: ReservoirReading[]): ChartData[] => {
  if (readings.length < 2) return []
  
  const sortedReadings = readings.sort((a, b) => 
    new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime()
  )
  
  const chartData: ChartData[] = []
  
  for (let i = 1; i < sortedReadings.length; i++) {
    const currentReading = sortedReadings[i]
    const previousReading = sortedReadings[i - 1]
    
    const variation = currentReading.level - previousReading.level
    
    chartData.push({
      date: format(new Date(currentReading.readingDate), 'dd/MM HH:mm'),
      variation: variation,
      level: currentReading.level,
      temperature: currentReading.temperature,
      timestamp: new Date(currentReading.readingDate).getTime()
    })
  }
  
  return chartData
}

const calculateConsumption = (readings: ReservoirReading[], interval: string): ChartData[] => {
  if (interval === 'reading') {
    return calculateVariationByReading(readings)
  }
  
  const grouped = groupReadingsByInterval(readings, interval)
  const chartData: ChartData[] = []
  
  Object.keys(grouped)
    .sort()
    .forEach((key) => {
      const readingsInInterval = grouped[key]
      
      // Pegar a primeira e última leitura do intervalo para calcular o consumo
      const sortedReadings = readingsInInterval.sort((a, b) => 
        new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime()
      )
      
      const firstReading = sortedReadings[0]
      const lastReading = sortedReadings[sortedReadings.length - 1]
      
      let consumption = 0
      if (firstReading && lastReading) {
        // Consumo = nível inicial - nível final (positivo = consumo, negativo = abastecimento)
        consumption = firstReading.level - lastReading.level
      }
      
      const date = new Date(key)
      let dateFormat = 'yyyy-MM-dd'
      
      switch (interval) {
        case 'hour':
          dateFormat = 'yyyy-MM-dd HH:mm'
          break
        case 'week':
          dateFormat = 'yyyy-MM-dd'
          break
        case 'month':
          dateFormat = 'yyyy-MM'
          break
        case 'year':
          dateFormat = 'yyyy'
          break
        default:
          dateFormat = 'yyyy-MM-dd'
      }
      
      chartData.push({
        date: format(date, dateFormat),
        consumption: consumption,
        level: lastReading ? lastReading.level : 0,
        temperature: lastReading?.temperature,
        timestamp: date.getTime()
      })
    })
  
  return chartData
}

const processAccumulatedData = (readings: ReservoirReading[]): ChartData[] => {
  return readings
    .sort((a, b) => new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime())
    .map(reading => ({
      date: format(new Date(reading.readingDate), 'dd/MM'),
      level: reading.level,
      temperature: reading.temperature,
      timestamp: new Date(reading.readingDate).getTime()
    }))
}

export default function ReservoirGraphChart({ 
  readings, 
  viewMode, 
  dateRange, 
  interval = 'day',
  height = 300,
  reservoir,
  onIntervalChange
}: ReservoirGraphProps) {
  const [selectedInterval, setSelectedInterval] = useState<'hour' | 'day' | 'week' | 'month' | 'year' | 'reading'>(interval)
  
  // Sincronizar com o prop interval
  useEffect(() => {
    setSelectedInterval(interval)
  }, [interval])
  
  const handleIntervalChange = (newInterval: 'hour' | 'day' | 'week' | 'month' | 'year' | 'reading') => {
    setSelectedInterval(newInterval)
    onIntervalChange?.(newInterval)
  }
  
  const availableIntervals = useMemo(() => {
    if (!readings || readings.length === 0) return []
    
    // Filtrar leituras por período
    const filteredReadings = readings.filter(reading => {
      const readingDate = new Date(reading.readingDate)
      return readingDate >= dateRange.from && readingDate <= dateRange.to
    })
    
    return getAvailableIntervals(filteredReadings, dateRange)
  }, [readings, dateRange])
  
  const chartData = useMemo(() => {
    if (!readings || readings.length === 0) return []
    
    // Filtrar leituras por período
    const filteredReadings = readings.filter(reading => {
      const readingDate = new Date(reading.readingDate)
      return readingDate >= dateRange.from && readingDate <= dateRange.to
    })
    
    if (viewMode === 'accumulated') {
      return processAccumulatedData(filteredReadings)
    } else {
      return calculateConsumption(filteredReadings, selectedInterval)
    }
  }, [readings, viewMode, dateRange, selectedInterval])

  if (!readings || readings.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Nenhuma leitura disponível</p>
        </CardContent>
      </Card>
    )
  }

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Sem dados para o período selecionado</p>
        </CardContent>
      </Card>
    )
  }

  const title = `${reservoir?.name || 'Reservatório'} - ${viewMode === 'accumulated' ? 'Níveis' : 'Consumo'}`
  const description = viewMode === 'accumulated' 
    ? 'Histórico de níveis do reservatório' 
    : 'Consumo calculado por período'

  return (
    <Card className="h-full border-none pt-0">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            {/* <CardTitle className="text-lg">{title}</CardTitle> */}
            <CardDescription>{description}</CardDescription>
          </div>
          {viewMode === 'consumed' && availableIntervals.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {availableIntervals.map((intervalOption) => (
                <Button
                  key={intervalOption.id}
                  variant={selectedInterval === intervalOption.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIntervalChange(intervalOption.id as 'hour' | 'day' | 'week' | 'month' | 'year' | 'reading')}
                  className="text-xs h-7"
                >
                  {intervalOption.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {viewMode === 'accumulated' ? (
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 5,
                right: 10,
                left: -10,
                bottom: 20,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  try {
                    const date = parse(value, "yyyy-MM-dd", new Date())
                    if (!isNaN(date.getTime())) {
                      return format(date, "dd/MM")
                    }
                  } catch (error) {
                    console.warn(`Failed to parse date: ${value}`)
                  }
                  return String(value)
                }}
              />
              <YAxis 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => Number(value).toFixed(1)}
              />
              <ChartTooltip
                cursor={false}
                content={<CustomTooltipContent />}
              />
              
              {/* Linhas de referência para níveis mín/máx */}
              {reservoir?.minLevel && (
                <ReferenceLine 
                  y={reservoir.minLevel} 
                  stroke="#ef4444" 
                  strokeDasharray="5 5"
                  label="Mín"
                />
              )}
              {reservoir?.maxLevel && (
                <ReferenceLine 
                  y={reservoir.maxLevel} 
                  stroke="#22c55e" 
                  strokeDasharray="5 5"
                  label="Máx"
                />
              )}
              
              <Area 
                dataKey="level" 
                type="monotone"
                fill="var(--color-level)"
                fillOpacity={0.4}
                stroke="var(--color-level)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 5,
                right: 10,
                left: 20,
                bottom: 20,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  try {
                    const date = parse(value, "yyyy-MM-dd", new Date())
                    if (!isNaN(date.getTime())) {
                      return format(date, "dd/MM")
                    }
                  } catch (error) {
                    console.warn(`Failed to parse date: ${value}`)
                  }
                  return String(value)
                }}
              />
              <YAxis 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => Number(value).toFixed(1)}
              />
              <ChartTooltip
                cursor={false}
                content={<CustomTooltipContent />}
              />
              <Bar 
                dataKey="consumption" 
                fill="var(--color-consumption)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
