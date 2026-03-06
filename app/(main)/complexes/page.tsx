"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Loader2, MapPin, Phone, Plus, Search } from "lucide-react"
import { useComplexes, useComplexMutations } from "@/hooks/useComplexes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import ComplexModal from "./complexes-modal"
import type { Complex } from "@prisma/client"
import type { ComplexFull } from "@/types/fullTypes"

export default function ComplexesPage() {
    const [filters, setFilters] = useState({ nameQuery: "", documentCompany: "" })
    const { complexes, error, loading } = useComplexes(filters)
    const { createComplex, updateComplex, deleteComplex, error: mutationError } = useComplexMutations()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentComplex, setCurrentComplex] = useState<Complex | null>(null)
    const { toast } = useToast()
    // Estado local para lista reativa
    const [localComplexes, setLocalComplexes] = useState<ComplexFull[]>([])

    useEffect(() => {
        setLocalComplexes(complexes)
    }, [complexes])

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFilters((prev) => ({ ...prev, [name]: value }))
    }

    const handleAddComplex = () => {
        setCurrentComplex(null)
        setIsModalOpen(true)
    }

    const handleEditComplex = (complex: Complex) => {
        setCurrentComplex(complex)
        setIsModalOpen(true)
    }

    const handleSaveComplex = async (complexData: Partial<Complex>) => {
        try {
            if (currentComplex) {
                const updatedComplex = await updateComplex(currentComplex.id, { ...currentComplex, ...complexData })
                if (!updatedComplex) {
                    throw new Error("Erro ao atualizar condomínio")
                }
                // Atualiza o item editado na lista local
                setLocalComplexes((prev) => prev.map((c) => c.id === currentComplex.id ? { ...c, ...complexData } : c))
            } else {
                // Criação: recebe o objeto criado e adiciona na lista local
                const created = await createComplex(complexData as Complex)
                if (created && created.id) {
                    setLocalComplexes((prev) => [created, ...prev])
                }
            }
            setIsModalOpen(false)
        } catch (error) {
            console.error("Erro ao salvar condomínio:", error)
        }
    }

    const handleDeleteComplex = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir este condomínio?")) {
            try {
                const deletedComplex = await deleteComplex(id)
                if (deletedComplex) {
                    setLocalComplexes((prev) => prev.filter((c) => c.id !== id))
                }
            } catch (error) {
                console.error("Erro ao excluir condomínio:", error)
            }
        }
    }

    useEffect(() => {
        if (mutationError) {
            toast({
                title: "Erro",
                description: mutationError,
                variant: "destructive",
            });
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
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold">Condomínios</CardTitle>
                        <CardDescription>Gerencie condomínios e suas informações</CardDescription>
                    </div>
                    <Button onClick={handleAddComplex}>
                        <Plus className="mr-2 h-4 w-4" /> Add Complex
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    name="nameQuery"
                                    placeholder="Search by name"
                                    value={filters.nameQuery}
                                    onChange={handleFilterChange}
                                    className="pl-8"
                                />
                            </div>
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    name="documentCompany"
                                    placeholder="Search by CNPJ"
                                    value={filters.documentCompany}
                                    onChange={handleFilterChange}
                                    className="pl-8"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 text-red-500">
                                Erro para carregar condomínios: { error }
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Location</TableHead>
                                            <TableHead>CNPJ</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Contact</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {localComplexes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                    No complexes found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            localComplexes.map((complex) => (
                                                <TableRow key={complex.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                <div>{complex.socialName}</div>
                                                                {complex.aliasName && (
                                                                    <div className="text-xs text-muted-foreground">{complex.aliasName}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                {complex.city && complex.state ? (
                                                                    <div>
                                                                        {complex.city}, {complex.state}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">-</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{complex.documentCompany || "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={complex.status === "Ativo" ? "success" : "secondary"}>
                                                            {complex.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {complex.telephone || complex.cell ? (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                                <span>{complex.telephone || complex.cell}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground">No contact</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditComplex(complex)}>
                                                                Editar
                                                            </Button>
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteComplex(complex.id)}>
                                                                Deletar
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <ComplexModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveComplex}
                complex={currentComplex}
            />
        </div>
    )
}

