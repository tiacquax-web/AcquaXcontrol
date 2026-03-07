"use client"

import type React from "react"
import { useEffect, useState, forwardRef } from "react"
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDealerships } from "@/hooks/useDealerships"
import { createDealership } from "@/services/dealershipService"
import type { Dealership } from "@prisma/client"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface SelectDealershipProps {
    setSelectedDealership: (dealership: Dealership | undefined) => void
    required?: boolean
    dealership?: Partial<Dealership> | undefined
    name?: string
    disabled?: boolean
    modal?: boolean
    allowCreate?: boolean   // habilita o botão "+ Nova Concessionária" (default: true)
}

const SelectDealership = forwardRef<HTMLButtonElement, SelectDealershipProps>(
    ({ setSelectedDealership, dealership, required, name, disabled, modal = false, allowCreate = true }, ref) => {
        const { toast } = useToast()
        const [open, setOpen] = useState(false)
        const [search, setSearch] = useState("")
        const { dealerships, loading, error, refetch } = useDealerships({ search })
        const [selectedId, setSelectedId] = useState<string | undefined>(dealership?.id)

        // Estado do modal de criação
        const [createOpen, setCreateOpen] = useState(false)
        const [creating, setCreating] = useState(false)
        const [newName, setNewName] = useState("")
        const [newService, setNewService] = useState("água")
        const [newEditor, setNewEditor] = useState("")

        useEffect(() => {
            if (dealership) {
                setSelectedId(dealership.id)
            } else {
                setSelectedId(undefined)
            }
        }, [dealership])

        const handleSelect = (value: string) => {
            if (value === selectedId) {
                setSelectedId(undefined)
                setSelectedDealership(undefined)
            } else {
                const selected = dealerships.find((d) => d.id === value)
                if (selected) {
                    setSelectedId(value)
                    setSelectedDealership(selected)
                }
            }
            setOpen(false)
        }

        const handleClear = (e: React.MouseEvent) => {
            e.stopPropagation()
            setSelectedId(undefined)
            setSelectedDealership(undefined)
        }

        const handleOpenCreate = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            // Pré-preenche o nome com o que foi digitado na busca
            setNewName(search)
            setNewEditor("")
            setNewService("água")
            setCreateOpen(true)
        }

        const handleCreate = async () => {
            if (!newName.trim()) {
                toast({ title: "Nome obrigatório", description: "Informe o nome da concessionária.", variant: "destructive" })
                return
            }
            setCreating(true)
            try {
                const created = await createDealership({
                    name: newName.trim(),
                    service: newService,
                    editor: newEditor.trim() || newName.trim(),
                } as any)

                toast({ title: "Concessionária criada!", description: `"${newName}" foi adicionada com sucesso.` })

                // Recarrega a lista e seleciona a nova
                await refetch()
                setSelectedId(created.id)
                setSelectedDealership(created)
                setCreateOpen(false)
                setNewName("")
                setNewEditor("")
            } catch (err: any) {
                toast({
                    title: "Erro ao criar",
                    description: err?.response?.data?.error || err?.message || "Erro inesperado.",
                    variant: "destructive"
                })
            } finally {
                setCreating(false)
            }
        }

        const selectedDealershipName = selectedId
            ? dealerships.find((d) => d.id === selectedId)?.name || dealership?.name || "Concessionária selecionada"
            : ""

        if (error) {
            return <div className="text-red-500">Erro ao carregar concessionárias: {error.toString()}</div>
        }

        return (
            <>
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
                            {selectedId
                                ? selectedDealershipName
                                : <span className="text-start w-full">Selecione uma concessionária...</span>
                            }
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
                                    <CommandList>
                                        <CommandEmpty>
                                            <span className="text-sm text-muted-foreground">Nenhuma concessionária encontrada.</span>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {dealerships.map((d) => (
                                                <CommandItem
                                                    key={d.id}
                                                    value={d.id}
                                                    onSelect={handleSelect}
                                                    className="cursor-pointer"
                                                >
                                                    <Check
                                                        className={cn("mr-2 h-4 w-4", selectedId === d.id ? "opacity-100" : "opacity-0")}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span>{d.name}</span>
                                                        <span className="text-xs text-muted-foreground capitalize">{d.service}</span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>

                                    {/* Botão de criar nova concessionária */}
                                    {allowCreate && (
                                        <div className="border-t p-1">
                                            <button
                                                type="button"
                                                onClick={handleOpenCreate}
                                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                            >
                                                <Plus className="h-4 w-4" />
                                                {search ? `Criar "${search}"` : "Nova concessionária..."}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Modal de criação rápida */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                            <DialogTitle>Nova Concessionária</DialogTitle>
                        </DialogHeader>

                        <div className="grid gap-4 py-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="new-dealership-name">Nome <span className="text-destructive">*</span></Label>
                                <Input
                                    id="new-dealership-name"
                                    placeholder="Ex: Águas do Rio"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
                                    autoFocus
                                />
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="new-dealership-service">Tipo de serviço <span className="text-destructive">*</span></Label>
                                <Select value={newService} onValueChange={setNewService}>
                                    <SelectTrigger id="new-dealership-service">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="água">💧 Água</SelectItem>
                                        <SelectItem value="gás">🔥 Gás</SelectItem>
                                        <SelectItem value="energia">⚡ Energia</SelectItem>
                                        <SelectItem value="esgoto">🚰 Esgoto</SelectItem>
                                        <SelectItem value="outro">Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="new-dealership-editor">Razão Social <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                                <Input
                                    id="new-dealership-editor"
                                    placeholder="Ex: Águas do Rio Concessionária S.A."
                                    value={newEditor}
                                    onChange={(e) => setNewEditor(e.target.value)}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                                Cancelar
                            </Button>
                            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</> : "Criar Concessionária"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        )
    },
)

SelectDealership.displayName = "SelectDealership"

export default SelectDealership
