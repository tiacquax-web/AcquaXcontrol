"use client"
import type { ApartmentWithConsumptionReport } from "@/types/apartment"

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { ApartmentReportRow } from "./apartment-report-row"
import { DealershipReadingFull } from "@/types/fullTypes"

interface ApartmentReportsTableProps {
  apartmentReports: ApartmentWithConsumptionReport[]
  dealershipReading: DealershipReadingFull
  calculationMethod: string
  triggerSaveAll: boolean
  onSaveCompleted?: () => void
}

export function ApartmentReportsTable({
  apartmentReports,
  dealershipReading,
  calculationMethod,
  triggerSaveAll,
  onSaveCompleted,
}: ApartmentReportsTableProps) {
  const dealershipReadingId = dealershipReading.id
  const [readingColumnsEnabled, setReadingColumnsEnabled] = useState(true)
  const toggleAllReadings = () => setReadingColumnsEnabled(v => !v)

  // Auto-enable reading columns if any report already has an associated lastReading
  useEffect(() => {
    if (!readingColumnsEnabled) {
      const hasAnyReading = apartmentReports?.some(r => !!r.lastReading || !!r.lastReadingId)
      if (hasAnyReading) setReadingColumnsEnabled(true)
    }
  }, [apartmentReports, readingColumnsEnabled])
  return (
    <div className="border rounded-md">
      <div className="flex items-center justify-end p-2 gap-2">
        <Button variant={readingColumnsEnabled ? 'default':'outline'} size="sm" onClick={toggleAllReadings} className="flex items-center gap-1">
          {readingColumnsEnabled ? <ToggleRight className="h-4 w-4"/> : <ToggleLeft className="h-4 w-4"/>}
          Leituras
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Apartamento</TableHead>
            {dealershipReading.type === 'gas' ? (
              <>
                <TableHead>Consumo Gás (m³)</TableHead>
                <TableHead>Valor Consumo Gás (R$)</TableHead>
              </>
            ) : (
              <>
                <TableHead>Consumo Água (m³)</TableHead>
                <TableHead>Valor Consumo Água (R$)</TableHead>
                <TableHead>Valor Esgoto (R$)</TableHead>
                <TableHead>Consumo Pipa (m³)</TableHead>
                <TableHead>Custo Pipa (R$)</TableHead>
                <TableHead>Rateio Água (R$)</TableHead>
                <TableHead>Consumo Total Água (m³)</TableHead>
                <TableHead>Valor Total Água Unidade (R$)</TableHead>
              </>
            )}
            {readingColumnsEnabled && (
              <>
                <TableHead>Próx. Leitura (YYYY-MM-DD)</TableHead>
                <TableHead>Foto (URL)</TableHead>
                <TableHead>Pré-Leitura?</TableHead>
                <TableHead>Leitura (m³)</TableHead>
                <TableHead>Data Leitura</TableHead>
                <TableHead>Chassi</TableHead>
              </>
            )}
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apartmentReports.map((report) => (
            <ApartmentReportRow
              key={report.id || report.apartment.id}
              report={report}
              dealershipReading={dealershipReading}
              calculationMethod={calculationMethod}
              triggerSave={triggerSaveAll}
              onSaveCompleted={onSaveCompleted}
              readingColumnsEnabled={readingColumnsEnabled}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
