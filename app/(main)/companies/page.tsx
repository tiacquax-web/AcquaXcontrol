"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Loader2, MapPin, Phone, Plus, Search } from "lucide-react"
import { useCompanies, useCompanyMutations } from "@/hooks/useCompanies"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import CompanyModal from "./company-modal"
import type { Company } from "@prisma/client"

export default function CompaniesPage() {
    const [filters, setFilters] = useState({ nameQuery: "", documentCompany: "" })
    const { companies, error, loading, refetch } = useCompanies(filters)
    const { createCompany, updateCompany, deleteCompany, error: mutationError } = useCompanyMutations()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
    const { toast } = useToast()

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFilters((prev) => ({ ...prev, [name]: value }))
    }

    const handleAddCompany = () => {
        setCurrentCompany(null)
        setIsModalOpen(true)
    }

    const handleEditCompany = (company: Company) => {
        setCurrentCompany(company)
        setIsModalOpen(true)
    }

    const handleSaveCompany = async (companyData: Partial<Company>) => {
        try {
            if (currentCompany) {
                await updateCompany(currentCompany.id, { ...currentCompany, ...companyData })
            } else {
                await createCompany(companyData as Company)
            }
            refetch()
            setIsModalOpen(false)
            setCurrentCompany(null)
        } catch (error) {
            console.error("Erro ao salvar empresa:", error)
        }
    }

    const handleDeleteCompany = async (id: string) => {
        if (window.confirm("Tem certeza de que deseja excluir esta empresa?")) {
            try {
                await deleteCompany(id)
            } catch (error) {
                console.error("Erro ao excluir empresa:", error)
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
                        <CardTitle className="text-2xl font-bold">Empresas</CardTitle>
                        <CardDescription>Gerencie suas empresas e seus detalhes</CardDescription>
                    </div>
                    <Button onClick={handleAddCompany}>
                        <Plus className="mr-2 h-4 w-4" /> Adicionar Empresa
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
                                    placeholder="Buscar por nome"
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
                                    placeholder="Buscar por CNPJ"
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
                                Erro ao carregar empresas: { error }
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Localização</TableHead>
                                            <TableHead>CNPJ</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Contato</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {companies.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                    Nenhuma empresa encontrada
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            companies.map((company) => (
                                                <TableRow key={company.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                <div>{company.socialName}</div>
                                                                {company.name && (
                                                                    <div className="text-xs text-muted-foreground">{company.name}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                {company.city && company.state ? (
                                                                    <div>
                                                                        {company.city}, {company.state}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">Não especificado</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{company.documentCompany || "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary">
                                                            Ativo
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {company.telephone || company.cell ? (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                                <span>{company.telephone || company.cell}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground">Sem contato</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditCompany(company)}>
                                                                Editar
                                                            </Button>
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteCompany(company.id)}>
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
                        )}
                    </div>
                </CardContent>
            </Card>

            <CompanyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveCompany}
                company={currentCompany}
            />
        </div>
    )
}
