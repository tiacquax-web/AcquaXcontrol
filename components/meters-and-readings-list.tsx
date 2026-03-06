"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, DoorClosed, Calendar, Gauge, CreditCard, Trash, Download, Upload, X, Loader2 } from "lucide-react"
import { useState } from "react"
import { Table, TableHeader, TableHead, TableBody, TableCell, TableRow } from "./ui/table"
import { Button } from "./ui/button"
import { ImportDialog } from "./import-dialog"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useReadings } from "@/hooks/useReadings"
import ReadingDetailsModal from "@/components/ReadingDetailsModal"

interface MetersAndReadingsListProps {
  complexId: string
  blockId?: string
  search: string
  dateRange?: {
    from: Date
    to: Date
  }
  selectedReports?: string[]
  setSelectedReports?: (ids: string[]) => void
  filters: any
  currentPage: number
  handlePageChange: (page: number) => void
  handleRowsPerPageChange: (value: string) => void
}

export default function MetersAndReadingsList({
  complexId,
  blockId,
  search,
  dateRange,
  filters,
  currentPage,
  handlePageChange,
  handleRowsPerPageChange,
}: Omit<MetersAndReadingsListProps, 'viewType'>) {

  const safeBlockId = blockId || '';

  const { readings, totalCount: readingsTotalCount, loading: readingsLoading, error: readingsError, refetch } = useReadings({
    companyId: filters.company?.id,
    complexId,
    blockId: safeBlockId,
    meterId: filters.meter?.id,
    apartmentId: filters.apartment?.id,
    isPreReading: filters.isPreReading,
    withMeter: true,
    withApartment: true,
    fromDate: dateRange?.from,
    toDate: dateRange?.to,
    take: filters.take,
    skip: filters.skip,
  })

  console.warn("consultando com filtros:", {
    companyId: filters.company?.id,
    complexId,
    blockId: safeBlockId,
    meterId: filters.meter?.id,
    apartmentId: filters.apartment?.id,
    isPreReading: filters.isPreReading,
    withMeter: true,
    fromDate: dateRange?.from,
    toDate: dateRange?.to,
    take: filters.take,
    skip: filters.skip,
  });

  // Estados para diálogos
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [selectedReading, setSelectedReading] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (readingsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{"Oops, não conseguimos fazer a busca. Tente de novo"}</AlertDescription>
      </Alert>
    )
  }


  if (!readingsLoading && readings.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12">
        <span className="text-muted-foreground text-center text-base">
          Nenhum relatório encontrado para o filtro aplicado. Verifique as opções ou solicite permissão ao suporte.
        </span>
      </div>
    )
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Leituras
            {readingsLoading && <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medidor</TableHead>
                <TableHead>Apartamento</TableHead>
                <TableHead>Leitura</TableHead>
                <TableHead>Mês</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Próx. Leitura</TableHead>
                <TableHead>Pré-leitura</TableHead>
                <TableHead>Foto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readings.map((reading) => (
                <TableRow key={reading.id}>
                  <TableCell>{reading.meter?.register || '-'}</TableCell>
                  <TableCell>{reading.meter?.apartment?.name || '-'}</TableCell>
                  <TableCell>{reading.reading ?? '-'}</TableCell>
                  <TableCell>{reading.monthRef || '-'}</TableCell>
                  <TableCell>{reading.yearRef || '-'}</TableCell>
                  <TableCell>{reading.readAt ? new Date(reading.readAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>{reading.nextReadingDate || '-'}</TableCell>
                  <TableCell>{reading.isPreReading ? 'Sim' : 'Não'}</TableCell>
                  <TableCell>
                    {reading.urlCover ? (
                      <Button variant="outline" size="sm" onClick={() => { setSelectedReading(reading); setModalOpen(true); }}>
                        Ver
                      </Button>
                    ) : '-' }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Paginação */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mt-4 gap-2">
            {/* Select de take */}
            <div className="flex items-center">
              <Select value={filters.take.toString()} onValueChange={handleRowsPerPageChange}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Texto X de Y */}
            <div className="flex items-center text-sm text-muted-foreground">
              {readings.length} de {readingsTotalCount}
            </div>
            {/* Paginação */}
            <div className="flex-1 flex md:justify-end justify-center w-full">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      className="px-2"
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      aria-disabled={currentPage === 1}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.ceil(readingsTotalCount / filters.take) }, (_, i) => i + 1)
                    .slice(Math.max(0, currentPage - 3), currentPage + 2)
                    .map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink isActive={page === currentPage} onClick={() => handlePageChange(page)}>{page}</PaginationLink>
                      </PaginationItem>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      className="px-2"
                      onClick={() => handlePageChange(Math.min(Math.ceil(readingsTotalCount / filters.take), currentPage + 1))}
                      aria-disabled={currentPage === Math.ceil(readingsTotalCount / filters.take)}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </CardContent>
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          complexId={complexId}
          blockId={safeBlockId}
          onImportComplete={refetch}
        />
      </Card>
      <ReadingDetailsModal open={modalOpen} onOpenChange={setModalOpen} reading={selectedReading} />
    </div>
  )
}
