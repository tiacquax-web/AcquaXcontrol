"use client"

import { useEffect, useState, forwardRef } from "react"
import { Check, ChevronsUpDown, Gauge, GaugeCircle, Loader2, X } from 'lucide-react'
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
import { useMeters } from "@/hooks/useMeters" // Hook para buscar os meters
import type { Meter } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectMeterProps {
    setSelectedMeter: (meter: Meter | undefined) => void
    required?: boolean
    meter?: Meter | undefined
    register?: string
    apartmentId?: string
    disabled?: boolean
    modal?: boolean
    allowAll?: boolean // Nova prop para permitir buscar todos os medidores
}

const SelectMeter = forwardRef<HTMLButtonElement, SelectMeterProps>(
    ({ setSelectedMeter, meter, required, register, apartmentId, disabled, modal = true, allowAll = false }, ref) => {
        const [open, setOpen] = useState(false)
        const [search, setSearch] = useState("")
        // Busca meters quando há apartmentId OU quando allowAll é true
        const shouldFetch = (!!apartmentId || allowAll) && !disabled;
        const { meters, loading, error } = useMeters({ 
            apartmentId: apartmentId || undefined, 
            nameQuery: search,
            enabled: shouldFetch
        })
        const [selectedId, setSelectedId] = useState<string | undefined>(meter?.id)

        useEffect(() => {
            // Atualiza selectedId quando a prop meter muda
            if (meter) {
                setSelectedId(meter.id)
            } else {
                setSelectedId(undefined)
            }
        }, [meter])

        const handleSelect = (value: string) => {
            if (value === selectedId) {
                // Deseleciona se clicar no mesmo item
                setSelectedId(undefined)
                setSelectedMeter(undefined)
            } else {
                const selectedMeter = meters.find((m) => m.id === value)
                if (selectedMeter) {
                    setSelectedId(value)
                    setSelectedMeter(selectedMeter)
                }
            }
            setOpen(false)
        }

        const handleClear = (e: React.MouseEvent) => {
            e.stopPropagation()
            setSelectedId(undefined)
            setSelectedMeter(undefined)
        }

        // Encontra o nome do medidor selecionado para exibição
        const selectedMeterRegister = selectedId 
            ? meters.find(m => m.id === selectedId)?.register || meter?.register || "Medidor selecionado"
            : ""

        if (error) {
            return <div className="text-red-500">Erro ao carregar medidores: {error.toString()}</div>
        }

        return (
            <Popover open={open} onOpenChange={setOpen} modal={modal}>
                <PopoverTrigger asChild>
                    <Button
                        ref={ref}
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-required={required}
                        className={cn(
                            "w-full justify-between",
                            !selectedId && "text-muted-foreground"
                        )}
                        disabled={disabled || (!apartmentId && !allowAll)}
                    >
                        <Gauge className="h-4 w-4" />
                        {selectedId ? selectedMeterRegister : "Medidor..."}
                        <div className="flex items-center ml-2">
                            {selectedId && (
                                <div
                                    className="h-4 w-4 p-0 mr-1 cursor-pointer"
                                    onClick={handleClear}
                                >
                                    <X className="h-3 w-3" />
                                    <span className="sr-only">Limpar</span>
                                </div>
                            )}
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput 
                            placeholder="Buscar medidor..." 
                            value={search}
                            onValueChange={setSearch}
                            className="h-9"
                        />
                        {loading ? (
                            <div className="py-6 text-center flex items-center justify-center">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                <span className="text-sm text-muted-foreground">Carregando...</span>
                            </div>
                        ) : (
                            <>
                                <CommandEmpty>Nenhum medidor encontrado.</CommandEmpty>
                                <CommandGroup>
                                    <CommandList>
                                        {meters.map((meter) => (
                                            <CommandItem
                                                key={meter.id}
                                                value={meter.id}
                                                onSelect={handleSelect}
                                                className="cursor-pointer"
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedId === meter.id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{meter.register}</span>
                                                    {allowAll && (meter as any).apartment && (
                                                        <span className="text-sm text-muted-foreground">
                                                            {(meter as any).apartment.name} • {(meter as any).apartment.block?.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandList>
                                </CommandGroup>
                            </>
                        )}
                    </Command>
                </PopoverContent>
            </Popover>
        )
    }
)

SelectMeter.displayName = "SelectMeter"

export default SelectMeter
