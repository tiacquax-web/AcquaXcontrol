"use client"

import { useRouter } from "next/navigation"
import { useApartmentsReports } from "@/hooks/useApartmentReport"
import { getApartmentReports } from "@/services/apartmentReportsService"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, DoorClosed, Calendar, Gauge, CreditCard, Trash, Download, Upload, X, Flame, Droplets, Filter } from "lucide-react"
import { useState, useEffect } from "react"
import { Badge } from "./ui/badge"
import type { ApartmentFull } from "@/types/fullTypes"
import { Table, TableHeader, TableHead, TableBody, TableCell, TableRow } from "./ui/table"
import type { ApartmentConsumptionReport } from "@prisma/client"
import { Checkbox } from "./ui/checkbox"
import { Button } from "./ui/button"
import { useToast } from "./ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { ReportTableRow } from "./report-table-row"
import { ImportDialog } from "./import-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "./ui/pagination"
import { usePermissionChecker } from "@/hooks/use-permission-checker"
import * as XLSX from 'xlsx'

interface ApartmentsAndReportsListProps {
  complexId: string
  blockId: string
  search: string
  viewType: "Cards" | "List"
  apartmentId?: string
  dateRange?: {
    from: Date
    to: Date
  }
  selectedReports?: string[]
  setSelectedReports?: (ids: string[]) => void
  utilityType?: 'all' | 'water' | 'gas'
  onUtilityTypeChange?: (type: 'all' | 'water' | 'gas') => void
}

