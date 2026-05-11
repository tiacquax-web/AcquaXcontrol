// app/(main)/dealership-readings/[id]/filipeta/page.tsx
'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, AlertTriangle, LoaderCircle } from 'lucide-react';

import { useDealershipFilipetaData } from '@/hooks/useDealershipFilipetaData';
import { Button } from '@/components/ui/button';
import FilipetaGridReport from '@/components/dealership-reading/FilipetaGridReport';
import { usePermissionChecker } from '@/hooks/use-permission-checker';

const FilipetaPage = () => {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const description = searchParams.get('description');

  const order =
    (searchParams.get('order') as
      | 'block_apartment'
      | 'apartment_block'
      | null) || 'block_apartment';

  // FILTROS
  const [selectedBlock, setSelectedBlock] = React.useState('');
  const [selectedApartment, setSelectedApartment] = React.useState('');

  const { data, loading, error } = useDealershipFilipetaData({
    dealershipReadingId: id,
    order,
    block: selectedBlock,
    apartment: selectedApartment
  });

  const {
    hasPermission,
    loading: permissionsLoading
  } = usePermissionChecker();

  const handlePrint = () => {
    window.print();
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <LoaderCircle className="animate-spin h-8 w-8 mr-2" />
        Carregando permissões...
      </div>
    );
  }

  if (!hasPermission('generateFilipeta', 'do')) {
    return (
      <div className="flex items-center justify-center p-10 text-red-600">
        <AlertTriangle className="h-8 w-8 mr-2" />
        Acesso Negado: Você não tem permissão para gerar filipetas.
      </div>
    );
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-10">
          <LoaderCircle className="animate-spin h-8 w-8 mr-2" />
          Carregando dados da filipeta...
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center p-10 text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          Erro ao carregar dados: {error}
        </div>
      );
    }

    if (!data || data.list.length === 0) {
      return (
        <div className="flex items-center justify-center p-10">
          <AlertTriangle className="h-8 w-8 mr-2" />
          Nenhum relatório de apartamento encontrado para esta leitura.
        </div>
      );
    }

    return (
      <div id="filipeta-body" className="space-y-0">
        {data.list
          .filter((report: any) => {
            const blockMatch =
              !selectedBlock ||
              report.blockName === selectedBlock;

            const apartmentMatch =
              !selectedApartment ||
              report.apartmentNumber === selectedApartment;

            return blockMatch && apartmentMatch;
          })
          .map((report: any) => (
            <FilipetaGridReport
              key={report.id || report.apartmentId}
              report={report}
              dealershipReading={data.dealershipReading}
              description={description}
            />
          ))}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div
        id="print-header"
        className="flex justify-between items-center mb-4 no-print"
      >
        <h1 className="text-2xl font-bold">
          Filipeta de Leitura
        </h1>

        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {/* FILTROS */}
      <div className="flex gap-4 mb-6 no-print">

        {/* BLOCO */}
        <select
          value={selectedBlock}
          onChange={(e) => {
            setSelectedBlock(e.target.value);
            setSelectedApartment('');
          }}
          className="border rounded px-3 py-2 bg-white"
        >
          <option value="">Todos os blocos</option>

          {[...new Set(
            data?.list?.map((r: any) => r.blockName)
          )].map((block: any) => (
            <option key={block} value={block}>
              {block}
            </option>
          ))}
        </select>

        {/* APARTAMENTO */}
        <select
          value={selectedApartment}
          onChange={(e) =>
            setSelectedApartment(e.target.value)
          }
          className="border rounded px-3 py-2 bg-white"
        >
          <option value="">Todos apartamentos</option>

          {data?.list
            ?.filter((r: any) =>
              !selectedBlock ||
              r.blockName === selectedBlock
            )
            ?.map((r: any) => r.apartmentNumber)
            ?.filter(
              (
                value: any,
                index: number,
                self: any[]
              ) => self.indexOf(value) === index
            )
            ?.map((apartment: any) => (
              <option
                key={apartment}
                value={apartment}
              >
                {apartment}
              </option>
            ))}
        </select>

      </div>

      {renderContent()}
    </div>
  );
};

export default FilipetaPage;
