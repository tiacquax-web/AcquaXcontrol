"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Role, Permission, PermissionAction, PermissionableEntity } from "@prisma/client";
import { usePermissions, usePermissionMutations } from "@/hooks/usePermissions";
import { ArrowLeft, Loader2, Trash, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { actionTitleMap, entityTitleMap } from "@/types/types";
import { 
    Pagination, 
    PaginationContent, 
    PaginationItem, 
    PaginationLink, 
    PaginationNext, 
    PaginationPrevious, 
    PaginationEllipsis 
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

interface RoleFormProps {
    onClose: () => void;
    onSave: (role: Partial<Role>) => void;
    role: Role | undefined;
}

export default function RoleForm({ onClose, onSave, role }: RoleFormProps) {
    const [formData, setFormData] = useState<Partial<Role>>({
        name: "",
        description: "",
    });
    const roleExists = !!role?.id;

    useEffect(() => {
        if (role) {
            setFormData(role);
        } else {
            setFormData({
                name: "",
                description: "",
            });
        }
    }, [role]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row justify-start">
                <Button variant="ghost" onClick={onClose} className="w-fit rounded-full mr-2">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="mt-0 text-lg font-semibold w-fit">Papel</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="basic">
                        <TabsList className={`grid w-full grid-cols-${roleExists ? 2 : 1}`}>
                            <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
                            {roleExists && <TabsTrigger value="permissions">Permissões</TabsTrigger>}
                        </TabsList>

                        <TabsContent value="basic" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Nome <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name || ""}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">Descrição</Label>
                                    <Input
                                        id="description"
                                        name="description"
                                        value={formData.description || ""}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {roleExists && (
                            <TabsContent value="permissions" className="space-y-4 mt-4">
                                <ManageRolePermissions role={role} />
                            </TabsContent>
                        )}
                    </Tabs>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit">{roleExists ? "Atualizar" : "Criar"} Papel</Button>
                    </DialogFooter>
                </form>
            </CardContent>
        </Card>
    );
}

function ManageRolePermissions({
    role,
}: {
    role: Role;
}) {
    const [filters, setFilters] = useState({
        take: 10,
        skip: 0,
        action: undefined as PermissionAction | undefined,
        entity: undefined as PermissionableEntity | undefined,
    });
    const [currentPage, setCurrentPage] = useState(1);
    const { permissions, totalCount, error, loading, refetch } = usePermissions({ 
        roleId: role.id,
        action: filters.action,
        entity: filters.entity,
        take: filters.take,
        skip: filters.skip,
        orderBy: "createdAt"
    });
    const { createPermission, deletePermission, loading: creating, error: createError } = usePermissionMutations();
    const [addingPermission, setAddingPermission] = useState(false);
    const { toast } = useToast();

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        setFilters((prev) => ({
            ...prev,
            skip: (page - 1) * prev.take,
        }));
    };

    const handleRowsPerPageChange = (value: string) => {
        const newTake = Number.parseInt(value);
        setFilters((prev) => ({
            ...prev,
            take: newTake,
            skip: 0,
        }));
        setCurrentPage(1);
    };

    const handleActionFilterChange = (value: string) => {
        const actionValue = value === "all" ? undefined : value as PermissionAction;
        setFilters((prev) => ({
            ...prev,
            action: actionValue,
            skip: 0,
        }));
        setCurrentPage(1);
    };

    const handleEntityFilterChange = (value: string) => {
        const entityValue = value === "all" ? undefined : value as PermissionableEntity;
        setFilters((prev) => ({
            ...prev,
            entity: entityValue,
            skip: 0,
        }));
        setCurrentPage(1);
    };

    const handleDeletePermissionClick = async (permissionId: string) => {
        const deletedPermission = await deletePermission(permissionId);
        if (!deletedPermission) {
            toast({ title: "Erro", description: createError && createError != "Internal Server Error" ? createError : "Talvez essa permissão já foi excluída, tente atualizar a página", variant: "destructive" });
            return;
        }
        toast({ title: "Sucesso ✅", description: "Permissão removida com sucesso!" });
        refetch();
    };

    const handleAddPermission = async (action: PermissionAction, entity: PermissionableEntity, description: string) => {
        try {
            const createdPermission = await createPermission({ roleId: role.id, action, entity, description });
            console.log(createdPermission)
            if (!createdPermission) {
                toast({ title: "Erro", description: createError && createError != "Internal Server Error" ? createError : "Talvez essa permissão já está registrada...", variant: "destructive" });
                return;
            }
            toast({ title: "Sucesso ✅", description: "Permissão adicionada com sucesso!" });
            setAddingPermission(false);
            refetch();
        } catch (error) {
            console.error("Error adding permission:", error);
        }
    };

    return (
        <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Permissões</h3>
                
                {addingPermission ? (
                    <PermissionCreationForm onAddPermission={handleAddPermission} onCancel={() => setAddingPermission(false)} />
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setAddingPermission(true)}
                    >
                        Adicionar Permissão
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <Label htmlFor="action-filter">Filtrar por Ação</Label>
                    <Select onValueChange={handleActionFilterChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Todas as ações" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as ações</SelectItem>
                            {["create", "read", "update", "delete"].map((action) => (
                                <SelectItem key={action} value={action}>
                                    {actionTitleMap[action as PermissionAction]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="flex-1">
                    <Label htmlFor="entity-filter">Filtrar por Entidade</Label>
                    <Select onValueChange={handleEntityFilterChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Todas as entidades" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as entidades</SelectItem>
                            {Object.entries(entityTitleMap).map(([key, value]) => (
                                <SelectItem key={key} value={key}>
                                    {value}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : error ? (
                <div className="text-center py-8 text-red-500">
                    Erro ao carregar permissões: {error}
                </div>
            ) : (
                <>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Entidade</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {permissions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                            Nenhuma permissão encontrada
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    permissions.map((permission) => (
                                        <TableRow key={permission.id}>
                                            <TableCell>
                                                {actionTitleMap[permission.action]}
                                            </TableCell>
                                            <TableCell>
                                                {entityTitleMap[permission.entity]}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    type="button"
                                                    onClick={() => handleDeletePermissionClick(permission.id)}
                                                >
                                                    <Trash className="h-4 w-4" color="red" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {permissions.length > 0 && (
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
                    )}
                </>
            )}
        </div>
    );
}

function PermissionCreationForm({
    onAddPermission,
    onCancel,
}: {
    onAddPermission: (action: PermissionAction, entity: PermissionableEntity, description: string) => void;
    onCancel: () => void;
}) {
    const [action, setAction] = useState<PermissionAction | undefined>(undefined);
    const [entity, setEntity] = useState<PermissionableEntity | undefined>(undefined);
    const [description, setDescription] = useState<string>("");

    return (
        <Card>
            <CardContent className="flex pt-5 space-x-2">
                <Select onValueChange={(value) => setAction(value as PermissionAction)}>
                    <SelectTrigger className="w-full max-w-[180px]">
                        <SelectValue placeholder="Selecione uma ação" />
                    </SelectTrigger>
                    <SelectContent>
                        { ["create", "read", "update", "delete", "do"].map((action) => (
                            <SelectItem key={action} value={action as PermissionAction}>
                                {actionTitleMap[action as PermissionAction]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="relative w-full">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full max-w-56 justify-between">
                                {entity ? entityTitleMap[entity] : "Selecione uma entidade"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                            <Command className="w-full">
                                <CommandInput placeholder="Selecione uma entidade" />
                                <CommandList>
                                    {Object.keys(entityTitleMap).map((entity) => (
                                        <CommandItem
                                            key={entity}
                                            onSelect={() => setEntity(entity as PermissionableEntity)}
                                        >
                                            {entityTitleMap[entity as PermissionableEntity]}
                                        </CommandItem>
                                    ))}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </CardContent>
            <CardFooter className="flex justify-start">
                <Button
                    type="button"
                    onClick={() => onAddPermission(action as PermissionAction, entity as PermissionableEntity, description)}
                    disabled={!action || !entity}
                >
                    Adicionar Permissão
                </Button>
                <Button
                    variant="outline"
                    type="button"
                    onClick={onCancel}
                    className="ml-2"
                >
                    Cancelar
                </Button>
            </CardFooter>
        </Card>
    );
}
