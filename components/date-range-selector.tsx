"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { format, subMonths } from "date-fns"
import { ptBR } from "date-fns/locale"

interface DateRangeSelectorProps {
  onDateRangeChange?: ({from, to}:{from: Date, to: Date}) => void
}

export function DateRangeSelector({ onDateRangeChange }: DateRangeSelectorProps) {
  const today = new Date()
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const [startDate, setStartDate] = useState<Date>(subMonths(firstDayOfMonth, 1))
  const [endDate, setEndDate] = useState<Date>(lastDayOfMonth)
  const [isStartOpen, setIsStartOpen] = useState(false)
  const [isEndOpen, setIsEndOpen] = useState(false)

  const handleStartDateChange = (year: number, month: number) => {
    const date = new Date(year, month, 1)
    setStartDate(date)
    setIsStartOpen(false)
    if (onDateRangeChange) {
      onDateRangeChange({from:date, to: endDate})
    }
  }

  const handleEndDateChange = (year: number, month: number) => {
    const date = new Date(year, month + 1, 0)
    setEndDate(date)
    setIsEndOpen(false)
    if (onDateRangeChange) {
      onDateRangeChange({from:startDate, to: date})
    }
  }

  const presets = [
    {
      name: "Este mês",
      startDate: firstDayOfMonth,
      endDate: lastDayOfMonth,
    },
    {
      name: "Mês passado",
      startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      endDate: new Date(today.getFullYear(), today.getMonth(), 0),
    },
    {
      name: "Últimos 3 meses",
      startDate: new Date(today.getFullYear(), today.getMonth() - 3, 1),
      endDate: lastDayOfMonth,
    },
    {
      name: "Este ano",
      startDate: new Date(today.getFullYear(), 0, 1),
      endDate: new Date(today.getFullYear(), 11, 31),
    },
  ]

  const handlePresetChange = (value: string) => {
    const preset = presets.find((p) => p.name === value)
    if (preset) {
      setStartDate(preset.startDate)
      setEndDate(preset.endDate)
      if (onDateRangeChange) {
        onDateRangeChange({from: preset.startDate, to: preset.endDate})
      }
    }
  }

  const years = Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i)
  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]

  return (
    <div className="flex flex-row sm:flex-row items-center gap-2">
      <Select onValueChange={handlePresetChange}>
        <SelectTrigger className="w-fit">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {/* <SelectValue placeholder="Período" /> */}
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.name} value={preset.name} className="cursor-pointer">
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-fit justify-start text-left font-normal", !startDate && "text-muted-foreground")}
            >
              {startDate ? format(startDate, "MMM yyyy", { locale: ptBR }) : <span>Início</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="flex gap-2">
              <Select
                onValueChange={(value) => handleStartDateChange(Number(value), startDate.getMonth())}
                defaultValue={String(startDate.getFullYear())}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => handleStartDateChange(startDate.getFullYear(), Number(value))}
                defaultValue={String(startDate.getMonth())}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={month} value={String(index)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground">-</span>

        <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-fit justify-start text-left font-normal", !endDate && "text-muted-foreground")}
            >
              {endDate ? format(endDate, "MMM yyyy", { locale: ptBR }) : <span>Fim</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="flex gap-2">
              <Select
                onValueChange={(value) => handleEndDateChange(Number(value), endDate.getMonth())}
                defaultValue={String(endDate.getFullYear())}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => handleEndDateChange(endDate.getFullYear(), Number(value))}
                defaultValue={String(endDate.getMonth())}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={month} value={String(index)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
