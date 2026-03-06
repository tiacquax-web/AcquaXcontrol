"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Plus, Search } from "lucide-react"
import { useRoles, useRoleMutations } from "@/hooks/useRoles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import RoleForm from "./role-form"
import type { Role } from "@prisma/client"
import { 
    Pagination, 
    PaginationContent, 
    PaginationEllipsis, 
    PaginationItem, 
    PaginationLink, 
    PaginationNext, 
    PaginationPrevious 
} from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"

export default function RolesPage() {
    const [filters, setFilters] = useState<{
        searchQuery: string
        take: number
        skip: number
        orderBy: string
    }>({
        searchQuery: "",
        take: 10,
        skip: 0,
        orderBy: "createdAt"
    })
    const [currentPage, setCurrentPage] = useState(1)
    const { roles, totalCount, error, loading, refetch } = useRoles({
        searchQuery: filters.searchQuery,
        take: filters.take,
        skip: filters.skip,
        orderBy: filters.orderBy
    })
    const { createRole, updateRole, deleteRole, error: mutationError } = useRoleMutations()
    const [currentRole, setCurrentRole] = useState<Partial<Role> | undefined>(undefined)
    const { toast } = useToast()

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters((prev) => ({ 
            ...prev, 
            searchQuery: e.target.value,
            skip: 0 // Reset to first page when searching
        }))
        setCurrentPage(1)
    }

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
        setFilters((prev) => ({
            ...prev,
            skip: (page - 1) * prev.take,
        }))
    }

    const handleRowsPerPageChange = (value: string) => {
        const newTake = Number.parseInt(value)
        setFilters((prev) => ({
            ...prev,
            take: newTake,
            skip: 0, // Reset to first page when changing rows per page
        }))
        setCurrentPage(1)
    }

    const handleAddRole = () => {
        setCurrentRole({})
    }

    const handleEditRole = (role: Role) => {
        setCurrentRole(role)
    }

    const handleSaveRole = async (roleData: Partial<Role>) => {
        try {
            if (currentRole?.id) {
                const updatedRole = await updateRole(currentRole.id, { ...currentRole as Role, ...roleData })
                if (!updatedRole) 
                    return
                
                toast({
                    title: `${updatedRole.name} atualizado com sucesso 😉`,
                    description: "O papel foi atualizado com sucesso.",
                })
                refetch()
                handleCloseForm()
            }
            else {
                const createdRole = await createRole(roleData as Role)
                if (!createdRole)
                    return
                
                toast({
                    title: `${createdRole.name} agora está no sistema ☺️`,
                    description: "O papel foi criado com sucesso.",
                })
                refetch()
                handleCloseForm()
            }
        } catch (error) {
            console.error("Erro ao salvar papel:", error)
        }
    }

    const handleDeleteRole = async (id: string) => {
        if (window.confirm("Tem certeza de que deseja excluir este papel?")) {
            try {
                const deletedRole = await deleteRole(id)
                if (!deletedRole) 
                    return
                toast({
                    title: "Papel excluído com sucesso",
                    description: "O papel foi excluído com sucesso.",
                })
                refetch()
            } catch (error) {
                console.error("Erro ao excluir papel:", error)
            }
        }
    }

    const handleCloseForm = () => {
        setCurrentRole(undefined)
    }

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

    return (
        <div className="space-y-6 w-full p-6">
            {!currentRole && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <CardTitle className="text-2xl font-bold">Papéis</CardTitle>
                                <CardDescription>Gerencie os papéis e suas permissões</CardDescription>
                            </div>
                            <Button onClick={handleAddRole}>
                                <Plus className="mr-2 h-4 w-4" /> Adicionar Papel
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col space-y-4">
                                <div className="relative flex-1 mb-6">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Buscar por nome, descrição, etc."
                                        value={filters.searchQuery}
                                        onChange={handleSearchChange}
                                        className="pl-8"
                                    />
                                </div>

                                {loading ? (
                                    <div className="space-y-4">
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Nome</TableHead>
                                                        <TableHead>Descrição</TableHead>
                                                        <TableHead className="text-right">Ações</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Array.from({ length: 5 }).map((_, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <Skeleton className="h-8 w-16" />
                                                                    <Skeleton className="h-8 w-16" />
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ) : error ? (
                                    <div className="text-center py-8 text-red-500">
                                        Erro ao carregar papéis: {error}
                                    </div>
                                ) : (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Nome</TableHead>
                                                    <TableHead>Descrição</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {roles.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                                            {filters.searchQuery ? "Nenhum papel encontrado para a busca" : "Nenhum papel encontrado"}
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    roles.map((role) => (
                                                        <motion.tr
                                                            key={role.id}
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.3 }}
                                                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                                        >
                                                            <TableCell className="font-medium">
                                                                {role.name}
                                                            </TableCell>
                                                            <TableCell>
                                                                {role.description || <p className="text-muted-foreground">Sem descrição</p>}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <Button variant="outline" size="sm" onClick={() => handleEditRole(role)}>
                                                                        Editar
                                                                    </Button>
                                                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteRole(role.id)}>
                                                                        Excluir
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </motion.tr>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}

                                {/* Pagination Controls */}
                                {loading ? (
                                    <div className="flex items-center justify-between mt-4">
                                        <Skeleton className="h-8 w-32" />
                                        <Skeleton className="h-8 w-64" />
                                    </div>
                                ) : (
                                    roles.length > 0 && (
                                        <div className="flex items-center justify-between mt-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">Linhas por página:</span>
                                                <Select value={filters.take.toString()} onValueChange={handleRowsPerPageChange}>
                                                    <SelectTrigger className="h-8 w-[70px]">
                                                        <SelectValue placeholder={filters.take.toString()} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="5">5</SelectItem>
                                                        <SelectItem value="10">10</SelectItem>
                                                        <SelectItem value="20">20</SelectItem>
                                                        <SelectItem value="50">50</SelectItem>
                                                        <SelectItem value="100">100</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground text-nowrap">
                                                    {filters.skip + 1}-{Math.min(filters.skip + filters.take, totalCount)} de {totalCount}
                                                </span>

                                                <Pagination>
                                                    <PaginationContent>
                                                        <PaginationItem>
                                                            <PaginationPrevious
                                                                onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                                                                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                            />
                                                        </PaginationItem>

                                                        {/* First page */}
                                                        {currentPage > 2 && (
                                                            <PaginationItem>
                                                                <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
                                                            </PaginationItem>
                                                        )}

                                                        {/* Ellipsis if needed */}
                                                        {currentPage > 3 && (
                                                            <PaginationItem>
                                                                <PaginationEllipsis />
                                                            </PaginationItem>
                                                        )}

                                                        {/* Previous page if not on first page */}
                                                        {currentPage > 1 && (
                                                            <PaginationItem>
                                                                <PaginationLink onClick={() => handlePageChange(currentPage - 1)}>
                                                                    {currentPage - 1}
                                                                </PaginationLink>
                                                            </PaginationItem>
                                                        )}

                                                        {/* Current page */}
                                                        <PaginationItem>
                                                            <PaginationLink isActive onClick={() => handlePageChange(currentPage)}>
                                                                {currentPage}
                                                            </PaginationLink>
                                                        </PaginationItem>

                                                        {/* Next page if not last page */}
                                                        {currentPage < Math.ceil(totalCount / filters.take) && (
                                                            <PaginationItem>
                                                                <PaginationLink onClick={() => handlePageChange(currentPage + 1)}>
                                                                    {currentPage + 1}
                                                                </PaginationLink>
                                                            </PaginationItem>
                                                        )}

                                                        {/* Ellipsis if needed */}
                                                        {currentPage < Math.ceil(totalCount / filters.take) - 2 && (
                                                            <PaginationItem>
                                                                <PaginationEllipsis />
                                                            </PaginationItem>
                                                        )}

                                                        {/* Last page if not already showing */}
                                                        {currentPage < Math.ceil(totalCount / filters.take) - 1 && (
                                                            <PaginationItem>
                                                                <PaginationLink onClick={() => handlePageChange(Math.ceil(totalCount / filters.take))}>
                                                                    {Math.ceil(totalCount / filters.take)}
                                                                </PaginationLink>
                                                            </PaginationItem>
                                                        )}

                                                        <PaginationItem>
                                                            <PaginationNext
                                                                onClick={() =>
                                                                    currentPage < Math.ceil(totalCount / filters.take) && handlePageChange(currentPage + 1)
                                                                }
                                                                className={
                                                                    currentPage >= Math.ceil(totalCount / filters.take)
                                                                        ? "pointer-events-none opacity-50"
                                                                        : "cursor-pointer"
                                                                }
                                                            />
                                                        </PaginationItem>
                                                    </PaginationContent>
                                                </Pagination>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {currentRole && (
                <div>
                    <RoleForm
                        onClose={handleCloseForm}
                        onSave={handleSaveRole}
                        role={currentRole as Role}
                    />
                </div>
            )}
        </div>
    )
}
