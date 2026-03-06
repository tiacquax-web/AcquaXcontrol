"use client"

import * as React from "react"
import { addDays, format, subDays } from "date-fns"
import { CalendarIcon } from 'lucide-react'
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  isRangeable?: boolean
  // onDateChange?: (date: Date | undefined) => void
  // onDateRangeChange?: (dateRange: DateRange | undefined) => void
  // initialDate?: Date
  // initialDateRange?: DateRange
  quickSelectDays?: number[]
  className?: string
  dateRange?: DateRange
  date?: Date
  setDate?: React.Dispatch<React.SetStateAction<Date | undefined>>
  setDateRange?: React.Dispatch<React.SetStateAction<DateRange | undefined>>
  minDaysBack?: number // Nova prop para limitar quantos dias para trás
  maxDate?: Date // Nova prop para data máxima
}

export function DatePickerComponent({
  isRangeable = false,
  // onDateChange,
  // onDateRangeChange,
  // initialDate,
  // initialDateRange,
  quickSelectDays,
  className,
  dateRange,
  date,
  setDate,
  setDateRange,
  minDaysBack = 90, // Padrão: 90 dias para trás
  maxDate = new Date() // Padrão: hoje
}: DatePickerProps) {
  // const [date, setDate] = React.useState<Date | undefined>(initialDate)
  // const [dateRange, setDateRange] = React.useState<DateRange | undefined>(initialDateRange)

  // Calcula a data mínima permitida
  const minDate = subDays(maxDate, minDaysBack);
  
  // Função para verificar se uma data está desabilitada
  const isDateDisabled = (date: Date) => {
    return date < minDate || date > maxDate;
  };

  const handleSelect = (value: Date | DateRange | undefined) => {
    if (value instanceof Date) {
      setDate && setDate(value)
      setDateRange && setDateRange(undefined)
      // onDateChange?.(value)
      // if (isRangeable) {
      //   onDateRangeChange?.(undefined)
      // }
    } else if (value && 'from' in value) {
      setDateRange && setDateRange(value)
      setDate && setDate(undefined)
      // if (isRangeable) {
      //   onDateRangeChange?.(value)
      // } else {
      //   onDateChange?.(value.from)
      // }
    } else {
      setDate && setDate(undefined)
      setDateRange && setDateRange(undefined)
      // onDateChange?.(undefined)
      // if (isRangeable) {
      //   onDateRangeChange?.(undefined)
      // }
    }
  }

  const handleQuickSelect = (days: number) => {
    const to = new Date()
    const from = subDays(to, days - 1)
    const newRange = { from, to }
    setDateRange && setDateRange(newRange)
    setDate && setDate(undefined)
    // if (isRangeable) {
    //   onDateRangeChange?.(newRange)
    // } else {
    //   onDateChange?.(from)
    // }
  }

  React.useEffect(() => {
  }, [dateRange])

  const displayDate = isRangeable && dateRange?.from ? (
    dateRange.to ? (
      <>
        {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
      </>
    ) : (
      format(dateRange.from, "LLL dd, y")
    )
  ) : date ? (
    format(date, "LLL dd, y")
  ) : (
    <span>Selecione uma Data</span>
  )

  return (
    <div className={"flex flex-col items-center space-y-4" + (className ? ` ${className}` : "")}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date-picker-button"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && !dateRange && "text-muted-foreground"
            )}
            aria-label={isRangeable ? "Select date range" : "Select date"}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayDate}
          </Button>
        </PopoverTrigger>
        <PopoverContent className={`w-auto p-0 ${quickSelectDays ? 'pt-4' : ''}`} align="start">
              {quickSelectDays && quickSelectDays.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2 px-4">
                  {quickSelectDays.map((days) => (
                    <Button
                      key={days}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickSelect(days)}
                    >
                      {days} {days === 1 ? 'Dia' : 'Dias'}
                    </Button>
                  ))}
                </div>
              )}
              {isRangeable ? (
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from || new Date()}
                  selected={dateRange}
                  onSelect={handleSelect}
                  numberOfMonths={2}
                  className="rounded-md border shadow px-4"
                  disabled={isDateDisabled}
                  fromDate={minDate}
                  toDate={maxDate}
                />
              ) : (
                <Calendar
                  initialFocus
                  mode="single"
                  defaultMonth={date || new Date()}
                  selected={date}
                  onSelect={handleSelect}
                  numberOfMonths={1}
                  className="rounded-md border shadow px-4"
                  disabled={isDateDisabled}
                  fromDate={minDate}
                  toDate={maxDate}
                />
              )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

