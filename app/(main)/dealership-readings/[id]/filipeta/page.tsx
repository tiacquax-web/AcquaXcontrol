// app/(main)/dealership-readings/[id]/filipeta/page.tsx
'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, AlertTriangle, LoaderCircle } from 'lucide-react';

import { useDealershipFilipetaData } from '@/hooks/useDealershipFilipetaData';
import { Button } from '@/components/ui/button';
import FilipetaGridReport from '@/components/dealership-reading/FilipetaGridReport';
import { usePermissionChecker } from '@/hooks/use-permission-checker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

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
  const [selectedCondominium, setSelectedCondominium] = React.useState('');
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

  // Obter lista única de condomínios
  const getCondominiums = React.useMemo(() => {
    return [...new Set(data?.list?.map((r: any) => r.condominiumName) || [])];
  }, [data]);

  // Obter blocos filtrados por condomínio selecionado
  const getBlocks = React.useMemo(() => {
    if (!selectedCondominium || selectedCondominium === 'all') {
      return [...new Set(data?.list?.map((r: any) => r.blockName) || [])];
    }
    return [...new Set(
      data?.list
        ?.filter((r: any) => r.condominiumName === selectedCondominium)
        ?.map((r: any) => r.blockName) || []
    )];
  }, [data, selectedCondominium]);

  // Obter apartamentos filtrados por condomínio e bloco
  const getApartments = React.useMemo(() => {
    let filtered = data?.list || [];

    if (selectedCondominium && selectedCondominium !== 'all') {
      filtered = filtered.filter((r: any) => r.condominiumName === selectedCondominium);
    }

    if (selectedBlock && selectedBlock !== 'all') {
      filtered = filtered.filter((r: any) => r.blockName === selectedBlock);
    }

    return [...new Set(filtered.map((r: any) => r.apartmentNumber) || [])];
  }, [data, selectedCondominium, selectedBlock]);

  const handleCondominiumChange = (value: string) => {
    setSelectedCondominium(value);
    setSelectedBlock('');
    setSelectedApartment('');
  };

  const handleBlockChange = (value: string) => {
    setSelectedBlock(value);
    setSelectedApartment('');
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
            const condominiumMatch =
              !selectedCondominium || selectedCondominium === 'all' ||
              report.condominiumName === selectedCondominium;

            const blockMatch =
              !selectedBlock || selectedBlock === 'all' ||
              report.blockName === selectedBlock;

            const apartmentMatch =
              !selectedApartment || selectedApartment === 'all' ||
              report.apartmentNumber === selectedApartment;

            return condominiumMatch && blockMatch && apartmentMatch;
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 no-print">

        {/* CONDOMÍNIO */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Condomínio
          </label>

          <Select
            value={selectedCondominium}
            onValueChange={handleCondominiumChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Condomínio..." />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">
                Todos os condomínios
              </SelectItem>

              {getCondominiums.map((condominium: any) => (
                <SelectItem
                  key={condominium}
                  value={condominium}
                >
                  {condominium}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* BLOCO */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Bloco
          </label>

          <Select
            value={selectedBlock}
            onValueChange={handleBlockChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Bloco..." />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">
                Todos os blocos
              </SelectItem>

              {getBlocks.map((block: any) => (
                <SelectItem
                  key={block}
                  value={block}
                >
                  {block}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* APARTAMENTO */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Apartamento
          </label>

          <Select
            value={selectedApartment}
            onValueChange={setSelectedApartment}
          >
            <SelectTrigger>
              <SelectValue placeholder="Apartamento..." />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">
                Todos os apartamentos
              </SelectItem>

              {getApartments.map((apartment: any) => (
                <SelectItem
                  key={apartment}
                  value={apartment}
                >
                  {apartment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>

      {renderContent()}
    </div>
  );
};

export default FilipetaPage;
