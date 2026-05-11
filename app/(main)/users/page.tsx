"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mail, Phone, Plus, Search, User as UserIcon, Download, ChevronLeft, ChevronRight, Filter, X } from "lucide-react"
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
import ApartmentsCombobox from "@/components/ComboboxApartment"
import { useRoles } from "@/hooks/useRoles"
import { exportUsers } from "@/services/usersService"
import type { Apartment, Complex, Block } from "@prisma/client"

export default function UsersPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage] = useState(20)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
    
    // Filtros de busca por complexo/bloco
    const [filterComplexId, setFilterComplexId] = useState("")
    const [filterBlockId, setFilterBlockId] = useState("")
    const [filterApartmentId, setFilterApartmentId] = useState("")
    const [filterRoleId, setFilterRoleId] = useState("")
    const [filterComplex, setFilterComplex] = useState<Complex | undefined>(undefined)
    const [filterBlock, setFilterBlock] = useState<Block | undefined>(undefined)
    const [filterApartment, setFilterApartment] = useState<Apartment | undefined>(undefined)
    const [showFilters, setShowFilters] = useState(false)
    
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
    
    const { createUser, updateUser, deleteUser, bulkUsersAction, loading: mutationLoading, error: mutationError } = useUserMutations()
    const { deleteRoleAssignment, error: errorDeleteRoleAssignment, loading: loadingDeleteRoleAssignment } = useRoleAssignmentMutations()
    const { roles } = useRoles({})
    const safeUsers = Array.isArray(users) ? users : []
    const safeRoles = Array.isArray(roles) ? roles : []
    const [currentUser, setCurrentUser] = useState<Partial<User> | undefined>(undefined)
    const [exportLoading, setExportLoading] = useState(false)
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportComplexId, setExportComplexId] = useState("")
    const [exportComplex, setExportComplex] = useState<Complex | undefined>(undefined)
    const [exportBlockId, setExportBlockId] = useState("")
    const [exportBlock, setExportBlock] = useState<Block | undefined>(undefined)
    const [exportApartmentId, setExportApartmentId] = useState("")
    const [exportApartment, setExportApartment] = useState<Apartment | undefined>(undefined)
    const [exportRoleId, setExportRoleId] = useState("")
    const { toast } = useToast()

    const hasActiveFilters = !!(filterComplexId || filterBlockId || filterApartmentId || filterRoleId)

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

    const getBulkActionPayload = () => ({
        search: searchQuery,
        userIds: selectedUsers.size > 0 ? Array.from(selectedUsers) : [],
        complexId: filterComplexId || undefined,
        blockId: filterBlockId || undefined,
        apartmentId: filterApartmentId || undefined,
        roleId: filterRoleId || undefined,
    })

    const handleResetAllUsers = async () => {
        const targetDescription = selectedUsers.size > 0
            ? `${selectedUsers.size} usuário(s) selecionado(s)`
            : "todos os usuários filtrados"
        const confirmReset = window.confirm(`Deseja redefinir ${targetDescription}? Novas senhas aleatórias serão geradas e aparecerão no próximo export.`)
        if (!confirmReset) return
        try {
            const result = await bulkUsersAction({ action: 'resetAllUsers', ...getBulkActionPayload() })
            if (!result) return
            toast({
                title: "Usuários redefinidos",
                description: `${result.usersAffected ?? 0} usuário(s) com nova senha temporária.`,
            })
            setSelectedUsers(new Set())
            refetch()
        } catch (error) {
            console.error("Erro ao redefinir usuários:", error)
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
            const allUserIds = new Set(safeUsers.map(user => user.id))
            setSelectedUsers(allUserIds)
        } else {
            setSelectedUsers(new Set())
        }
    }

    const handleOpenExportModal = () => {
        setExportComplexId(filterComplexId || "")
        setExportComplex(filterComplex)
        setExportBlockId(filterBlockId || "")
        setExportBlock(filterBlock)
        setExportApartmentId(filterApartmentId || "")
        setExportApartment(filterApartment)
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
                blockId: exportBlockId || undefined,
                apartmentId: exportApartmentId || undefined,
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

    const clearFilters = () => {
        setFilterComplexId("")
        setFilterComplex(undefined)
        setFilterBlockId("")
        setFilterBlock(undefined)
        setFilterApartmentId("")
        setFilterApartment(undefined)
        setFilterRoleId("")
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
            {!currentUser && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="text-2xl font-bold">Usuários</CardTitle>
                            <CardDescription>Gerencie seus usuários e seus detalhes</CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
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
                            <Button variant="outline" onClick={handleResetAllUsers} disabled={mutationLoading || loading}>
                                Redefinir Todos
                            </Button>
                            <Button onClick={handleAddUser} disabled={mutationLoading}>
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
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Condomínio</Label>
                                            <ComplexesCombobox
                                                complex={filterComplex as any}
                                                setSelectedComplex={(c) => {
                                                    setFilterComplex(c as Complex)
                                                    setFilterComplexId(c?.id || "")
                                                    setFilterBlock(undefined)
                                                    setFilterBlockId("")
                                                    setFilterApartment(undefined)
                                                    setFilterApartmentId("")
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
                                            <ApartmentsCombobox
                                                apartment={filterApartment as any}
                                                complexId={filterComplexId || undefined}
                                                blockId={filterBlockId || undefined}
                                                setSelectedApartment={(a) => {
                                                    setFilterApartment(a as Apartment)
                                                    setFilterApartmentId(a?.id || "")
                                                    setCurrentPage(1)
                                                }}
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
                                                    {safeRoles.map(r => (
                                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    {hasActiveFilters && (
                                        <p className="text-xs text-muted-foreground">
                                            Filtros ativos: {[filterComplex?.socialName, filterBlock?.name, filterApartment?.name, safeRoles.find(r => r.id === filterRoleId)?.name].filter(Boolean).join(' › ')}
                                        </p>
                                    )}
                                </div>
                            )}

                            {loading ? (
                                <div className="flex justify-center items-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : error ? (
                                <div className="text-center py-8 text-red-500">
                                    Erro ao carregar usuários: {error}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={safeUsers.length > 0 && selectedUsers.size === safeUsers.length}
                                                            onCheckedChange={handleSelectAll}
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
                                                {safeUsers.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                            Nenhum usuário encontrado
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    safeUsers.map((user) => (
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

                                    {/* Pagination Controls */}
                                    {totalCount > itemsPerPage && (
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

                                    {/* Selection Info */}
                                    {selectedUsers.size > 0 && (
                                        <div className="text-sm text-muted-foreground">
                                            {selectedUsers.size} usuário(s) selecionado(s)
                                        </div>
                                    )}
                                </div>
                            )}
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
                                    setExportBlock(undefined)
                                    setExportBlockId("")
                                    setExportApartment(undefined)
                                    setExportApartmentId("")
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Filtrar por Bloco <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                            <BlocksCombobox
                                block={exportBlock as any}
                                complexId={exportComplexId || undefined}
                                setSelectedBlock={(b) => {
                                    setExportBlock(b as Block)
                                    setExportBlockId(b?.id || "")
                                    setExportApartment(undefined)
                                    setExportApartmentId("")
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Filtrar por Apartamento <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                            <ApartmentsCombobox
                                apartment={exportApartment as any}
                                complexId={exportComplexId || undefined}
                                blockId={exportBlockId || undefined}
                                setSelectedApartment={(a) => {
                                    setExportApartment(a as Apartment)
                                    setExportApartmentId(a?.id || "")
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
                                    {safeRoles.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {!exportComplexId && !exportBlockId && !exportApartmentId && !exportRoleId && selectedUsers.size === 0 && (
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
        </div>
    )
}
