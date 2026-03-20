"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Download, Loader2, Plus, Search, Trash2 } from "lucide-react"
import { useApartments, useApartmentMutations } from "@/hooks/useApartments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import ApartmentModal from "./apartments-modal"
import type { Apartment } from "@prisma/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import ComboboxCompany from "@/components/ComboboxCompany";
import ComboboxComplex from "@/components/ComboboxComplex";
import ComboboxBlock from "@/components/ComboboxBlock";
import axios from "axios";

export default function ApartmentsPage() {
    const [filters, setFilters] = useState({ nameQuery: "", blockId: "", complexId: "", companyId: "" })
    const [currentPage, setCurrentPage] = useState(1);
    const [take, setTake] = useState(10);
    const [skip, setSkip] = useState(0);
    const { apartments, error, loading, totalCount = 0, refetch } = useApartments({ ...filters, take, skip, withComplex: true, withBlock: true });
    const { createApartment, updateApartment, deleteApartment, error: mutationError } = useApartmentMutations()
    const [exportLoading, setExportLoading] = useState(false)
    const [dedupeLoading, setDedupeLoading] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentApartment, setCurrentApartment] = useState<Apartment | null>(null)
    const { toast } = useToast()

    const [selectedCompany, setSelectedCompany] = useState<any | undefined>(undefined);
    const [selectedComplex, setSelectedComplex] = useState<any | undefined>(undefined);
    const [selectedBlock, setSelectedBlock] = useState<any | undefined>(undefined);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFilters((prev) => ({ ...prev, [name]: value }))
        setCurrentPage(1);
        setSkip(0);
    }

    const handleExportApartments = async () => {
        setExportLoading(true)
        try {
            const response = await axios.post('/api/user/apartments/export', {
                search: filters.nameQuery,
                complexId: filters.complexId || undefined,
                blockId: filters.blockId || undefined,
            }, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `apartamentos_${new Date().toISOString().split('T')[0]}.xlsx`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast({ title: 'Exportação concluída!', description: 'Planilha baixada.' })
        } catch (error: any) {
            toast({ title: 'Erro', description: error.response?.data?.error || error.message, variant: 'destructive' })
        } finally {
            setExportLoading(false)
        }
    }

    const handleDeleteDuplicates = async () => {
        const scopeText = filters.blockId
            ? "do bloco filtrado"
            : filters.complexId
                ? "do condomínio filtrado"
                : "de todos os condomínios visíveis ao seu acesso";
        if (!window.confirm(`Deseja remover apartamentos duplicados ${scopeText}?\n\nA operação mantém apenas 1 registro por nome+bloco e exclui os demais.`)) {
            return;
        }

        setDedupeLoading(true);
        try {
            const response = await axios.post('/api/user/apartments/deduplicate', {
                complexId: filters.complexId || undefined,
                blockId: filters.blockId || undefined,
            });
            toast({
                title: "Deduplicação concluída",
                description: `${response.data.deletedCount || 0} apartamento(s) duplicado(s) removido(s).`,
            });
            refetch();
        } catch (error: any) {
            toast({
                title: "Erro ao remover duplicados",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        } finally {
            setDedupeLoading(false);
        }
    }

    const handleAddApartment = () => {
        setCurrentApartment(null)
        setIsModalOpen(true)
    }

    const handleEditApartment = (apartment: Apartment) => {
        setCurrentApartment(apartment)
        setIsModalOpen(true)
    }

    const handleSaveApartment = async (apartmentData: Partial<Apartment>) => {
        try {
            if (currentApartment) {
                await updateApartment(currentApartment.id, { ...currentApartment, ...apartmentData })
            } else {
                await createApartment(apartmentData as Apartment)
            }
            refetch()
            setIsModalOpen(false)
        } catch (error) {
            console.error("Erro ao salvar apartamento:", error)
        }
    }

    const handleDeleteApartment = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir este apartamento?")) {
            try {
                await deleteApartment(id)
                refetch()
            } catch (error) {
                console.error("Erro ao excluir apartamento:", error)
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

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        setSkip((page - 1) * take);
    };

    const handleRowsPerPageChange = (value: string) => {
        const newTake = Number.parseInt(value);
        setTake(newTake);
        setSkip(0);
        setCurrentPage(1);
    };

    // Atualiza complexos ao trocar empresa
    useEffect(() => {
        setSelectedComplex(undefined);
        setSelectedBlock(undefined);
        setFilters((prev) => ({
            ...prev,
            companyId: selectedCompany?.id || "",
            complexId: "",
            blockId: ""
        }));
    }, [selectedCompany]);

    // Atualiza blocos ao trocar condomínio
    useEffect(() => {
        setSelectedBlock(undefined);
        setFilters((prev) => ({
            ...prev,
            complexId: selectedComplex?.id || "",
            blockId: ""
        }));
    }, [selectedComplex]);

    // Atualiza filtro ao trocar bloco
    useEffect(() => {
        setFilters((prev) => ({
            ...prev,
            blockId: selectedBlock?.id || ""
        }));
    }, [selectedBlock]);

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold">Apartamentos</CardTitle>
                        <CardDescription>Gerencie os apartamentos e seus detalhes</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExportApartments} disabled={exportLoading}>
                            {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Exportar
                        </Button>
                        <Button variant="outline" onClick={handleDeleteDuplicates} disabled={dedupeLoading}>
                            {dedupeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir Duplicados
                        </Button>
                        <Button onClick={handleAddApartment}>
                            <Plus className="mr-2 h-4 w-4" /> Adicionar Apartamento
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col space-y-4">
                        {/* Filtros hierárquicos */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="flex-1 min-w-[180px]">
                                <ComboboxCompany setSelectedCompany={setSelectedCompany} company={selectedCompany} autoSelectSingle={false} />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                                <ComboboxComplex setSelectedComplex={setSelectedComplex} complex={selectedComplex} companyId={selectedCompany?.id} autoSelectSingle={false} />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                                <ComboboxBlock setSelectedBlock={setSelectedBlock} block={selectedBlock} complexId={selectedComplex?.id} />
                            </div>
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
                        </div>

                        {loading ? (
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 text-red-500">
                                Erro ao carregar apartamentos: { error }
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Bloco</TableHead>
                                            <TableHead>Condomínio</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {apartments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                                                    Nenhum apartamento encontrado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            apartments.map((apartment) => (
                                                <TableRow key={apartment.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            <div>{apartment.name}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={apartment.status === "Ativo" ? "success" : "secondary"}>
                                                            {apartment.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{apartment.block?.name || '-'}</TableCell>
                                                    <TableCell>{apartment.block?.complex?.socialName || '-'}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditApartment(apartment)}>
                                                                Editar
                                                            </Button>
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteApartment(apartment.id)}>
                                                                Excluir
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )))
                                        }
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {/* Pagination Controls */}
                        {!loading && apartments.length > 0 && (
                            <div className="flex items-center justify-between mt-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Linhas:</span>
                                    <Select value={take.toString()} onValueChange={handleRowsPerPageChange}>
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue placeholder={take.toString()} />
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
                                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
                                    <span className="text-sm text-muted-foreground text-nowrap">
                                        {skip + 1}-{Math.min(skip + take, totalCount)} de {totalCount}
                                    </span>
                                    <Pagination>
                                        <PaginationContent className="flex items-center gap-2 justify-center w-full">
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
                                            {/* Next page if not on last page */}
                                            {currentPage < Math.ceil(totalCount / take) && (
                                                <PaginationItem>
                                                    <PaginationLink onClick={() => handlePageChange(currentPage + 1)}>
                                                        {currentPage + 1}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            )}
                                            {/* Ellipsis if needed */}
                                            {currentPage < Math.ceil(totalCount / take) - 2 && (
                                                <PaginationItem>
                                                    <PaginationEllipsis />
                                                </PaginationItem>
                                            )}
                                            {/* Last page if not already showing */}
                                            {currentPage < Math.ceil(totalCount / take) - 1 && (
                                                <PaginationItem>
                                                    <PaginationLink onClick={() => handlePageChange(Math.ceil(totalCount / take))}>
                                                        {Math.ceil(totalCount / take)}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            )}
                                            <PaginationItem>
                                                <PaginationNext
                                                    onClick={() =>
                                                        currentPage < Math.ceil(totalCount / take) && handlePageChange(currentPage + 1)
                                                    }
                                                    className={
                                                        currentPage >= Math.ceil(totalCount / take)
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
                    </div>
                </CardContent>
            </Card>

            <ApartmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveApartment}
                apartment={currentApartment}
            />
        </div>
    )
}
