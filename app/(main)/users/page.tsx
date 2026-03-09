"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mail, Phone, Plus, Search, User as UserIcon, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useUsers, useUserMutations } from "@/hooks/useUsers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import UserModal from "./user-modal"
import type { User } from "@prisma/client"
import { useRoleAssignmentMutations } from "@/hooks/useRoleAssignments"
import { Checkbox } from "@/components/ui/checkbox"

export default function UsersPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage] = useState(20)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
    
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
        excludeRole: "Morador",
        take,
        skip
    })
    
    const { createUser, updateUser, deleteUser, exportUsers, error: mutationError } = useUserMutations()
    const { deleteRoleAssignment, error: errorDeleteRoleAssignment, loading: loadingDeleteRoleAssignment } = useRoleAssignmentMutations()
    const [currentUser, setCurrentUser] = useState<Partial<User> | undefined>(undefined)
    const [exportLoading, setExportLoading] = useState(false)
    const { toast } = useToast()

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
        setCurrentPage(1) // Reset page when searching
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
                // Refetch the data to update the list
                refetch()
                handleCloseForm()
            } else {
                const createdUser = await createUser(userData as User)
                console.log("createdUser", createdUser)
                if (!createdUser)
                    return
                
                toast({
                    title: `${createdUser.name ?? 'Novo usuário'} agora está no sistema ☺️`,
                    description: "O usuário foi criado com sucesso.",
                })
                // Refetch the data to update the list
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
                // Refetch the data to update the list
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
            const allUserIds = new Set(users.map(user => user.id))
            setSelectedUsers(allUserIds)
        } else {
            setSelectedUsers(new Set())
        }
    }

    const handleExportUsers = async () => {
        setExportLoading(true)
        try {
            await exportUsers({
                search: searchQuery,
                userIds: selectedUsers.size > 0 ? Array.from(selectedUsers) : []
            })
            
            toast({
                title: "Exportação realizada com sucesso!",
                description: "Planilha baixada com sucesso.",
            })
            
            // Clear selection after export
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
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleExportUsers} disabled={exportLoading}>
                                {exportLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                Exportar Usuários
                            </Button>
                            <Button onClick={handleAddUser}>
                                <Plus className="mr-2 h-4 w-4" /> Adicionar Usuário
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col space-y-4">
                            <div className="relative flex-1 mb-6">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nome, email, etc."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    className="pl-8"
                                />
                            </div>

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
                                                            checked={users.length > 0 && selectedUsers.size === users.length}
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
                                                {users.length === 0 ? (
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
        </div>
    )
}