export default function ApartmentsAndReportsList({
  complexId,
  blockId,
  search,
  viewType,
  apartmentId,
  dateRange,
  selectedReports = [],
  setSelectedReports = () => {},
  utilityType = 'all',
  onUtilityTypeChange,
}: ApartmentsAndReportsListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [activeSearch, setActiveSearch] = useState(true)
  const { hasPermission } = usePermissionChecker()
  
  // Verificar se o usuário tem permissão para excluir relatórios de consumo de apartamento
  const canDeleteReports = hasPermission('apartmentConsumptionReport', 'delete')
  
  // Estados para paginação
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const skip = (currentPage - 1) * pageSize
  const { apartmentReports, totalCount, loading, error, refetch } = useApartmentsReports({
    withApartment: true,
    withReadingDate: true,
    complexId,
    blockId,
    apartmentId,
    search,
    activeSearch,
    withMetersCount: true,
    fromDate: dateRange?.from,
    toDate: dateRange?.to,
    take: pageSize,
    skip: skip,
    orderBy: 'apartment.name',
    orderByDirection: 'asc',
    utilityType: utilityType === 'all' ? undefined : utilityType,
  })
  // Estados para diálogos
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  // Calcular total de páginas
  const totalPages = Math.ceil(totalCount / pageSize)

  // Reset página quando pesquisa muda
  useEffect(() => {
    setCurrentPage(1)
  }, [search, complexId, blockId, dateRange?.from, dateRange?.to, utilityType])

  // Função para mudança de página
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Função para mudança de tamanho de página
  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size))
    setCurrentPage(1)
  }

  if (loading) {
    return <LoadingSkeleton viewType={viewType} />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{"Oops, não conseguimos fazer a busca. Tente de novo"}</AlertDescription>
      </Alert>
    )
  }  const apartmentReportsFiltered = apartmentReports

  const handleMedidorClick = (apartmentReportId: string) => {
    router.push(`/apartment-report/${apartmentReportId}`)
  }

  const handleToggleSelect = (id: string) => {
    if (selectedReports.includes(id)) {
      setSelectedReports(selectedReports.filter((reportId) => reportId !== id))
    } else {
      setSelectedReports([...selectedReports, id])
    }
  }

  const handleSelectAll = () => {
    if (selectedReports.length === apartmentReportsFiltered.length) {
      setSelectedReports([])
    } else {
      setSelectedReports(apartmentReportsFiltered.map((report) => report.id))
    }
  }

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      // Aqui você implementaria a chamada real à API para exclusão em massa
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulação de chamada à API

      toast({
        title: "Exclusão concluída",
        description: `${selectedReports.length} relatórios foram excluídos com sucesso.`,
      })

      refetch()
      setSelectedReports([])
    } catch (error) {
      console.error("Erro ao excluir relatórios:", error)
      toast({
        variant: "destructive",
        title: "Erro na exclusão",
        description: "Não foi possível excluir os relatórios selecionados.",
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)    }
  }
  const handleExport = async () => {
    if (isExporting) return // Previne múltiplas execuções simultâneas
    
    setIsExporting(true)
    try {
      let dataToExport

      if (selectedReports.length > 0) {
        // Exportar selecionados - usar dados da página atual
        dataToExport = apartmentReportsFiltered.filter((report) => selectedReports.includes(report.id))
      } else {
        // Exportar todos - fazer nova consulta sem paginação
        toast({
          title: "Preparando exportação",
          description: "Buscando todos os dados para exportação...",
        })

        try {
          const allReportsResponse = await getApartmentReports({
            withApartment: true,
            withMeters: true, // Incluir medidores para ter mais informações
            complexId,
            blockId,
            search,
            withMetersCount: true,
            fromDate: dateRange?.from,
            toDate: dateRange?.to,
            take: 50000, // Limite alto suficiente para a maioria dos casos
            skip: 0,
            orderBy: 'apartment.name',
            orderByDirection: 'asc',
            utilityType: utilityType === 'all' ? undefined : utilityType,
          })
          
          dataToExport = allReportsResponse.list
        } catch (error) {
          console.error('Erro ao buscar dados para exportação:', error)
          toast({
            variant: "destructive",
            title: "Erro na exportação",
            description: "Não foi possível buscar os dados para exportação.",
          })
          return
        }
      }

      if (dataToExport.length === 0) {
        toast({
          title: "Nenhum dado para exportar",
          description: "Não há dados disponíveis para exportação.",
        })
        return
      }      // Preparar dados para exportação seguindo o formato da importação
      const exportData = dataToExport.map((report) => {
        // Converter mês de número para nome (formato esperado na importação)
        const monthNames = {
          '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
          '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
          '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
        }
        const monthName = monthNames[report.monthRef as keyof typeof monthNames] || report.monthRef
        
        return {
          'condominio': report.apartment.block?.complex?.socialName || 'Condomínio', // Fallback se não disponível
          'mes_ref': monthName,
          'bloco': report.apartment.block?.name || 'Bloco', // Fallback se não disponível
          'apartamento': report.apartment.name,
          'consumo_agua_m3': report.consumption || 0,
          'valor_consumo_agua': report.consumptionCost || 0,
          'valor_esgoto': report.sewageCost || 0,
          'consumo_pipa_m3': report.kiteCarConsumption || 0,
          'custo_pipa': report.kiteCarCost || 0,
          'rateio_agua': report.partial || 0,
          'consumo_total_agua_m3': report.totalConsumption || 0,
          'valor_total_agua_unidade': report.totalUnit || 0,
          'consumo_gas_m3': report.consumptionGasValue || 0,
          'valor_consumo_gas': report.totalGasValue || 0,
        }
      })

      // Criar workbook
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)
      
      // Adicionar worksheet ao workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Relatórios de Apartamentos')
      
      // Gerar nome do arquivo
      const fileName = `relatorios_apartamentos_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Fazer download
      XLSX.writeFile(wb, fileName)

      toast({
        title: "Exportação concluída",
        description: `${dataToExport.length} relatórios foram exportados com sucesso.`,
      })
    } catch (error) {
      console.error('Erro na exportação:', error)
      toast({
        variant: "destructive",
        title: "Erro na exportação",        description: "Não foi possível exportar os dados.",
      })
    } finally {
      setIsExporting(false)
    }
  }  // Componentes de ação em massa
  const BulkActions = (
    <div className="flex flex-wrap gap-2 mb-4">
      {canDeleteReports && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedReports.length > 0 && setShowDeleteDialog(true)}
          disabled={selectedReports.length === 0}
          className="flex items-center"
        >
          <Trash className="h-4 w-4 mr-2" />
          Excluir Selecionados
        </Button>
      )}<Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        className="flex items-center"
      >
        <Download className="h-4 w-4 mr-2" />
        {isExporting 
          ? 'Exportando...' 
          : selectedReports.length > 0 
            ? 'Exportar Selecionados' 
            : 'Exportar Todos'
        }
      </Button>
    </div>
  )

  // Componente de paginação
  const PaginationComponent = () => {
    if (totalPages <= 1) return null

    const getVisiblePages = () => {
      const delta = 2
      const range = []
      const rangeWithDots = []

      for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i)
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, '...')
      } else {
        rangeWithDots.push(1)
      }

      rangeWithDots.push(...range)

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push('...', totalPages)
      } else {
        rangeWithDots.push(totalPages)
      }

      return rangeWithDots
    }

    return (
      <div className="flex items-center justify-between mt-4">
        {/* Controles à esquerda */}
        <div className="flex items-center gap-2">
          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {Math.min(skip + 1, totalCount)} a {Math.min(skip + pageSize, totalCount)} de {totalCount}
          </span>
        </div>

        {/* Paginação no centro */}
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            
            {getVisiblePages().map((page, index) => (
              <PaginationItem key={index}>
                {page === '...' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    onClick={() => handlePageChange(Number(page))}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <PaginationNext 
                onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {/* Espaço vazio à direita para manter o centro */}
        <div className="w-32"></div>
      </div>
    )
  }

  return (
    <>
      {viewType === "List" && BulkActions}      {viewType == "Cards" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apartmentReportsFiltered.map((report) => {
              const reportType = report.utilityType ?? report.DealershipReading?.type
              const isGas = reportType === "gas"

              const displayConsumption = isGas
                ? (report.consumptionGasValue ?? report.consumption ?? 0)
                : (report.consumption ?? 0)

              const displayTotal = isGas
                ? (report.totalGasValue ?? report.totalUnit ?? 0)
                : (report.totalUnit ?? 0)

              return (
                <ApartamentoCard
                  key={report.apartment.id}
                  apartamento={report.apartment}
                  apartmentReport={report}
                  onApartmentClick={handleMedidorClick}
                  totalUnit={displayTotal}
                  yearRef={report.yearRef}
                  monthRef={report.monthRef}
                  consumption={displayConsumption}
                />
              )
            })}
          </div>
          
          <PaginationComponent />
        </>
      )}{viewType == "List" && apartmentReportsFiltered && (
        <>
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        selectedReports.length === apartmentReportsFiltered.length && apartmentReportsFiltered.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  {/* <TableHead>Medidor</TableHead> */}
                  <TableHead>Consumo (m³)</TableHead>
                  <TableHead>Total (R$)</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apartmentReportsFiltered.map((report) => (
                  <ReportTableRow
                    key={report.id}
                    report={report}
                    isSelected={selectedReports.includes(report.id)}
                    onToggleSelect={() => handleToggleSelect(report.id)}
                    onViewDetails={() => handleMedidorClick(report.id)}
                    onReportDeleted={refetch}
                    canDelete={canDeleteReports}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          
          <PaginationComponent />
        </>
      )}

      {/* Diálogo de confirmação de exclusão em massa */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Você está prestes a excluir {selectedReports.length} relatórios. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
              <Trash className="mr-2 h-4 w-4" />
              {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de importação */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        complexId={complexId}
        blockId={blockId}
        onImportComplete={refetch}
      />
    </>
  )
}

function ApartamentoCard({
  apartamento,
  apartmentReport,
  totalUnit,
  yearRef,
  monthRef,
  consumption,
  onApartmentClick,
}: {
  apartamento: ApartmentFull
  apartmentReport: ApartmentConsumptionReport
  onApartmentClick: (apartmentReportId: string) => void
  totalUnit: number
  yearRef: string
  monthRef: string
  consumption: number
}) {
  const metersCount = apartamento?._count?.meters || 0
  const reportType = apartmentReport.utilityType
  return (
    <Card
      onClick={() => onApartmentClick(apartmentReport.id)}
      className="cursor-pointer hover:shadow-md transition-all duration-200 h-full overflow-hidden"
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <DoorClosed className="self-baseline pt-0.5" />
          <CardTitle className="text-lg">{apartamento.name}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {reportType === "water" ? (
            <Badge variant="secondary" className="gap-1">
              <Droplets className="h-3 w-3" /> Água
            </Badge>
          ) : reportType === "gas" ? (
            <Badge variant="secondary" className="gap-1">
              <Flame className="h-3 w-3" /> Gás
            </Badge>
          ) : null}
          <Badge variant="outline">
            {metersCount} {metersCount === 1 ? "Medidor" : "Medidores"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2 space-y-3">
        <div className="h-px w-full bg-border" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Consumo: <span className="font-medium">{consumption.toFixed(3).toString().replace(".", ",")} m³</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-medium">{monthRef + " " + yearRef}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-medium">R$ {totalUnit.toFixed(2).toString().replace(".", ",")}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton({ viewType }: { viewType: "Cards" | "List" }) {
  if (viewType == "Cards")
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            </CardHeader>
            <CardContent className="pt-2 space-y-3">
              <div className="h-px w-full bg-border" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  else
    return (
      <div className="w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Skeleton className="h-4 w-4" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="w-[100px]">
                <Skeleton className="h-4 w-16" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(6)].map((_, index) => (
              <TableRow key={index}>
                <TableCell className="w-12">
                  <Skeleton className="h-4 w-4" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="w-[100px]">
                  <div className="flex space-x-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
}
