"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Droplets } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

interface Reservoir {
  id: string
  name: string
  type: string
  location?: string
  isActive?: boolean
  company?: {
    id: string
    name: string
  }
}

interface ComboboxReservoirProps {
  value?: string
  onValueChange?: (value: string) => void
  companyId?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Hook para buscar reservatórios
const useReservoirs = (companyId?: string) => {
  const [reservoirs, setReservoirs] = React.useState<Reservoir[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const fetchReservoirs = async () => {
      try {
        setLoading(true)
        
        const params = new URLSearchParams({
          take: '100',
          orderBy: 'name',
          orderDirection: 'asc',
          is_active: 'true' // Só reservatórios ativos
        })

        if (companyId) {
          params.append('company_id', companyId)
        }

        const response = await fetch(`/api/reservoirs?${params}`)
        
        if (!response.ok) {
          throw new Error('Erro ao carregar reservatórios')
        }

        const result = await response.json()
        setReservoirs(result.reservoirs || [])
      } catch (error) {
        console.error('Error fetching reservoirs:', error)
        setReservoirs([])
      } finally {
        setLoading(false)
      }
    }

    fetchReservoirs()
  }, [companyId])

  return { reservoirs, loading }
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
    WATER: 'bg-blue-100 text-blue-800 border-blue-200',
    FUEL: 'bg-orange-100 text-orange-800 border-orange-200',
    CHEMICAL: 'bg-purple-100 text-purple-800 border-purple-200',
    OTHER: 'bg-gray-100 text-gray-800 border-gray-200'
  }
  return colors[type] || colors.OTHER
}

export default function ComboboxReservoir({
  value,
  onValueChange,
  companyId,
  placeholder = "Selecione um reservatório...",
  disabled = false,
  className
}: ComboboxReservoirProps) {
  const [open, setOpen] = React.useState(false)
  const { reservoirs, loading } = useReservoirs(companyId)

  const selectedReservoir = reservoirs.find(reservoir => reservoir.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
          disabled={disabled || loading}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Droplets className="h-4 w-4 text-blue-500 flex-shrink-0" />
            {selectedReservoir ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{selectedReservoir.name}</span>
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getReservoirTypeColor(selectedReservoir.type))}
                >
                  {getReservoirTypeLabel(selectedReservoir.type)}
                </Badge>
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Buscar reservatório..." />
          <CommandList>
            <CommandEmpty>
              {loading ? "Carregando reservatórios..." : "Nenhum reservatório encontrado."}
            </CommandEmpty>
            <CommandGroup>
              {reservoirs.map((reservoir) => (
                <CommandItem
                  key={reservoir.id}
                  value={reservoir.id}
                  onSelect={(currentValue) => {
                    onValueChange?.(currentValue === value ? "" : currentValue)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === reservoir.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Droplets className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{reservoir.name}</span>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getReservoirTypeColor(reservoir.type))}
                      >
                        {getReservoirTypeLabel(reservoir.type)}
                      </Badge>
                    </div>
                    {reservoir.location && (
                      <p className="text-xs text-muted-foreground truncate">
                        {reservoir.location}
                      </p>
                    )}
                    {reservoir.company && (
                      <p className="text-xs text-muted-foreground truncate">
                        {reservoir.company.name}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
