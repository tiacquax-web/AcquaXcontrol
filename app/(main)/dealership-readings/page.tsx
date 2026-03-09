"use client"

import { Building, Building2, BuildingIcon, BuildingIcon as Buildings, ChevronDown, ChevronRight, Download, Eye, Filter, House, HousePlus, Plus, Flame, Droplets } from "lucide-react"
import { useState } from "react"
import { Company, PermissionableEntity, type Block, type Complex } from "@prisma/client"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import ComplexesCombobox from "@/components/ComboboxComplex"
import BlocksCombobox from "@/components/ComboboxBlock"
import BlocksList from "@/components/BlocksList"
import ComplexesList from "@/components/ComplexesList"
import { DateRangeSelector } from "@/components/date-range-selector"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import SelectCompany from "@/components/ComboboxCompany"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDealershipReadings } from "@/hooks/useDealershipReadings"
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationLink, PaginationEllipsis, PaginationNext } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"

const viewTypeNames = {
    Cards: "Cards",
    Table: "Table"
}

const sixtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 60))

export default function ReadingsPage() {
    const router = useRouter()
    const [searchType, setSearchType] = useState<'Cards' | 'Table'>('Table')
    const [dateRange, setDateRange] = useState({ from: sixtyDaysAgo, to: new Date() })
    const [utilityType, setUtilityType] = useState<'all' | 'water' | 'gas'>('all')

    const [filters, setFilters] = useState<{ company: Company | undefined, complex: Complex | undefined; block: Block | undefined, take: number, skip: number }>({ company: undefined, complex: undefined, block: undefined, take: 10, skip: 0 })
    const { company: selectedCompany, complex: selectedComplex, block: selectedBlock } = filters

    const [currentPage, setCurrentPage] = useState(1)

    const [searchText, setSearchText] = useState("")
    const [viewType, setViewType] = useState<'Cards' | 'Table'>('Table')
    const viewTypeName = viewTypeNames[viewType]

    const { dealershipReadings, totalCount, error, loading } = useDealershipReadings({
        companyId: selectedCompany?.id,
        complexId: selectedComplex?.id,
        // dealershipId: selectedDealership?.id,
        withComplex: true,
        withCompany: true,
        search: searchText,
        fromDate: dateRange.from,
        toDate: dateRange.to,
        take: 10,
        type: utilityType === 'all' ? undefined : utilityType,
    })

    const setSelectedCompany = (company: Company | undefined) => {
        setFilters((prev) => ({ ...prev, company, complex: undefined, block: undefined, skip: 0 }))
        setCurrentPage(1)
    }

    const setSelectedComplex = (complex: Complex | undefined) => {
        setFilters((prev) => ({ ...prev, complex, block: undefined, skip: 0 }))
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

    const handleNewDealershipReading = () => {
        router.push(`/dealership-readings/new`)
    }

    const handleDateRangeChange = (range: { from: Date, to: Date }) => {
        setDateRange(range)
    }

    const TypeFilter = (
        <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <Select value={utilityType} onValueChange={(v: 'all' | 'water' | 'gas') => setUtilityType(v)}>
                <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="water">Água</SelectItem>
                    <SelectItem value="gas">Gás</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )

    return (
        <div className="space-y-8 w-full md:py-6">
            <section className="container mx-auto px-4 md:px-6">

                <Card>
                    <CardHeader className="flex flex-col items-start">
                        <CardTitle>
                            <span>Relatórios de Condomínios</span>
                        </CardTitle>
                        <CardDescription >Relatórios de Cobranças das Concessionárias</CardDescription>
                        {/* <Button variant="link" size="sm" onClick={() => setSearchType(searchType == 'Cards' ? 'Table' : 'Cards')} className="h-9 px-0">
                            {searchType == 'Cards' ? 'Ver Tabela Completa' : 'Navegar por Cards'}
                        </Button> */}
                    </CardHeader>
                    <CardContent className="space-y-4 md:flex md:flex-wrap md:space-y-0 gap-5">
                        {/* <Filter className="h-5 w-5 self-center align-middle" /> */}

                        <div className="flex flex-wrap gap-5 w-full">
                            <DateRangeSelector onDateRangeChange={handleDateRangeChange} />
                            {TypeFilter}
                            <div className="flex items-center space-x-2">
                                <HousePlus className="h-5 w-5 text-muted-foreground" />
                                <SelectCompany setSelectedCompany={setSelectedCompany} company={selectedCompany} getAvailableForEntity={PermissionableEntity.dealershipReading} autoSelectSingle={false} />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                                <ComplexesCombobox setSelectedComplex={setSelectedComplex} complex={selectedComplex} companyId={selectedCompany?.id} getAvailableForEntity={PermissionableEntity.dealershipReading} autoSelectSingle={false} />
                            </div>

                            <div className="flex items-center justify-between space-x-2 w-full">
                                <Button variant="outline" size="sm" className="h-9">
                                    <Download className="h-4 w-4 mr-2" />
                                    Exportar
                                </Button>

                                <Button variant="default" className="self-end" onClick={() => handleNewDealershipReading()}>
                                    <Plus className="w-4 h-4" /> Novo
                                </Button>
                            </div>
                        </div>

                        {/* <Separator /> */}


                        <div className="flex flex-col space-y-4 w-full">
                            {selectedCompany && (
                                <div className="mt-6 rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Ano</TableHead>
                                                <TableHead>Mês</TableHead>
                                                <TableHead>Condomínio</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Data da Leitura</TableHead>
                                                <TableHead>Próxima Leitura</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dealershipReadings.map((reading) =>
                                                <TableRow key={reading.id}>
                                                    <TableCell>{reading.yearRef}</TableCell>
                                                    <TableCell>{reading.monthRef}</TableCell>
                                                    <TableCell>{reading.complex?.socialName}</TableCell>
                                                    <TableCell>
                                                        {reading.type === 'water' ? (
                                                            <Badge variant="secondary" className="gap-1"><Droplets className="h-3 w-3" /> Água</Badge>
                                                        ) : reading.type === 'gas' ? (
                                                            <Badge variant="secondary" className="gap-1"><Flame className="h-3 w-3" /> Gás</Badge>
                                                        ) : (
                                                            <Badge variant="outline">-</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{reading.readingDate}</TableCell>
                                                    <TableCell>{reading.readingDateNext}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {/* <Button variant="outline" size="sm">
                                                                <Download className="h-4 w-4" /> Download
                                                            </Button> */}
                                                            <Button variant="outline" size="sm" onClick={() => router.push(`/dealership-readings/${reading.id}`)}>
                                                                <Eye className="h-4 w-4" /> Ver
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
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
                                dealershipReadings.length > 0 && (
                                    <div className="flex items-center justify-between mt-4 flex-wrap w-full">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">Linhas:</span>
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

                                        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap w-full md:w-auto">
                                            <span className="text-sm text-muted-foreground text-nowrap">
                                                {filters.skip + 1}-{Math.min(filters.skip + filters.take, totalCount)} de {totalCount}
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
            </section>


        </div>
    )
}

