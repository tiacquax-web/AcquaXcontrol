"use client"

import type React from "react"

import { useEffect, useState, forwardRef } from "react"
import { Building2, Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useComplexes } from "@/hooks/useComplexes"
import type { Complex, PermissionableEntity } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectComplexProps {
  setSelectedComplex: (complex: Complex | undefined) => void
  required?: boolean
  companyId?: string
  complex?: Partial<Complex> | undefined
  name?: string
  disabled?: boolean
  getAvailableForEntity?: PermissionableEntity
  modal?: boolean
  withCompany?: boolean
  /** Quando true, oculta o seletor se o usuário só tem acesso a 1 condomínio (auto-seleciona) */
  autoSelectSingle?: boolean
}

const SelectComplex = forwardRef<HTMLButtonElement, SelectComplexProps>(
  ({ getAvailableForEntity, setSelectedComplex, complex, required, name, disabled, modal = false, withCompany = false, companyId, autoSelectSingle = true }, ref) => {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const { complexes, loading, error } = useComplexes({ 
      nameQuery: search, 
      companyId,
      getAvailableForEntity,
      enabled: !disabled,
      withCompany
    })
    const [selectedId, setSelectedId] = useState<string | undefined>(complex?.id)
    const [autoSelected, setAutoSelected] = useState(false)

    useEffect(() => {
      if (complex) {
        setSelectedId(complex.id)
      } else {
        setSelectedId(undefined)
      }
    }, [complex])

    // Auto-seleciona quando só há 1 condomínio disponível
    useEffect(() => {
      if (autoSelectSingle && !loading && complexes.length === 1 && !selectedId && !autoSelected) {
        setSelectedId(complexes[0].id)
        setSelectedComplex(complexes[0])
        setAutoSelected(true)
      }
    }, [complexes, loading, autoSelectSingle, selectedId, autoSelected, setSelectedComplex])

    const handleSelect = (value: string) => {
      if (value === selectedId) {
        // Deselect if clicking the same item
        setSelectedId(undefined)
        setSelectedComplex(undefined)
      } else {
        const selectedComplex = complexes.find((c) => c.id === value)
        if (selectedComplex) {
          setSelectedId(value)
          setSelectedComplex(selectedComplex)
        }
      }
      setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedId(undefined)
      setSelectedComplex(undefined)
    }

    // Find the selected complex name for display
    const selectedComplexName = selectedId
      ? complexes.find((c) => c.id === selectedId)?.socialName || complex?.socialName || "Empresa selecionada"
      : ""

    if (error) {
      return <div className="text-red-500">Erro para carregar condomínios: {error.toString()}</div>
    }

    // Oculta o seletor se só há 1 condomínio (já auto-selecionado)
    if (autoSelectSingle && !loading && complexes.length === 1) {
      return null
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
            <Building2 className="w-4 h-4" />
            {selectedId ? selectedComplexName : <span className="text-start w-full">Condomínio...</span>}
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
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar condomínio..."
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
                <CommandEmpty>Nenhum condomínio encontrada.</CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {complexes.map((complex) => (
                      <CommandItem key={complex.id} value={complex.id} onSelect={handleSelect} className="cursor-pointer">
                        <Check
                          className={cn("mr-2 h-4 w-4", selectedId === complex.id ? "opacity-100" : "opacity-0")}
                        />
                        {complex.socialName}
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

SelectComplex.displayName = "SelectComplex"

export default SelectComplex

