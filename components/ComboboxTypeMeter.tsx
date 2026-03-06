"use client"

import type React from "react"

import { useEffect, useState, forwardRef } from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTypeMeters } from "@/hooks/useTypeMeters"
import type { TypeMeter } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectTypeMeterProps {
    setSelectedTypeMeter: (typeMeter: TypeMeter | undefined) => void
    required?: boolean
    typeMeter?: Partial<TypeMeter> | undefined
    name?: string
    disabled?: boolean
    modal?: boolean
}

const SelectTypeMeter = forwardRef<HTMLButtonElement, SelectTypeMeterProps>(
    ({ setSelectedTypeMeter, typeMeter, required, name, disabled, modal=false }, ref) => {
        const [open, setOpen] = useState(false)
        const [search, setSearch] = useState("")
        const { typeMeters, loading, error } = useTypeMeters({ nameQuery: search })
        const [selectedId, setSelectedId] = useState<string | undefined>(typeMeter?.id)

        useEffect(() => {
            // Update selectedId when typeMeter prop changes
            if (typeMeter) {
                setSelectedId(typeMeter.id)
            } else {
                setSelectedId(undefined)
            }
        }, [typeMeter])

        const handleSelect = (value: string) => {
            if (value === selectedId) {
                // Deselect if clicking the same item
                setSelectedId(undefined)
                setSelectedTypeMeter(undefined)
            } else {
                const selectedTypeMeter = typeMeters.find((tm) => tm.id === value) as TypeMeter | undefined
                if (selectedTypeMeter) {
                    setSelectedId(value)
                    setSelectedTypeMeter(selectedTypeMeter)
                }
            }
            setOpen(false)
        }

        const handleClear = (e: React.MouseEvent) => {
            e.stopPropagation()
            setSelectedId(undefined)
            setSelectedTypeMeter(undefined)
        }

        // Find the selected typeMeter name for display
        const selectedTypeMeterName = selectedId
            ? typeMeters.find((tm) => tm.id === selectedId)?.name || typeMeter?.name || "Tipo de medidor selecionado"
            : ""

        if (error) {
            return <div className="text-red-500">Erro para carregar tipos de medidores: {error.toString()}</div>
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
                        className={cn("w-full justify-between", !selectedId && "text-muted-foreground")}
                        disabled={disabled}
                    >
                        {selectedId ? selectedTypeMeterName : "Selecione um tipo de medidor..."}
                        <div className="flex items-center ml-2">
                            {selectedId && (
                                <div className="cursor-pointer h-4 w-4 p-0 mr-1" onClick={handleClear}>
                                    <X className="h-3 w-3" />
                                    <span className="sr-only">Limpar</span>
                                </div>
                            )}
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    avoidCollisions={true}
                    collisionPadding={20}
                    forceMount
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Buscar tipo de medidor..."
                            value={search}
                            onValueChange={setSearch}
                            className="h-9"
                            autoFocus
                        />
                        {loading ? (
                            <div className="py-6 text-center flex items-center justify-center">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                <span className="text-sm text-muted-foreground">Carregando...</span>
                            </div>
                        ) : (
                            <>
                                <CommandEmpty>Nenhum tipo de medidor encontrado.</CommandEmpty>
                                <CommandGroup>
                                    <CommandList>
                                        {typeMeters.map((typeMeter) => (
                                            <CommandItem key={typeMeter.id} value={typeMeter.id} onSelect={handleSelect} className="cursor-pointer">
                                                <Check
                                                    className={cn("mr-2 h-4 w-4", selectedId === typeMeter.id ? "opacity-100" : "opacity-0")}
                                                />
                                                {typeMeter.name} ({typeMeter.acronym})
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
    },
)

SelectTypeMeter.displayName = "SelectTypeMeter"

export default SelectTypeMeter
