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
  const order = (searchParams.get('order') as 'block_apartment' | 'apartment_block' | null) || 'block_apartment';
  const { data, loading, error } = useDealershipFilipetaData({ dealershipReadingId: id, order });
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker();

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
        {data.list.map(report => (
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
      <div id="print-header" className="flex justify-between items-center mb-4 no-print">
        <h1 className="text-2xl font-bold">Filipeta de Leitura</h1>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>
      {renderContent()}
    </div>
  );
};

export default FilipetaPage;
