// app/(main)/dealership-readings/[id]/filipeta/page.tsx
'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, AlertTriangle, LoaderCircle, Building2, Building, DoorClosed } from 'lucide-react';

import { useDealershipFilipetaData } from '@/hooks/useDealershipFilipetaData';
import { Button } from '@/components/ui/button';
import FilipetaGridReport from '@/components/dealership-reading/FilipetaGridReport';
import { usePermissionChecker } from '@/hooks/use-permission-checker';
import { Label } from '@/components/ui/label';
import SelectComplex from '@/components/ComboboxComplex';
import SelectBlock from '@/components/ComboboxBlock';
import SelectApartment from '@/components/ComboboxApartment';
import { motion } from 'framer-motion';

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

  // FILTROS SEPARADOS
  const [selectedComplex, setSelectedComplex] = React.useState<any>(undefined);
  const [selectedBlock, setSelectedBlock] = React.useState<any>(undefined);
  const [selectedApartment, setSelectedApartment] = React.useState<any>(undefined);

  const { data, loading, error } = useDealershipFilipetaData({
    dealershipReadingId: id,
    order,
    block: selectedBlock?.name,
    apartment: selectedApartment?.name,
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
            const complexMatch =
              !selectedComplex ||
              report.blockName === selectedBlock?.name ||
              report.apartmentNumber === selectedApartment?.name;

            const blockMatch =
              !selectedBlock ||
              report.blockName === selectedBlock.name;

            const apartmentMatch =
              !selectedApartment ||
              report.apartmentNumber === selectedApartment.name;

            return complexMatch && blockMatch && apartmentMatch;
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
      <motion.div
        className="flex flex-col sm:flex-row gap-4 mb-6 no-print"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* CONDOMÍNIO */}
        <div className="relative flex-1">
          <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
            <Building2 className="h-4 w-4" />
            Condomínio
          </Label>
          <SelectComplex
            complex={selectedComplex}
            companyId={undefined}
            autoSelectSingle={false}
            setSelectedComplex={(complex) => {
              setSelectedComplex(complex);
              setSelectedBlock(undefined);
              setSelectedApartment(undefined);
            }}
          />
        </div>

        {/* BLOCO */}
        <div className="relative flex-1">
          <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
            <Building className="h-4 w-4" />
            Bloco
          </Label>
          <SelectBlock
            block={selectedBlock}
            complexId={selectedComplex?.id}
            setSelectedBlock={(block) => {
              setSelectedBlock(block);
              setSelectedApartment(undefined);
            }}
          />
        </div>

        {/* APARTAMENTO */}
        <div className="relative flex-1">
          <Label className="flex items-center gap-1.5 mb-1.5 ml-0.5">
            <DoorClosed className="h-4 w-4" />
            Apartamento
          </Label>
          <SelectApartment
            apartment={selectedApartment}
            blockId={selectedBlock?.id}
            setSelectedApartment={setSelectedApartment}
          />
        </div>
      </motion.div>

      {renderContent()}
    </div>
  );
};

export default FilipetaPage;

