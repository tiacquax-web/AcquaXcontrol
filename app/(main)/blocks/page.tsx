"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Loader2, MapPin, Plus, Search } from "lucide-react"
import { useBlocks, useBlockMutations } from "@/hooks/useBlocks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import BlockModal from "./blocks-modal"
import type { Block } from "@prisma/client"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockFull } from "@/types/fullTypes"

export default function BlocksPage() {
    const [filters, setFilters] = useState({ nameQuery: "", complexId: "", complexSocialName: "" })
    const [currentPage, setCurrentPage] = useState(1);
    const [take, setTake] = useState(10);
    const [skip, setSkip] = useState(0);
    const { blocks, error, loading, totalCount = 0 } = useBlocks({ 
        ...filters, 
        take, 
        skip,
        withComplexName: true,
        withApartmentsCount: true,
        withMetersCount: true
    });
    const { createBlock, updateBlock, deleteBlock, error: mutationError } = useBlockMutations()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentBlock, setCurrentBlock] = useState<Block | null>(null)
    const { toast } = useToast()

    // Estado local para blocos reativos
    const [localBlocks, setLocalBlocks] = useState<BlockFull[]>([]);

    // Sincroniza localBlocks com blocks do hook
    useEffect(() => {
        setLocalBlocks(blocks);
    }, [blocks]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFilters((prev) => ({ ...prev, [name]: value }))
        setCurrentPage(1);
        setSkip(0);
    }

    const handleAddBlock = () => {
        setCurrentBlock(null)
        setIsModalOpen(true)
    }

    const handleEditBlock = (block: Block) => {
        setCurrentBlock(block)
        setIsModalOpen(true)
    }

    const handleSaveBlock = async (blockData: Partial<Block>) => {
        try {
            if (currentBlock) {
                const updated = await updateBlock(currentBlock.id, { ...currentBlock, ...blockData })
                setLocalBlocks((prev) => prev.map(b => b.id === currentBlock.id ? { ...b, ...blockData } as BlockFull : b));
            } else {
                const created = await createBlock(blockData as Block);
                if (Array.isArray(created)) {
                    // Garante que não haja duplicatas ao importar vários blocos
                    setLocalBlocks((prev) => {
                        const newBlocks = created.filter(newBlock => !prev.some(b => b.id === newBlock.id));
                        return [...newBlocks, ...prev];
                    });
                } else if (created) {
                    setLocalBlocks((prev) => [created, ...prev]);
                }
            }
            setIsModalOpen(false)
        } catch (error) {
            console.error("Erro ao salvar bloco:", error)
        }
    }

    const handleDeleteBlock = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir este bloco?")) {
            try {
                const deleted = await deleteBlock(id)
                if (deleted) {
                    setLocalBlocks((prev) => prev.filter(b => b.id !== id));
                }
            } catch (error) {
                console.error("Erro ao excluir bloco:", error)
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

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold">Blocos</CardTitle>
                        <CardDescription>Gerencie os blocos e seus detalhes</CardDescription>
                    </div>
                    <Button onClick={handleAddBlock}>
                        <Plus className="mr-2 h-4 w-4" /> Adicionar Bloco
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
                                    name="complexSocialName"
                                    placeholder="Buscar pelo condomínio"
                                    value={filters.complexSocialName}
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
                                Erro ao carregar blocos: { error }
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Condomínio</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {localBlocks.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                                                    Nenhum bloco encontrado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            localBlocks.map((block) => (
                                                <TableRow key={block.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            <div>{block.name}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={block.status === "Ativo" ? "success" : "secondary"}>
                                                            {block.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{block.complex?.socialName}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditBlock(block)}>
                                                                Editar
                                                            </Button>
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteBlock(block.id)}>
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
                        {/* Pagination Controls */}
                        {!loading && localBlocks.length > 0 && (
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

            <BlockModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveBlock}
                block={currentBlock}
            />
        </div>
    )
}
