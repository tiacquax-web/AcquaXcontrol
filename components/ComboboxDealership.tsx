"use client"

import type React from "react"

import { useEffect, useState, forwardRef } from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDealerships } from "@/hooks/useDealerships"
import type { Dealership } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectDealershipProps {
    setSelectedDealership: (dealership: Dealership | undefined) => void
    required?: boolean
    dealership?: Partial<Dealership> | undefined
    name?: string
    disabled?: boolean
    modal?: boolean
}

const SelectDealership = forwardRef<HTMLButtonElement, SelectDealershipProps>(
    ({ setSelectedDealership, dealership, required, name, disabled, modal = false }, ref) => {
        const [open, setOpen] = useState(false)
        const [search, setSearch] = useState("")
        const { dealerships, loading, error } = useDealerships({ search })
        const [selectedId, setSelectedId] = useState<string | undefined>(dealership?.id)

        useEffect(() => {
            // Update selectedId when dealership prop changes
            if (dealership) {
                setSelectedId(dealership.id)
            } else {
                setSelectedId(undefined)
            }
        }, [dealership])

        const handleSelect = (value: string) => {
            if (value === selectedId) {
                // Deselect if clicking the same item
                setSelectedId(undefined)
                setSelectedDealership(undefined)
            } else {
                const selectedDealership = dealerships.find((d) => d.id === value)
                if (selectedDealership) {
                    setSelectedId(value)
                    setSelectedDealership(selectedDealership)
                }
            }
            setOpen(false)
        }

        const handleClear = (e: React.MouseEvent) => {
            e.stopPropagation()
            setSelectedId(undefined)
            setSelectedDealership(undefined)
        }

        // Find the selected dealership name for display
        const selectedDealershipName = selectedId
            ? dealerships.find((d) => d.id === selectedId)?.name || dealership?.name || "Concessionária selecionada"
            : ""

        if (error) {
            return <div className="text-red-500">Erro para carregar concessionárias: {error.toString()}</div>
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
                        {selectedId ? selectedDealershipName : <span className="text-start w-full">Selecione uma concessionária...</span>}
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
                            placeholder="Buscar concessionária..."
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
                                <CommandEmpty>Nenhuma concessionária encontrada.</CommandEmpty>
                                <CommandGroup>
                                    <CommandList>
                                        {dealerships.map((dealership) => (
                                            <CommandItem
                                                key={dealership.id}
                                                value={dealership.id}
                                                onSelect={handleSelect}
                                                className="cursor-pointer"
                                            >
                                                <Check
                                                    className={cn("mr-2 h-4 w-4", selectedId === dealership.id ? "opacity-100" : "opacity-0")}
                                                />
                                                {dealership.name}
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

SelectDealership.displayName = "SelectDealership"

export default SelectDealership
