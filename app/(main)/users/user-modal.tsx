"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { User, Company, Complex, Block, Apartment, RoleAssignment } from "@prisma/client"
import { useRoleAssignmentMutations, useRoleAssignments } from "@/hooks/useRoleAssignments"
import { Loader2, X, CheckCircle2 } from "lucide-react"
import { useRoles } from "@/hooks/useRoles"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ContextType, Role } from "@prisma/client"
import ComplexesCombobox from "@/components/ComboboxComplex"
import BlocksCombobox from "@/components/ComboboxBlock"
import SelectApartment from "@/components/ComboboxApartment"
import SelectCompany from "@/components/ComboboxCompany"
import { mapContextType } from "@/types/types"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

interface UserModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (user: Partial<User>) => void
    user: User | undefined
    handleDeleteRoleAssignment: (roleAssignmentId: string) => Promise<void>
    openTab?: string
}

export default function UserModal({ isOpen, onClose, onSave, user, handleDeleteRoleAssignment, openTab = 'basic' }: UserModalProps) {
    const [formData, setFormData] = useState<Partial<User>>({
        name: "",
        email: "",
        password: "",
        telephone: "",
        cell: "",
        documentPerson: "",
        photo: "",
    })
    const userExists = !!user?.id

    useEffect(() => {
        if (user) {
            setFormData({
                ...user,
                password: "", // Reset password field for security
            })
        } else {
            setFormData({
                name: "",
                email: "",
                password: "",
                telephone: "",
                cell: "",
                documentPerson: "",
                photo: "",
            })
        }
    }, [user, isOpen])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{userExists ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue={openTab}>
                        <TabsList className={`grid w-full ${userExists ? 'grid-cols-4' : 'grid-cols-3'}`}> 
                            <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
                            <TabsTrigger value="contact">Contato</TabsTrigger>
                            <TabsTrigger value="roles">Papéis</TabsTrigger>
                            {userExists && <TabsTrigger value="security">Segurança</TabsTrigger>}
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
                                    <Label htmlFor="email">
                                        E-mail <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={formData.email || ""}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                {!userExists && (
                                    <div className="space-y-2">
                                        <Label htmlFor="password">
                                            Senha <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="password"
                                            value={formData.password || ""}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="documentPerson">Documento</Label>
                                    <Input
                                        id="documentPerson"
                                        name="documentPerson"
                                        value={formData.documentPerson || ""}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="contact" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="telephone">Telefone</Label>
                                    <Input
                                        id="telephone"
                                        name="telephone"
                                        value={formData.telephone || ""}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cell">Celular</Label>
                                    <Input
                                        id="cell"
                                        name="cell"
                                        value={formData.cell || ""}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="photo">Foto (URL)</Label>
                                    <Input
                                        id="photo"
                                        name="photo"
                                        value={formData.photo || ""}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {userExists &&
                            <TabsContent value="roles" className="space-y-4 mt-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-2">
                                        {user?.id && <ManageUserRoles user={user} handleDeleteRoleAssignment={handleDeleteRoleAssignment} />}
                                    </div>
                                </div>
                            </TabsContent>
                        }

                        {!userExists &&
                            <TabsContent value="roles" className="space-y-4 mt-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-center">Após criar o usuário, você poderá atribuir papéis a ele.</p>
                                    </div>
                                </div>
                            </TabsContent>
                        }

                        <TabsContent value="security" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="password"><u>Nova</u> Senha</Label>
                                    <Input
                                        id="password"
                                        name="password"
                                        type="password"
                                        placeholder="Deixe em branco se não deseja alterar"
                                        value={formData.password || ""}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                    </Tabs>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit">{userExists ? "Atualizar" : "Criar"} Usuário</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function ManageUserRoles({ user, handleDeleteRoleAssignment }: { user: User, handleDeleteRoleAssignment: (roleAssignmentId: string) => Promise<void> }) {
    const { roleAssignments, error, loading, refetch } = useRoleAssignments({ userId: user.id });
    const { roles } = useRoles({});
    const [addingRole, setAddingRole] = useState(false);

    const handleDeleteRoleAssignmentClick = async (roleAssignmentId: string) => {
        setAddingRole(false);
        await handleDeleteRoleAssignment(roleAssignmentId);
        refetch();
    };

    const onAddedRole = (roleAssignment: Partial<RoleAssignment> & { name: string }) => {
        void roleAssignment;
        setAddingRole(false);
        refetch();
    }

    return (
        <div className="space-y-4 mt-4">
            <h3 className="text-lg font-semibold">Atribuições de Papéis</h3>
            {loading && !roleAssignments.length ? (
                <div className="flex flex-col gap-2 py-8">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex gap-2">
                            <Skeleton className="h-6 w-1/4" />
                            <Skeleton className="h-6 w-1/4" />
                            <Skeleton className="h-6 w-1/4" />
                            <Skeleton className="h-6 w-1/6 ml-auto" />
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="text-center py-8 text-red-500">
                    Erro ao carregar papéis: {error}
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tipo de Contexto</TableHead>
                            <TableHead>Contexto</TableHead>
                            <TableHead>Papel</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {roleAssignments.map((assignment) => (
                            <TableRow key={assignment.roleId}>
                                <TableCell>{mapContextType[assignment.contextType]}</TableCell>
                                <TableCell title={assignment.contextId || undefined}>{assignment.contextName || (assignment.contextType === ContextType.system ? 'Sistema' : assignment.contextId || '—')}</TableCell>
                                <TableCell>{assignment.Role.name}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        type="button"
                                        onClick={() => handleDeleteRoleAssignmentClick(assignment.id)}
                                    >
                                        Remover
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {addingRole ? (
                <RoleAssignmentCreationForm
                    user={user}
                    availableRoles={roles}
                    onAddedRole={onAddedRole}
                    setAddingRole={setAddingRole}
                />
            ) : (
                <Button type="button" onClick={() => setAddingRole(true)} className="mt-4">
                    Adicionar Novo Papel
                </Button>
            )}
        </div>
    );
}


function RoleAssignmentCreationForm({ user, availableRoles, setAddingRole, onAddedRole }: { user: User, availableRoles: Role[], onAddedRole: (roleAssignment: Partial<RoleAssignment> & { name: string }) => void, setAddingRole: (value: boolean) => void }) {
    const [contextType, setContextType] = useState<ContextType>();
    const [contextId, setContextId] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<Role>();
    const { createRoleAssignment, loading, error } = useRoleAssignmentMutations();
    const { toast } = useToast();

    // Multi-complex selection
    const [selectedComplexIds, setSelectedComplexIds] = useState<Set<string>>(new Set());
    const [selectedComplexes, setSelectedComplexes] = useState<Array<Pick<Complex, "id" | "socialName" | "aliasName">>>([]);
    const [bulkAdding, setBulkAdding] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

    const [cascateContextSearching, setCascateContextSearching] = useState<{
        company: Company | null;
        complex: Complex | null;
        block: Block | null;
        apartment: Apartment | null;
    }>({
        company: null,
        complex: null,
        block: null,
        apartment: null,
    });

    function handleCasacteContextSelect(selectedContextType: ContextType, contextModel: Company | Complex | Block | Apartment | null) {
        setCascateContextSearching((prev) => {
            const updated = { ...prev, [selectedContextType]: contextModel };
            Object.assign(updated, {
                complex: selectedContextType === ContextType.company ? null : updated.complex,
                block: selectedContextType === ContextType.company || selectedContextType === ContextType.complex ? null : updated.block,
                apartment: selectedContextType !== ContextType.apartment ? null : updated.apartment,
            });
            return updated;
        });

        if (contextType == selectedContextType) {
            setContextId(contextModel?.id || null);
        }
    }

    useEffect(() => {
        if (loading) {
            toast({ title: "Aguarde", description: "Adicionando papel...", duration: 2000 });
        }
    }, [loading, toast]);

    useEffect(() => {
        if (error) {
            toast({ title: "Erro", description: error, variant: "destructive" });
        }
    }, [error, toast]);

    const handleSelectContextType = (value: ContextType) => {
        setContextType(value);
        setSelectedComplexIds(new Set());
        setSelectedComplexes([]);
        setBulkProgress(null);
        setCascateContextSearching((prev) => ({ ...prev, complex: null, block: null, apartment: null }));
        if (value === ContextType.system) {
            setContextId(ContextType.system);
        } else {
            setContextId(null);
        }
    }

    const syncSelectedComplexContext = (ids: Set<string>) => {
        if (ids.size === 1) {
            setContextId([...ids][0]);
            return;
        }

        setContextId(null);
    };

    const addSelectedComplex = () => {
        const complex = cascateContextSearching.complex;
        if (!complex?.id) return;

        setSelectedComplexIds((prev) => {
            const updated = new Set(prev);
            updated.add(complex.id);
            syncSelectedComplexContext(updated);
            return updated;
        });

        setSelectedComplexes((prev) => {
            if (prev.some((item) => item.id === complex.id)) {
                return prev;
            }

            return [...prev, {
                id: complex.id,
                socialName: complex.socialName,
                aliasName: complex.aliasName,
            }];
        });
    };

    const removeSelectedComplex = (complexId: string) => {
        setSelectedComplexIds((prev) => {
            const updated = new Set(prev);
            updated.delete(complexId);
            syncSelectedComplexContext(updated);
            return updated;
        });

        setSelectedComplexes((prev) => prev.filter((item) => item.id !== complexId));
    };

    const clearSelectedComplexes = () => {
        setSelectedComplexIds(new Set());
        setSelectedComplexes([]);
        setContextId(null);
    };

    const renderContextSearchFields = () => {
        // For complex context: show multi-select
        if (contextType === ContextType.complex) {
            return (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Selecionar Condomínios:</Label>
                        <span className="text-xs text-muted-foreground">{selectedComplexIds.size} selecionado(s)</span>
                    </div>
                    <ComplexesCombobox
                        autoSelectSingle={false}
                        modal
                        complex={cascateContextSearching.complex ?? undefined}
                        setSelectedComplex={(complex) => {
                            handleCasacteContextSelect(ContextType.complex, complex ?? null);
                        }}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addSelectedComplex}
                            disabled={!cascateContextSearching.complex?.id}
                        >
                            Adicionar condomínio selecionado
                        </Button>
                        {selectedComplexIds.size > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={clearSelectedComplexes}
                            >
                                Limpar lista
                            </Button>
                        )}
                    </div>
                    {selectedComplexIds.size > 0 && (
                        <div className="flex flex-wrap gap-1 rounded-md border p-2">
                            {selectedComplexes.map((complex) => (
                                <Badge key={complex.id} variant="secondary" className="text-xs gap-1">
                                    {complex.socialName || complex.aliasName || complex.id.slice(0, 8)}
                                    <button
                                        type="button"
                                        className="inline-flex"
                                        onClick={() => removeSelectedComplex(complex.id)}
                                        aria-label={`Remover ${complex.socialName || complex.aliasName || "condomínio"}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}
                    {selectedComplexIds.size === 0 && (
                        <p className="text-sm text-muted-foreground">
                            Pesquise um condomínio, selecione e clique no botão Adicionar condomínio selecionado.
                        </p>
                    )}
                </div>
            );
        }

        return (
            <>
                {/* COMPANY */}
                {(contextType == ContextType.company || contextType == ContextType.block || contextType == ContextType.apartment) && (
                    <SelectCompany
                        modal
                        company={cascateContextSearching.company as Company}
                        setSelectedCompany={(company) => {
                            handleCasacteContextSelect(ContextType.company, company as Company);
                        }}
                    />
                )}
                {/* BLOCK */}
                {(contextType == ContextType.block || contextType == ContextType.apartment) && cascateContextSearching.company && (
                    <ComplexesCombobox
                        modal
                        complex={cascateContextSearching.complex ?? undefined}
                        setSelectedComplex={(complex) => {
                            handleCasacteContextSelect(ContextType.complex, complex ?? null);
                        }}
                    />
                )}
                {(contextType == ContextType.block || contextType == ContextType.apartment) && cascateContextSearching.complex && (
                    <BlocksCombobox
                        modal
                        complexId={cascateContextSearching.complex.id}
                        block={cascateContextSearching.block as Block}
                        setSelectedBlock={(block) => {
                            handleCasacteContextSelect(ContextType.block, block as Block);
                        }}
                    />
                )}
                {/* APARTMENT */}
                {(contextType == ContextType.apartment) && cascateContextSearching.block && (
                    <SelectApartment
                        modal
                        apartment={cascateContextSearching.apartment as Apartment}
                        blockId={cascateContextSearching.block.id}
                        setSelectedApartment={(apartment) => {
                            handleCasacteContextSelect(ContextType.apartment, apartment as Apartment);
                        }}
                    />
                )}
            </>
        );
    };

    const handleAddRole = async () => {
        if (!user || !selectedRole || !contextType) return;

        // Multi-complex bulk assignment
        if (contextType === ContextType.complex && selectedComplexIds.size > 0) {
            setBulkAdding(true);
            const complexList = [...selectedComplexIds];
            setBulkProgress({ done: 0, total: complexList.length, errors: [] });
            let done = 0;
            const errors: string[] = [];
            for (const cxId of complexList) {
                try {
                    await createRoleAssignment({ userId: user.id, roleId: selectedRole.id, contextType, contextId: cxId });
                    done++;
                    setBulkProgress({ done, total: complexList.length, errors });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : cxId;
                    errors.push(msg);
                    done++;
                    setBulkProgress({ done, total: complexList.length, errors });
                }
            }
            setBulkAdding(false);
            if (errors.length === 0) {
                toast({ title: "Sucesso", description: `${complexList.length} papel(éis) adicionado(s) com sucesso!` });
            } else {
                toast({ title: "Concluído com erros", description: `${done - errors.length} adicionados, ${errors.length} erros.`, variant: "destructive" });
            }
            onAddedRole({ id: selectedRole.id, name: selectedRole.name, contextType, contextId: 'bulk' });
            return;
        }

        if (!contextId) return;
        try {
            const createdRoleAssignment = await createRoleAssignment({ userId: user.id, roleId: selectedRole.id, contextType, contextId });
            if (createdRoleAssignment?.id) {
                toast({ title: "Sucesso", description: "Papel adicionado com sucesso!", variant: "default" });
                onAddedRole({ id: selectedRole.id, name: selectedRole.name, contextType, contextId });
            }
        } catch (error) {
            console.error("Error adding role:", error);
        }
    };

    const isAddDisabled = !selectedRole || !contextType || (
        contextType === ContextType.complex
            ? selectedComplexIds.size === 0
            : !contextId
    ) || bulkAdding;

    return (
        <Card>
            <CardHeader className="flex flex-row justify-start">
                <CardTitle className="mt-0 text-lg font-semibold w-fit">Adicionar Papel</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 mt-4">
                    {/* SELECT ROLE */}
                    <div className="flex space-x-2">
                        <Select onValueChange={(value) => setSelectedRole(availableRoles.find((role) => role.id === value))}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um papel" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* SELECT CONTEXT TYPE */}
                        <Select onValueChange={handleSelectContextType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Em que contexto?" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(ContextType).map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {mapContextType[type]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {/* CONTEXT REFERENCE */}
                    {contextType && contextType != ContextType.system && (
                        <div className="pb-4">
                            <Separator className="my-6" />
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Informar {mapContextType[contextType]} abaixo:</Label>
                                {renderContextSearchFields()}
                            </div>
                            <Input
                                className="hidden"
                                placeholder="Context ID"
                                value={contextId || ""}
                                onChange={(e) => setContextId(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Bulk progress */}
                    {bulkProgress && (
                        <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                            {bulkAdding
                                ? `Adicionando... ${bulkProgress.done}/${bulkProgress.total}`
                                : <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-500" /> Concluído: {bulkProgress.done - bulkProgress.errors.length} de {bulkProgress.total} adicionados.</span>
                            }
                        </div>
                    )}

                    <div className="flex space-x-2">
                        <Button type="button" onClick={handleAddRole} disabled={isAddDisabled} size="sm">
                            {bulkAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {contextType === ContextType.complex && selectedComplexIds.size > 1
                                ? `Adicionar em ${selectedComplexIds.size} condomínios`
                                : "Adicionar"
                            }
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setAddingRole(false)} size="sm">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
