"use client"

import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { useToast } from "./ui/use-toast";
import * as XLSX from "xlsx";
import { useState } from "react";
import { useReadings } from '@/hooks/useReadings';

interface ExportReadingsButtonProps {
  filters: any;
  complexId: string;
  blockId?: string;
}

export function ExportReadingsButton({ filters, complexId, blockId }: ExportReadingsButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Hook para buscar todas as leituras filtradas (take: 10000, skip: 0)
  const {
    readings: allReadings,
    loading: loadingReadings,
    error: errorReadings
  } = useReadings({
    companyId: filters.company?.id,
    complexId: complexId,
    blockId: blockId,
    meterId: filters.meter?.id,
    apartmentId: filters.apartment?.id,
    isPreReading: filters.isPreReading,
    withMeter: true,
    take: 10000,
    skip: 0,
  });

  const handleExportXLSX = async () => {
    setLoading(true);
    try {
      if (loadingReadings) return;
      if (!allReadings || allReadings.length === 0) {
        toast({ title: 'Nenhuma leitura encontrada para exportar.' });
        setLoading(false);
        return;
      }
      const worksheetData = [
        ['chassi', 'leitura', 'mes_ref', 'ano_ref', 'data_leitura', 'prox_leitura', 'foto', 'pre_leitura'],
        ...allReadings.map((reading: any) => [
          reading.meter?.register || '',
          reading.reading != null ? reading.reading : '',
          reading.monthRef || '',
          reading.yearRef || '',
          reading.readAt ? new Date(reading.readAt).toLocaleDateString() : '',
          reading.nextReadingDate || '',
          reading.urlCover || '',
          reading.isPreReading ? 'Sim' : 'Não',
        ])
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leituras');
      const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leituras.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Erro ao exportar leituras.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExportXLSX}
      className="flex items-center mb-4"
      disabled={loading || loadingReadings}
    >
      <Download className="h-4 w-4 mr-2" />
      {loading ? 'Exportando...' : loadingReadings ? 'Carregando...' : 'Exportar Planilha'}
    </Button>
  );
}
