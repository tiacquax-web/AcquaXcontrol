"use client"

import { useEffect, useState, forwardRef } from "react"
import { Building, Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
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
import { useBlocks } from "@/hooks/useBlocks"
import type { Block, PermissionableEntity } from "@prisma/client"
import { cn } from "@/lib/utils"

interface SelectBlockProps {
  setSelectedBlock: (block: Block | undefined) => void
  required?: boolean
  block?: Block | undefined
  name?: string
  complexId?: string
  disabled?: boolean
  modal?: boolean
  getAvailableForEntity?: PermissionableEntity
  withComplexName?: boolean
  withApartmentsCount?: boolean
  withMetersCount?: boolean
}

const SelectBlock = forwardRef<HTMLButtonElement, SelectBlockProps>(
  ({ getAvailableForEntity, setSelectedBlock, block, required, complexId, disabled, modal = false, withComplexName = false, withApartmentsCount = false, withMetersCount = false }, ref) => {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    // Só busca blocos quando há um complexId
    const { blocks, loading, error } = useBlocks({ 
      getAvailableForEntity, 
      complexId: complexId || undefined, 
      nameQuery: search,
      enabled: !!complexId && !disabled, // Só habilita a busca quando há complexId e disabled é false
      withComplexName,
      withApartmentsCount,
      withMetersCount
    })
    const [selectedId, setSelectedId] = useState<string | undefined>(block?.id)

    useEffect(() => {
      // Update selectedId when block prop changes
      if (block) {
        setSelectedId(block.id)
      } else {
        setSelectedId(undefined)
      }
    }, [block])

    const handleSelect = (value: string) => {
      if (value === selectedId) {
        // Deselect if clicking the same item
        setSelectedId(undefined)
        setSelectedBlock(undefined)
      } else {
        const selectedBlock = blocks.find((b) => b.id === value)
        if (selectedBlock) {
          setSelectedId(value)
          setSelectedBlock(selectedBlock)
        }
      }
      setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedId(undefined)
      setSelectedBlock(undefined)
    }

    // Find the selected block name for display
    const selectedBlockName = selectedId
      ? blocks.find(b => b.id === selectedId)?.name || block?.name || "Bloco selecionado"
      : ""

    if (error) {
      return <div className="text-red-500">Erro para carregar blocos: {error.toString()}</div>
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
            disabled={disabled || !complexId}
          >
            <Building className="h-5 w-5 text-muted-foreground" />
            {selectedId ? selectedBlockName : <span className="text-start w-full">Bloco...</span>}
            <div className="flex items-center ml-2">
              {selectedId && (
                <div
                  className="cursor-pointer h-4 w-4 p-0 mr-1"
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
              placeholder="Buscar bloco..."
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
                <CommandEmpty>Nenhum bloco encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {blocks && blocks.map((block) => (
                      <CommandItem
                        key={block.id}
                        value={block.id}
                        onSelect={handleSelect}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedId === block.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {block.name}
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

SelectBlock.displayName = "SelectBlock"

export default SelectBlock
