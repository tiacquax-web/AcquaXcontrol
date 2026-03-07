"use client"

import type React from "react"

import { useEffect, useState, forwardRef } from "react"
import { Building, Check, ChevronsUpDown, Loader2, LucideDroplets, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCompanies } from "@/hooks/useCompanies"
import type { Company, PermissionableEntity } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectCompanyProps {
  setSelectedCompany: (company: Company | undefined) => void
  required?: boolean
  company?: Partial<Company> | undefined
  name?: string
  disabled?: boolean
  getAvailableForEntity?: PermissionableEntity
  modal?: boolean
  /** Quando true, oculta o seletor se o usuário só tem acesso a 1 empresa (auto-seleciona) */
  autoSelectSingle?: boolean
}

const SelectCompany = forwardRef<HTMLButtonElement, SelectCompanyProps>(
  ({ setSelectedCompany, company, required, name, disabled, getAvailableForEntity, modal = false, autoSelectSingle = true }, ref) => {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const { companies, loading, error } = useCompanies({ nameQuery: search, getAvailableForEntity })
    const [selectedId, setSelectedId] = useState<string | undefined>(company?.id)
    const [autoSelected, setAutoSelected] = useState(false)

    useEffect(() => {
      if (company) {
        setSelectedId(company.id)
      } else {
        setSelectedId(undefined)
      }
    }, [company])

    // Auto-seleciona quando só há 1 empresa disponível
    useEffect(() => {
      if (autoSelectSingle && !loading && companies.length === 1 && !selectedId && !autoSelected) {
        setSelectedId(companies[0].id)
        setSelectedCompany(companies[0])
        setAutoSelected(true)
      }
    }, [companies, loading, autoSelectSingle, selectedId, autoSelected, setSelectedCompany])

    const handleSelect = (value: string) => {
      if (value === selectedId) {
        setSelectedId(undefined)
        setSelectedCompany(undefined)
      } else {
        const selected = companies.find((c) => c.id === value)
        if (selected) {
          setSelectedId(value)
          setSelectedCompany(selected)
        }
      }
      setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedId(undefined)
      setSelectedCompany(undefined)
    }

    const selectedCompanyName = selectedId
      ? companies.find((c) => c.id === selectedId)?.name || company?.name || "Empresa selecionada"
      : ""

    if (error) {
      return <div className="text-red-500">Erro para carregar companhias: {error.toString()}</div>
    }

    // Oculta o seletor se só há 1 empresa (já auto-selecionada)
    if (autoSelectSingle && !loading && companies.length === 1) {
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
            <LucideDroplets className="w-4 h-4" />
            {selectedId ? selectedCompanyName : <span className="text-start w-full">Empresa...</span>}
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
              placeholder="Buscar empresa..."
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
                <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {companies.map((company) => (
                      <CommandItem key={company.id} value={company.id} onSelect={handleSelect} className="cursor-pointer">
                        <Check
                          className={cn("mr-2 h-4 w-4", selectedId === company.id ? "opacity-100" : "opacity-0")}
                        />
                        {company.name}
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

SelectCompany.displayName = "SelectCompany"

export default SelectCompany
