"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building, Building2, DoorClosed, Gauge, HousePlus, Plus, Search, Upload } from "lucide-react"
import { useMeters, useMeterMutations } from "@/hooks/useMeters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import MeterModal from "./meters-modal"
import { ImportMetersDialog } from "@/components/import-meters-dialog"
import type { Apartment, Block, Company, Complex, Meter } from "@prisma/client"
import { MeterFull } from "@/types/fullTypes"
import SelectCompany from "@/components/ComboboxCompany"
import SelectComplex from "@/components/ComboboxComplex"
import SelectBlock from "@/components/ComboboxBlock"
import SelectApartment from "@/components/ComboboxApartment"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"

export default function MetersPage() {
  const [filters, setFilters] = useState<{
    company: Company | undefined
    complex: Complex | undefined
    block: Block | undefined
    apartment: Apartment | undefined
    take: number
    skip: number
    orderBy: string | undefined
    nameQuery: string | undefined
  }>({
    company: undefined,
    complex: undefined,
    block: undefined,
    apartment: undefined,
    take: 10,
    skip: 0,
    orderBy: undefined,
    nameQuery: undefined,
  })
  const [currentPage, setCurrentPage] = useState(1)
  const { meters, error, loading, totalCount, refetch } = useMeters({
    companyId: filters.company?.id,
    complexId: filters.complex?.id,
    blockId: filters.block?.id,
    apartmentId: filters.apartment?.id,
    take: filters.take,
    skip: filters.skip,
    orderBy: filters.orderBy,
    search: filters.nameQuery,
    meterTypeName: undefined,
    withApartment: true,
    withBlock: true,
    withComplex: true,
    withTypeMeter: true,
  })
  const { createMeter, updateMeter, deleteMeter, error: mutationError } = useMeterMutations()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentMeter, setCurrentMeter] = useState<Partial<Meter> | undefined>(undefined)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const { toast } = useToast()

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const handleAddMeter = () => {
    setCurrentMeter({})
    setIsModalOpen(true)
  }

  const handleEditMeter = (meter: MeterFull) => {
    setCurrentMeter(meter)
    setIsModalOpen(true)
  }

  const handleSaveMeter = async (meterData: Partial<Meter>) => {
    //TODO - Instead of refetch, update the state of the meters list (sorted by the state "sortedBy")
    try {
      if (currentMeter?.id) {
        await updateMeter(currentMeter.id, { ...currentMeter as Meter, ...meterData })
      } else {
        await createMeter(meterData as Meter)
      }
      refetch();
      setIsModalOpen(false)
    } catch (error) {
      console.error("Error saving meter:", error)
    }
  }

  const handleDeleteMeter = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this meter?")) {
      try {
        await deleteMeter(id)
      } catch (error) {
        console.error("Error deleting meter:", error)
      }
    }
  }

  useEffect(() => {
    if (mutationError) {
      toast({
        title: "Error",
        description: mutationError,
        variant: "destructive",
      })
    }
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      })
    }
  }, [error, mutationError, toast])

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

  return (
    <div className="space-y-6 w-full p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-2xl font-bold">Medidores</CardTitle>
              <CardDescription>Gerencie os medidores e seus detalhes</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddMeter}>
                <Plus className="mr-2 h-4 w-4" /> Novo Medidor
              </Button>
              <Button variant="secondary" onClick={() => setIsImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar Medidores
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <motion.div
                className="flex flex-col sm:flex-row gap-4 mb-6"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative flex-1">
                  <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                    <HousePlus className="h-4 w-4" />
                    Empresa
                  </Label>
                  <SelectCompany
                    company={filters.company}
                    setSelectedCompany={(company) => {
                      setFilters((prev) => ({
                        ...prev,
                        company,
                        complex: undefined,
                        block: undefined,
                        apartment: undefined,
                      }))
                    }}
                  />
                </div>
                <div className="relative flex-1">
                  <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                    <Building2 className="h-4 w-4" />
                    Condomínio
                  </Label>
                  <SelectComplex
                    complex={filters.complex}
                    companyId={filters.company?.id}
                    setSelectedComplex={(complex) => {
                      setFilters((prev) => ({ ...prev, complex, block: undefined, apartment: undefined }))
                    }}
                  />
                </div>
                <div className="relative flex-1">
                  <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                    <Building className="h-4 w-4" />
                    Bloco
                  </Label>
                  <SelectBlock
                    block={filters.block}
                    complexId={filters.complex?.id}
                    setSelectedBlock={(block) => {
                      setFilters((prev) => ({ ...prev, block, apartment: undefined }))
                    }}
                  />
                </div>
                <div className="relative flex-1">
                  <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                    <DoorClosed className="h-4 w-4" />
                    Apartamento
                  </Label>
                  <SelectApartment
                    apartment={filters.apartment}
                    blockId={filters.block?.id}
                    setSelectedApartment={(apartment) => {
                      setFilters((prev) => ({ ...prev, apartment }))
                    }}
                  />
                </div>
                <div className="relative flex-1">
                  <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                    <Gauge className="h-4 w-4" />
                    Chassi do medidor
                  </Label>
                  <div className="relative">
                    <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      name="nameQuery"
                      placeholder="Procure pelo registro"
                      value={filters.nameQuery}
                      onChange={handleFilterChange}
                      className="pl-8"
                    />
                  </div>
                </div>
                {/* <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    name="status"
                                    placeholder="Search by status"
                                    value={filters.status}
                                    onChange={handleFilterChange}
                                    className="pl-8"
                                />
                            </div> */}
              </motion.div>
              {/* End of filters */}

              {loading ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chassi</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Leitura Inicial</TableHead>
                        <TableHead>Ano de Fabricação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array(filters.take)
                        .fill(0)
                        .map((_, index) => (
                          <TableRow key={index} className="animate-pulse">
                            <TableCell>
                              <Skeleton className="h-5 w-24" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-32" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-16" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-32" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-20" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-16" />
                            </TableCell>
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
              ) : error ? (
                <div className="text-center py-8 text-red-500">Erro para carregar medidores: {error}</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chassi</TableHead>
                        <TableHead>Condomínio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Leitura Inicial</TableHead>
                        <TableHead>Ano de Fabricação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meters.length === 0 ? (
                        <TableRow>
                          {!filters.complex ? (
                            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                              Por favor, selecione um condomínio para visualizar os medidores
                            </TableCell>
                          ) : (
                            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                              Nenhum medidor encontrado
                            </TableCell>
                          )}
                        </TableRow>
                      ) : (
                        meters.map((meter, index) => (
                          <motion.tr
                            key={meter.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.01 }}
                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                          >
                            <TableCell className="font-medium">{meter.register}</TableCell>
                            <TableCell 
                              className="cursor-help" 
                              title={`Condomínio: ${meter.apartment?.block?.complex?.socialName || 'N/A'}\nBloco: ${meter.apartment?.block?.name || 'N/A'}\nApartamento: ${meter.apartment?.name || 'N/A'}`}
                            >
                              {meter.apartment?.block?.complex?.socialName || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={meter.status === "Ativo" ? "success" : "secondary"}>{meter.status}</Badge>
                            </TableCell>
                            <TableCell>{meter.location || "-"}</TableCell>
                            <TableCell>{meter.initialReading.toFixed(2)}</TableCell>
                            <TableCell>{meter.yearManufacture || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditMeter(meter)}>
                                  Editar
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteMeter(meter.id)}>
                                  Deletar
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        )))
                      }
                    </TableBody>
                  </Table>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-between mt-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-64" />
                </div>
              ) : (
                meters.length > 0 && (
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

      {/* Modal for adding/editing meters */}
      { isModalOpen && currentMeter && (
        <MeterModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveMeter}
          meter={currentMeter as Meter}
        />)
      }
      {/* Import dialog for meters */}
      {isImportDialogOpen && (
        <ImportMetersDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
          onImportComplete={() => {
            // Só faz refetch se há um contexto selecionado (empresa, condomínio, bloco ou apartamento)
            const hasContext = filters.company?.id || filters.complex?.id || filters.block?.id || filters.apartment?.id;
            if (hasContext) refetch();
            setIsImportDialogOpen(false);
          }}
        />
      )}
    </div>
  )
}
