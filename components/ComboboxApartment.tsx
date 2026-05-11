"use client"

import { useEffect, useMemo, useState, forwardRef } from "react"
import { Check, ChevronsUpDown, DoorClosed, Loader2, X } from 'lucide-react'
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
import { useApartments } from "@/hooks/useApartments"
import type { Apartment, PermissionableEntity } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectApartmentProps {
  setSelectedApartment: (apartment: Apartment | undefined) => void
  required?: boolean
  apartment?: Apartment | undefined
  name?: string
  complexId?: string
  blockId?: string
  disabled?: boolean
  modal?: boolean
  getAvailableForEntity?: PermissionableEntity
  withComplex?: boolean
  withBlock?: boolean
  withCompany?: boolean
}

const SelectApartment = forwardRef<HTMLButtonElement, SelectApartmentProps>(
  ({ getAvailableForEntity, setSelectedApartment, apartment, required, name, complexId, blockId, disabled, modal = false, withComplex = false, withBlock = false, withCompany = false }, ref) => {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    // Busca apartamentos por bloco quando informado, ou por condomínio quando
    // o usuário quer filtrar apartamento sem restringir bloco.
    const { apartments, loading, error } = useApartments({ 
      getAvailableForEntity, 
      complexId, 
      blockId: blockId || undefined, 
      nameQuery: search,
      enabled: !!(blockId || complexId) && !disabled,
      withComplex,
      withBlock,
      withCompany
    })
    const safeApartments = useMemo(() => Array.isArray(apartments) ? apartments : [], [apartments])
    const [selectedId, setSelectedId] = useState<string | undefined>(apartment?.id)

    useEffect(() => {
      // Update selectedId when apartment prop changes
      if (apartment?.id && apartment.id !== selectedId) {
        setSelectedId(apartment.id)
      } else if (!apartment && selectedId) {
        setSelectedId(undefined)
      }
    }, [apartment, selectedId])

    const handleSelect = (value: string) => {
      if (value === selectedId) {
        // Deselect if clicking the same item
        setSelectedId(undefined)
        setSelectedApartment(undefined)
      } else {
        const selectedApartment = safeApartments.find((a) => a.id === value)
        if (selectedApartment) {
          setSelectedId(value)
          setSelectedApartment(selectedApartment)
        }
      }
      setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedId(undefined)
      setSelectedApartment(undefined)
    }

    // Find the selected apartment name for display
    const selectedApartmentName = selectedId 
      ? safeApartments.find(a => a.id === selectedId)?.name || apartment?.name || "Apartamento selecionado"
      : ""

    if (error) {
      return <div className="text-red-500">Erro para carregar apartmentos: {error.toString()}</div>
    }

    return (
      <Popover open={open} onOpenChange={setOpen} modal>
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
            disabled={disabled || !(blockId || complexId)}
          >
            <DoorClosed className="h-4 w-4" />
            {selectedId ? selectedApartmentName : <span className="text-start w-full">Apartamento...</span>}
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
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar apartamento..." 
              value={search}
              onValueChange={setSearch}
              autoFocus
              className="h-9"
            />
            {loading ? (
              <div className="py-6 text-center flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Carregando...</span>
              </div>
            ) : (
              <>
                <CommandEmpty>Nenhum apartamento encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {safeApartments.map((apartment) => (
                      <CommandItem
                        key={apartment.id}
                        value={apartment.id}
                        onSelect={handleSelect}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedId === apartment.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {apartment.name}
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

SelectApartment.displayName = "SelectApartment"

export default SelectApartment
