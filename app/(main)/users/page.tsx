"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mail, Phone, Plus, Search, User as UserIcon, Download, ChevronLeft, ChevronRight, Filter, X, RotateCcw } from "lucide-react"
import { useUsers, useUserMutations } from "@/hooks/useUsers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import UserModal from "./user-modal"
import type { User } from "@prisma/client"
import { useRoleAssignmentMutations } from "@/hooks/useRoleAssignments"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ComplexesCombobox from "@/components/ComboboxComplex"
import BlocksCombobox from "@/components/ComboboxBlock"
import SelectApartment from "@/components/ComboboxApartment"
import { useRoles } from "@/hooks/useRoles"
import { useUserContext } from "@/hooks/useUserContext"
import { exportUsers } from "@/services/usersService"
import axios from "axios"
import type { Complex, Block, Apartment } from "@prisma/client"
import * as XLSX from "xlsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BulkImportTab from "./bulk-import-tab"

export default function UsersPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage] = useState(20)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

    // Filtros de busca por complexo/bloco/apartamento
    const [filterComplexId, setFilterComplexId] = useState("")
    const [filterBlockId, setFilterBlockId] = useState("")
    const [filterApartmentId, setFilterApartmentId] = useState("")
    const [filterRoleId, setFilterRoleId] = useState("")
    const [filterComplex, setFilterComplex] = useState<Complex | undefined>(undefined)
    const [filterBlock, setFilterBlock] = useState<Block | undefined>(undefined)
    const [filterApartment, setFilterApartment] = useState<Apartment | undefined>(undefined)
    const [showFilters, setShowFilters] = useState(true)

    const skip = (currentPage - 1) * itemsPerPage
    const take = itemsPerPage

    const {
        users,
        totalCount,
        error,
        loading,
        hasNextPage,
        hasPreviousPage,
        refetch
    } = useUsers({
        searchQuery,
        take,
        skip,
        complexId: filterComplexId || undefined,
        blockId: filterBlockId || undefined,
        apartmentId: filterApartmentId || undefined,
        roleId: filterRoleId || undefined,
    })

    const { createUser, updateUser, deleteUser, error: mutationError } = useUserMutations()
    const { deleteRoleAssignment, error: errorDeleteRoleAssignment, loading: loadingDeleteRoleAssignment } = useRoleAssignmentMutations()
    const { roles } = useRoles({})
    const [currentUser, setCurrentUser] = useState<Partial<User> | undefined>(undefined)
    const { context: userContext } = useUserContext()

    // Só admins/programadores podem ver importação em massa
    const canBulkImport = userContext?.isSystem ?? false
    const [exportLoading, setExportLoading] = useState(false)
    const [resettingAll, setResettingAll] = useState(false)
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportComplexId, setExportComplexId] = useState("")
    const [exportComplex, setExportComplex] = useState<Complex | undefined>(undefined)
    const [exportRoleId, setExportRoleId] = useState("")
    const { toast } = useToast()

    const hasActiveFilters = !!(filterComplexId || filterBlockId || filterApartmentId || filterRoleId || searchQuery)

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
        setCurrentPage(1)
    }

    const handleAddUser = () => {
        setCurrentUser({})
    }

    const handleEditUser = (user: User) => {
        setCurrentUser(user)
    }

    const handleSaveUser = async (userData: Partial<User>) => {
        try {
            if (currentUser?.id) {
                const updatedUser = await updateUser(currentUser.id, { ...currentUser as User, ...userData })
                if (!updatedUser)
                    return

                toast({
                    title: `${updatedUser.name.split(' ')[0] ?? 'Usuário'} atualizado com sucesso 😉`,
                    description: "O usuário foi atualizado com sucesso.",
                })
                refetch()
                handleCloseForm()
            } else {
                const createdUser = await createUser(userData as User)
                if (!createdUser)
                    return

                toast({
                    title: `${createdUser.name ?? 'Novo usuário'} agora está no sistema ☺️`,
                    description: "O usuário foi criado com sucesso.",
                })
                refetch()
                handleCloseForm()
            }
        } catch (error) {
            console.error("Erro ao salvar usuário:", error)
        }
    }

    const handleDeleteUser = async (id: string) => {
        if (window.confirm("Tem certeza de que deseja excluir este usuário?")) {
            try {
                await deleteUser(id)
                toast({
                    title: "Usuário excluído com sucesso",
                    description: "O usuário foi excluído com sucesso.",
                })
                refetch()
            } catch (error) {
                console.error("Erro ao excluir usuário:", error)
            }
        }
    }

    const handleDeleteRoleAssignment = async (roleAssignmentId: string) => {
        if (window.confirm("Tem certeza de que deseja excluir esta atribuição de função?")) {
            try {
                await deleteRoleAssignment(roleAssignmentId)
            } catch (error) {
                console.error("Erro ao excluir atribuição de função:", error)
            }
        }
    }

    const handleCloseForm = () => {
        setCurrentUser(undefined)
    }

    const handleNextPage = () => {
        if (hasNextPage) {
            setCurrentPage(prev => prev + 1)
        }
    }

    const handlePreviousPage = () => {
        if (hasPreviousPage) {
            setCurrentPage(prev => prev - 1)
        }
    }

    const handleSelectUser = (userId: string, checked: boolean) => {
        const newSelected = new Set(selectedUsers)
        if (checked) {
            newSelected.add(userId)
        } else {
            newSelected.delete(userId)
        }
        setSelectedUsers(newSelected)
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedUsers(new Set(users.map(user => user.id)))
        } else {
            setSelectedUsers(new Set())
        }
    }

    const handleOpenExportModal = () => {
        setExportComplexId(filterComplexId || "")
        setExportComplex(filterComplex)
        setExportRoleId(filterRoleId || "")
        setShowExportModal(true)
    }

    const handleExportUsers = async () => {
        setExportLoading(true)
        setShowExportModal(false)
        try {
            await exportUsers({
                search: searchQuery,
                userIds: selectedUsers.size > 0 ? Array.from(selectedUsers) : [],
                complexId: exportComplexId || undefined,
                roleId: exportRoleId || undefined,
            })

            toast({
                title: "Exportação realizada com sucesso!",
                description: "Planilha baixada com sucesso.",
            })

            setSelectedUsers(new Set())

        } catch (error: any) {
            toast({
                title: "Erro na exportação",
                description: error.response?.data?.error || error.message || "Erro desconhecido",
                variant: "destructive"
            })
        } finally {
            setExportLoading(false)
        }
    }

    /**
     * Lógica de bulk reset — prioridade:
     * 1. Se há seleção manual (selectedUsers) → envia os IDs explicitamente ao backend
     * 2. Se há filtro ativo → envia os filtros ao backend, que resolve TODOS os IDs
     *    correspondentes sem paginação (universo filtrado completo)
     * 3. Sem seleção e sem filtro → envia sem filtros, backend usa escopo do usuário logado
     *
     * ⚠️  NUNCA usa apenas os registros carregados na tabela (paginação).
     *     O endpoint /api/user/users/bulk-reset resolve os IDs server-side.
     */
    const handleBulkReset = async () => {
        if (users.length === 0 && selectedUsers.size === 0) return

        let scopeLabel: string
        let payload: {
            userIds?: string[]
            complexId?: string
            blockId?: string
            apartmentId?: string
            roleId?: string
            search?: string
        }

        if (selectedUsers.size > 0) {
            // Prioridade 1: seleção manual — envia IDs explicitamente
            scopeLabel = `${selectedUsers.size} usuário(s) selecionado(s)`
            payload = { userIds: Array.from(selectedUsers) }
        } else if (hasActiveFilters) {
            // Prioridade 2: filtro ativo — backend resolve TODOS (sem paginação)
            const filterDesc = [
                filterComplex?.socialName,
                filterBlock?.name && `Bl. ${filterBlock.name}`,
                filterApartment?.name && `Ap. ${filterApartment.name}`,
                searchQuery && `busca "${searchQuery}"`,
            ].filter(Boolean).join(', ')
            scopeLabel = `todos os usuários filtrados${filterDesc ? ` (${filterDesc})` : ''} — ${totalCount} no total`
            payload = {
                complexId: filterComplexId || undefined,
                blockId: filterBlockId || undefined,
                apartmentId: filterApartmentId || undefined,
                roleId: filterRoleId || undefined,
                search: searchQuery || undefined,
            }
        } else {
            // Prioridade 3: escopo completo do usuário logado
            scopeLabel = `${totalCount} usuário(s) do seu escopo`
            payload = {}
        }

        if (!window.confirm(`Redefinir credenciais de ${scopeLabel}? Eles deverão atualizar a senha no próximo login.`)) return

        setResettingAll(true)

        try {
            const res = await axios.post('/api/user/users/bulk-reset', payload)
            const data = res.data as {
                successCount: number
                errorCount: number
                total: number
                credentials?: { name: string; email: string; password: string }[]
            }

            // ── Gerar e baixar planilha de credenciais ─────────────────────────────
            if (data.credentials && data.credentials.length > 0) {
                const scopeSlug = [
                    filterComplex?.socialName,
                    filterBlock?.name,
                    filterApartment?.name,
                ].filter(Boolean).join('-').replace(/\s+/g, '_').toLowerCase() || 'escopo'

                const sheetRows = data.credentials.map(c => ({
                    'Nome':   c.name,
                    'Login (e-mail)': c.email,
                    'Senha temporária': c.password,
                }))

                const wb = XLSX.utils.book_new()
                const ws = XLSX.utils.json_to_sheet(sheetRows)

                // Larguras das colunas
                ws['!cols'] = [{ wch: 36 }, { wch: 36 }, { wch: 20 }]

                XLSX.utils.book_append_sheet(wb, ws, 'Credenciais')

                const fileName = `credenciais-resetadas-${scopeSlug}-${new Date().toISOString().split('T')[0]}.xlsx`
                XLSX.writeFile(wb, fileName)
            }

            if (data.errorCount === 0) {
                toast({
                    title: `Credenciais redefinidas com sucesso`,
                    description: `${data.successCount} usuário(s) redefinido(s).${
                        data.credentials && data.credentials.length > 0
                            ? ' Planilha de credenciais baixada automaticamente.'
                            : ''
                    }`,
                })
            } else if (data.successCount > 0) {
                toast({
                    title: `Redefinição parcial`,
                    description: `${data.successCount} redefinido(s) com sucesso, ${data.errorCount} com erro.${
                        data.credentials && data.credentials.length > 0
                            ? ' Planilha dos redefinidos baixada automaticamente.'
                            : ''
                    }`,
                    variant: "destructive",
                })
            } else {
                toast({
                    title: `Erro ao redefinir credenciais`,
                    description: `Não foi possível redefinir nenhum usuário. Tente novamente.`,
                    variant: "destructive",
                })
            }
        } catch (err: any) {
            toast({
                title: `Erro ao redefinir credenciais`,
                description: err.response?.data?.error || err.message || 'Erro desconhecido',
                variant: "destructive",
            })
        } finally {
            setResettingAll(false)
            setSelectedUsers(new Set())
        }
    }

    /**
     * Etiqueta dinâmica do botão "Redefinir":
     * - seleção ativa → mostra contagem de selecionados
     * - filtro ativo → mostra totalCount (universo completo filtrado, não só a página)
     * - sem filtro/seleção → mostra totalCount do escopo
     */
    const resetButtonLabel = (() => {
        if (selectedUsers.size > 0) return `Redefinir seleção (${selectedUsers.size})`
        if (hasActiveFilters) return `Redefinir filtrados (${totalCount})`
        return `Redefinir todos (${totalCount})`
    })()

    const clearFilters = () => {
        setFilterComplexId("")
        setFilterComplex(undefined)
        setFilterBlockId("")
        setFilterBlock(undefined)
        setFilterApartmentId("")
        setFilterApartment(undefined)
        setFilterRoleId("")
        setSearchQuery("")
        setCurrentPage(1)
    }

    const totalPages = Math.ceil(totalCount / itemsPerPage)

    useEffect(() => {
        if (mutationError) {
            toast({
                title: "Erro",
                description: mutationError,
                variant: "destructive",
            })
        }
        if (error) {
            toast({
                title: "Erro",
                description: error,
                variant: "destructive",
            })
        }
    }, [error, mutationError, toast])

    useEffect(() => {
        if (errorDeleteRoleAssignment) {
            toast({
                title: "Erro ao excluir atribuição de função",
                description: errorDeleteRoleAssignment,
                variant: "destructive",
            })
        }
    }, [errorDeleteRoleAssignment, toast])

    return (
        <div className="space-y-6 w-full p-6">
          <Tabs defaultValue="list" className="w-full">
            <TabsList>
              <TabsTrigger value="list">Lista de Usuários</TabsTrigger>
              {canBulkImport && <TabsTrigger value="import">Importação em Massa</TabsTrigger>}
            </TabsList>
            <TabsContent value="list" className="space-y-0">
            {!currentUser && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="text-2xl font-bold">Usuários</CardTitle>
                            <CardDescription>Gerencie seus usuários e seus detalhes</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleBulkReset}
                                disabled={resettingAll || loading || (users.length === 0 && selectedUsers.size === 0)}
                                className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
                            >
                                {resettingAll ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                )}
                                {resetButtonLabel}
                            </Button>
                            <Button variant="outline" onClick={handleOpenExportModal} disabled={exportLoading}>
                                {exportLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                Exportar
                            </Button>
                            <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                                <Filter className="mr-2 h-4 w-4" />
                                Filtros
                                {hasActiveFilters && <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs" variant="destructive">!</Badge>}
                            </Button>
                            <Button onClick={handleAddUser}>
                                <Plus className="mr-2 h-4 w-4" /> Adicionar Usuário
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col space-y-4">
                            <div className="relative flex-1 mb-2">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nome, email, etc."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    className="pl-8"
                                />
                            </div>

                            {/* Filtros avançados */}
                            {showFilters && (
                                <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-semibold">Filtrar usuários por:</Label>
                                        {hasActiveFilters && (
                                            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                                                <X className="h-3 w-3 mr-1" /> Limpar filtros
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Condomínio</Label>
                                            <ComplexesCombobox
                                                complex={filterComplex as any}
                                                setSelectedComplex={(c) => {
                                                    setFilterComplex(c as Complex)
                                                    setFilterComplexId(c?.id || "")
                                                    setFilterBlock(undefined)
                                                    setFilterBlockId("")
                                                    setCurrentPage(1)
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Bloco</Label>
                                            <BlocksCombobox
                                                block={filterBlock as any}
                                                complexId={filterComplexId || undefined}
                                                setSelectedBlock={(b) => {
                                                    setFilterBlock(b as Block)
                                                    setFilterBlockId(b?.id || "")
                                                    setFilterApartment(undefined)
                                                    setFilterApartmentId("")
                                                    setCurrentPage(1)
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Apartamento</Label>
                                            <SelectApartment
                                                blockId={filterBlockId || undefined}
                                                apartment={filterApartment}
                                                setSelectedApartment={(apt) => {
                                                    setFilterApartment(apt as Apartment | undefined)
                                                    setFilterApartmentId(apt?.id || "")
                                                    setCurrentPage(1)
                                                }}
                                                disabled={!filterBlockId}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Papel</Label>
                                            <Select value={filterRoleId || "all"} onValueChange={(v) => { setFilterRoleId(v === "all" ? "" : v); setCurrentPage(1) }}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Todos os papéis" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos os papéis</SelectItem>
                                                    {roles.map(r => (
                                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    {hasActiveFilters && (
                                        <p className="text-xs text-muted-foreground">
                                            Filtros ativos: {[filterComplex?.socialName, filterBlock?.name && `Bl. ${filterBlock.name}`, filterApartment?.name && `Ap. ${filterApartment.name}`, roles.find(r => r.id === filterRoleId)?.name, searchQuery && `"${searchQuery}"`].filter(Boolean).join(' › ')}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Banner de erro — não bloqueia a tabela */}
                            {error && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    Erro ao carregar usuários: {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12">
                                                    <Checkbox
                                                        checked={users.length > 0 && selectedUsers.size === users.length}
                                                        onCheckedChange={handleSelectAll}
                                                        disabled={users.length === 0}
                                                    />
                                                </TableHead>
                                                <TableHead>Nome</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Telefone</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {loading ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-8">
                                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : users.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                        Nenhum usuário encontrado
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                users.map((user) => (
                                                    <TableRow key={user.id}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedUsers.has(user.id)}
                                                                onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-2">
                                                                <UserIcon className="h-4 w-4 text-muted-foreground" />
                                                                <div>{user.name}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                                <span>{user.email}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {user.telephone || user.cell ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                                                    <span>{user.telephone || user.cell}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground">Sem contato</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">
                                                                Ativo
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button variant="outline" size="sm" onClick={() => handleEditUser(user)}>
                                                                    Editar
                                                                </Button>
                                                                <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)}>
                                                                    Excluir
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Paginação */}
                                {!loading && totalCount > itemsPerPage && (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handlePreviousPage}
                                                disabled={!hasPreviousPage}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                                Anterior
                                            </Button>
                                            <span className="text-sm text-muted-foreground">
                                                Página {currentPage} de {totalPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleNextPage}
                                                disabled={!hasNextPage}
                                            >
                                                Próxima
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Mostrando {Math.min(skip + 1, totalCount)} - {Math.min(skip + itemsPerPage, totalCount)} de {totalCount} usuários
                                        </div>
                                    </div>
                                )}

                                {/* Contador de seleção */}
                                {selectedUsers.size > 0 && (
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                        <span>{selectedUsers.size} usuário(s) selecionado(s)</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => setSelectedUsers(new Set())}
                                        >
                                            <X className="h-3 w-3 mr-1" /> Limpar seleção
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                    </CardContent>
                </Card>
            )}

            <UserModal
                isOpen={!!currentUser}
                onClose={handleCloseForm}
                onSave={handleSaveUser}
                handleDeleteRoleAssignment={handleDeleteRoleAssignment}
                user={currentUser as User}
            />

            {/* Modal de Exportação com filtros */}
            <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Exportar Usuários</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {selectedUsers.size > 0 && (
                            <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                                {selectedUsers.size} usuário(s) selecionado(s) — somente eles serão exportados.
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label>Filtrar por Condomínio <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                            <ComplexesCombobox
                                complex={exportComplex as any}
                                setSelectedComplex={(c) => {
                                    setExportComplex(c as Complex)
                                    setExportComplexId(c?.id || "")
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Filtrar por Papel <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                            <Select value={exportRoleId || "all"} onValueChange={(v) => setExportRoleId(v === "all" ? "" : v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos os papéis" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os papéis</SelectItem>
                                    {roles.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {!exportComplexId && !exportRoleId && selectedUsers.size === 0 && (
                            <p className="text-xs text-amber-600">
                                Sem filtros selecionados, todos os usuários serão exportados.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowExportModal(false)}>Cancelar</Button>
                        <Button onClick={handleExportUsers} disabled={exportLoading}>
                            <Download className="mr-2 h-4 w-4" />
                            Exportar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TabsContent>
            <TabsContent value="import">
              <BulkImportTab />
            </TabsContent>
          </Tabs>
        </div>
    )
}
