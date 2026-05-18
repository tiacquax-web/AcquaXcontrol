"use client"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { ptBR } from "date-fns/locale"
import type { Locale } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps {
  selected?: Date
  onSelect: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  locale?: Locale
  className?: string
}

/**
 * ✅ CORREÇÃO TIMEZONE (America/Sao_Paulo):
 * O react-day-picker retorna um Date com horário 00:00:00 em UTC local.
 * Para evitar que ao serializar para ISO string ocorra deslocamento de -3h
 * e a data apareça como D-1, normalizamos o Date para meio-dia local.
 */
function normalizeDateToLocalNoon(date: Date | undefined): Date | undefined {
  if (!date) return undefined;
  // Criar novo Date com hora 12:00:00 no horário local para evitar offsets UTC
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function DatePicker({ selected, onSelect, disabled, locale = ptBR, className }: DatePickerProps) {
  const handleSelect = (date: Date | undefined) => {
    onSelect(normalizeDateToLocalNoon(date));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn("w-full justify-start text-left font-normal", !selected && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP", { locale }) : <span>Selecione uma data</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          disabled={disabled}
          locale={locale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
