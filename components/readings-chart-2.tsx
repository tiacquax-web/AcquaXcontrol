"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { X } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { format, parse } from "date-fns"

export interface ConsumptionData {
  [key: string]: string | number
}

export interface ConsumptionChartConfig {
  [key: string]: {
    label: string
    color: string
    className?: string
  }
}

export type DateFormat =
  | "MMM"
  | "MMM yy"
  | "MMM yyyy"
  | "MM/dd"
  | "MM/dd/yy"
  | "MM/dd/yyyy"
  | "yyyy-MM-dd"
  | "dd/MM"
  | "dd/MM HH:mm"
  | "dd/MMM"

export interface ConsumptionChartProps {
  type?: "area" | "bar"
  title: string
  description: string
  data: ConsumptionData[]
  config: ConsumptionChartConfig
  height?: number
  xAxisKey: string
  xAxisLabel: string
  dateFormat?: DateFormat
  footer?: React.ReactNode
  onSelectPoint?: (period: any) => void
  onRemove?: () => void
}

const getMinMaxValues = (data: ConsumptionData[], dataKeys: string[]) => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  data.forEach((item) => {
    dataKeys.forEach((key) => {
      const value = Number(item[key])
      if (!isNaN(value) && isFinite(value)) {
        if (value < min) min = value
        if (value > max) max = value
      }
    })
  })

  // Se não encontrou valores válidos, use defaults
  if (!isFinite(min)) min = 0
  if (!isFinite(max)) max = 100

  return { min, max }
}

const getFullVariation = (data: ConsumptionData[], dataKeys: string[]) => {
  const key = dataKeys[0]

  const validValues = data
    .map((item) => Number(item[key]))
    .filter(value => !isNaN(value) && isFinite(value))
    .sort((a, b) => a - b)

  if (validValues.length === 0) return 0

  return validValues[validValues.length - 1] - validValues[0]
}


export default function ReadingsChart2({
  type = "area",
  title,
  description,
  data,
  config,
  height,
  xAxisKey,
  xAxisLabel,
  dateFormat,
  footer,
  onSelectPoint,
  onRemove,
}: ConsumptionChartProps) {
  const dataKeys = Object.keys(config)

  const formatTickValue = (value: string | number) => {
    if (typeof value === "string") {
      const parsedISO = new Date(value)
      if (!isNaN(parsedISO.getTime())) {
        const pattern: DateFormat = dateFormat ?? (value.includes("T") ? "dd/MM HH:mm" : "dd/MM")
        try {
          return format(parsedISO, pattern)
        } catch (error) {
          console.warn(`Failed to format tick value ${value}`, error)
          return format(parsedISO, "dd/MM HH:mm")
        }
      }
      if (dateFormat) {
        try {
          const parsed = parse(value, "yyyy-MM-dd", new Date())
          if (!isNaN(parsed.getTime())) {
            return format(parsed, dateFormat)
          }
        } catch (error) {
          console.warn(`Failed to parse tick with custom format ${value}`, error)
        }
      }
    }
    return String(value)
  }

  // Validação de dados
  if (!data || data.length === 0) {
    console.warn("ReadingsChart2: No data provided")
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description || "Nenhum dado disponível"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Nenhum dado para exibir
          </div>
        </CardContent>
        {footer && <CardFooter>{footer}</CardFooter>}
      </Card>
    )
  }
  const { min, max } = getMinMaxValues(data, dataKeys)
  const fullVariation = getFullVariation(data, dataKeys)
  const maxVariationPossible = Math.ceil(Math.max(max, Math.abs(min)))

  // Cálculo mais seguro para Y-axis
  let yAxisMin = min
  let yAxisMax = max

  if (fullVariation > 0) {
    yAxisMin = Math.floor(min - fullVariation * 0.1)
    yAxisMax = Math.ceil(max + fullVariation * 0.1)
  } else {
    // Se não há variação, adiciona um buffer padrão
    const buffer = Math.max(Math.abs(min) * 0.1, 1)
    yAxisMin = min - buffer
    yAxisMax = max + buffer
  }

  console.log({
    component: "ReadingsChart2",
    dataKeys,
    min,
    max,
    fullVariation,
    maxVariationPossible,
    yAxisMin,
    yAxisMax,
    dataLength: data.length,
    dataSample: data.slice(0, 5),
    config,
    type,
    xAxisKey,
    xAxisLabel,
    dateFormat,
  })

  console.log("Y Axis Scale:", { yAxisMin, yAxisMax })

  return (
    <Card className="h-full">
      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {onRemove && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {type === "area" && (
          <ChartContainer config={config} className="w-full" style={{ height: `${height ?? 250}px` }}>
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{
                right: 0,
                left: dataKeys.some(key => data.some(d => String(Number(d[key])).length > 6)) ? 12 : 0,
              }}
              onClick={(state: any) => {
                if (onSelectPoint && state && state.activePayload && state.activePayload.length > 0) {
                  onSelectPoint(state.activePayload[0].payload)
                }
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={xAxisKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatTickValue}
                label={{ value: xAxisLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis domain={[yAxisMin, yAxisMax]} tickLine={false} axisLine={false} tickMargin={8}
                tickFormatter={(value) => Number(value).toFixed(3)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              {dataKeys.map((key) => (
                <Area
                  key={key}
                  dataKey={key}
                  type="monotone"
                  fill={`var(--color-${key})`}
                  fillOpacity={0.4}
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
        {type === "bar" && (
          <ChartContainer config={config} className="w-full" style={{ height: `${height ?? 250}px` }}>
            <BarChart
              accessibilityLayer
              data={data}
              margin={{
                right: 0,
              }}            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={xAxisKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatTickValue}
                label={{ value: xAxisLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis domain={[0, maxVariationPossible]} tickLine={false} axisLine={false} tickMargin={8}
                tickFormatter={(value) => Number(value).toFixed(3)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />              {dataKeys.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  className={config[key].className}
                  onClick={
                    (state: any) => {
                      if (onSelectPoint) {
                        onSelectPoint({
                          [key]: state[key],
                          [xAxisKey]: state[xAxisKey],
                        })
                      }
                    }
                  }
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
}

