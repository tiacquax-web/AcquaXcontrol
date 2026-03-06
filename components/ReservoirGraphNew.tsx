"use client"

import { useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ReservoirReading {
  id: string
  level: number
  readingDate: Date | string
  receivedAt: Date | string
  temperature?: number
  batteryVoltage?: number
  signalQuality?: number
}

interface ReservoirGraphProps {
  readings: ReservoirReading[]
  viewMode: 'accumulated' | 'consumed'
  dateRange: { from: Date, to: Date }
  interval?: 'hour' | 'day' | 'week' | 'month'
  height?: number
  reservoir?: {
    name: string
    type: string
    capacity?: number
    minLevel?: number
    maxLevel?: number
  }
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
        key = format(date, 'yyyy-MM-dd HH:00', { locale: ptBR })
        break
      case 'day':
        key = format(date, 'yyyy-MM-dd', { locale: ptBR })
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = format(weekStart, 'yyyy-MM-dd', { locale: ptBR })
        break
      case 'month':
        key = format(date, 'yyyy-MM', { locale: ptBR })
        break
      default:
        key = format(date, 'yyyy-MM-dd', { locale: ptBR })
    }
    
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(reading)
  })
  
  return grouped
}

const calculateConsumption = (readings: ReservoirReading[], interval: string) => {
  const grouped = groupReadingsByInterval(readings, interval)
  const consumptionData: Array<{ date: string, consumption: number, avgLevel: number, displayDate: string }> = []
  
  const sortedKeys = Object.keys(grouped).sort()
  
  for (let i = 0; i < sortedKeys.length; i++) {
    const currentKey = sortedKeys[i]
    const currentReadings = grouped[currentKey]
    
    const currentReading = currentReadings.sort((a, b) => 
      new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime()
    )[0]
    
    const previousKey = sortedKeys[i - 1]
    let consumption = 0
    
    if (previousKey) {
      const previousReadings = grouped[previousKey]
      const previousReading = previousReadings.sort((a, b) => 
        new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime()
      )[0]
      
      consumption = Math.max(0, previousReading.level - currentReading.level)
    }
    
    const avgLevel = currentReadings.reduce((sum, r) => sum + r.level, 0) / currentReadings.length
    
    consumptionData.push({
      date: currentKey,
      consumption,
      avgLevel,
      displayDate: format(new Date(currentKey), getIntervalFormat(interval), { locale: ptBR })
    })
  }
  
  return consumptionData
}

const CustomTooltip = ({ active, payload, label, viewMode }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-md">
        <p className="text-sm font-medium">{`Data: ${data.displayDate || label}`}</p>
        {viewMode === 'accumulated' ? (
          <p className="text-sm text-blue-600">
            {`Nível: ${payload[0].value.toFixed(2)} m`}
          </p>
        ) : (
          <p className="text-sm text-green-600">
            {`Consumo: ${payload[0].value.toFixed(2)} m³`}
          </p>
        )}
        {data.temperature && (
          <p className="text-sm text-orange-600">
            {`Temperatura: ${data.temperature.toFixed(1)}°C`}
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function ReservoirGraph({
  readings,
  viewMode,
  dateRange,
  interval = 'day',
  height = 300,
  reservoir
}: ReservoirGraphProps) {
  const filteredReadings = useMemo(() => {
    return readings.filter(reading => {
      const readingDate = new Date(reading.readingDate)
      return readingDate >= dateRange.from && readingDate <= dateRange.to
    }).sort((a, b) => new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime())
  }, [readings, dateRange])

  const chartData = useMemo(() => {
    if (viewMode === 'accumulated') {
      return filteredReadings.map(reading => ({
        date: new Date(reading.readingDate).getTime(),
        level: reading.level,
        temperature: reading.temperature,
        displayDate: format(new Date(reading.readingDate), getIntervalFormat(interval), { locale: ptBR })
      }))
    } else {
      return calculateConsumption(filteredReadings, interval)
    }
  }, [filteredReadings, viewMode, interval])

  if (filteredReadings.length === 0) {
    return (
      <div 
        className="w-full bg-muted/20 rounded flex items-center justify-center"
        style={{ height: `${height}px` }}
      >
        <p className="text-sm text-muted-foreground">
          Nenhuma leitura encontrada no período selecionado
        </p>
      </div>
    )
  }

  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        {viewMode === 'accumulated' ? (
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="displayDate"
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ value: 'Nível (m)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip viewMode={viewMode} />} />
            <Line 
              type="monotone" 
              dataKey="level" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ r: 3, fill: "#3b82f6" }}
              activeDot={{ r: 5 }}
            />
            {/* Linhas de referência */}
            {reservoir?.capacity && (
              <ReferenceLine 
                y={reservoir.capacity} 
                stroke="#ef4444" 
                strokeDasharray="5 5" 
                label="Capacidade Máxima"
              />
            )}
            {reservoir?.minLevel && (
              <ReferenceLine 
                y={reservoir.minLevel} 
                stroke="#f59e0b" 
                strokeDasharray="5 5" 
                label="Nível Mínimo"
              />
            )}
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="displayDate"
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ value: 'Consumo (m³)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip viewMode={viewMode} />} />
            <Bar 
              dataKey="consumption" 
              fill="#22c55e" 
              stroke="#16a34a"
              strokeWidth={1}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
