// app/(main)/dealership-readings/[id]/filipeta/page.tsx
'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, AlertTriangle, LoaderCircle, Search, X } from 'lucide-react';

import { useDealershipFilipetaData } from '@/hooks/useDealershipFilipetaData';
import { Button } from '@/components/ui/button';
import FilipetaGridReport from '@/components/dealership-reading/FilipetaGridReport';
import { usePermissionChecker } from '@/hooks/use-permission-checker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FilipetaPage = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const description = searchParams.get('description');
  const order = (searchParams.get('order') as 'block_apartment' | 'apartment_block' | null) || 'block_apartment';
  const [searchText, setSearchText] = React.useState('');
  const [selectedBlockId, setSelectedBlockId] = React.useState('all');
  const [selectedApartmentId, setSelectedApartmentId] = React.useState('all');
  const { data, loading, error } = useDealershipFilipetaData({ dealershipReadingId: id, order });
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker();

  const blockOptions = React.useMemo(() => {
    if (!data?.list) return [];

    const byId = new Map<string, string>();
    data.list.forEach((report) => {
      const blockId = report.apartment?.block?.id;
      const blockName = report.apartment?.block?.name;
      if (blockId && blockName && !byId.has(blockId)) {
        byId.set(blockId, blockName);
      }
    });

    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [data?.list]);

  const apartmentOptions = React.useMemo(() => {
    if (!data?.list) return [];

    const byId = new Map<string, { id: string; name: string; blockName: string; blockId: string }>();
    data.list.forEach((report) => {
      const apartmentId = report.apartment?.id;
      const apartmentName = report.apartment?.name;
      const blockName = report.apartment?.block?.name || '';
      const blockId = report.apartment?.block?.id || '';
      if (!apartmentId || !apartmentName) return;
      if (selectedBlockId !== 'all' && blockId !== selectedBlockId) return;
      if (!byId.has(apartmentId)) {
        byId.set(apartmentId, { id: apartmentId, name: apartmentName, blockName, blockId });
      }
    });

    return Array.from(byId.values()).sort((a, b) => {
      const blockCmp = a.blockName.localeCompare(b.blockName, 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (blockCmp !== 0) return blockCmp;
      return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });
  }, [data?.list, selectedBlockId]);

  React.useEffect(() => {
    if (selectedApartmentId === 'all') return;
    const stillExists = apartmentOptions.some((apartment) => apartment.id === selectedApartmentId);
    if (!stillExists) {
      setSelectedApartmentId('all');
    }
  }, [apartmentOptions, selectedApartmentId]);

  const filteredReports = React.useMemo(() => {
    if (!data?.list) return [];

    const normalizedSearch = searchText.trim().toLowerCase();

    return data.list.filter((report) => {
      const blockId = report.apartment?.block?.id || '';
      const apartmentId = report.apartment?.id || '';
      const blockName = report.apartment?.block?.name || '';
      const apartmentName = report.apartment?.name || '';

      if (selectedBlockId !== 'all' && blockId !== selectedBlockId) return false;
      if (selectedApartmentId !== 'all' && apartmentId !== selectedApartmentId) return false;
      if (!normalizedSearch) return true;

      return (
        blockName.toLowerCase().includes(normalizedSearch) ||
        apartmentName.toLowerCase().includes(normalizedSearch) ||
        `bloco ${blockName}`.toLowerCase().includes(normalizedSearch) ||
        `apto ${apartmentName}`.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [data?.list, searchText, selectedBlockId, selectedApartmentId]);

  const hasActiveFilters =
    !!searchText.trim() || selectedBlockId !== 'all' || selectedApartmentId !== 'all';

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

    if (!data) {
      return (
        <div className="flex items-center justify-center p-10">
          <AlertTriangle className="h-8 w-8 mr-2" />
          Nenhum relatório de apartamento encontrado para esta leitura.
        </div>
      );
    }

    if (filteredReports.length === 0) {
      return (
        <div className="flex items-center justify-center p-10">
          <AlertTriangle className="h-8 w-8 mr-2" />
          {hasActiveFilters
            ? 'Nenhuma unidade encontrada com esse filtro.'
            : 'Nenhum relatório de apartamento encontrado para esta leitura.'}
        </div>
      );
    }

    return (
      <div id="filipeta-body" className="space-y-0">
        {filteredReports.map(report => (
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
      <div id="print-header" className="flex flex-col gap-3 mb-4 no-print">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Filipeta de Leitura</h1>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filtrar por bloco ou apartamento..."
            className="pl-9 pr-9 bg-white"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <Select
            value={selectedBlockId}
            onValueChange={(value) => {
              setSelectedBlockId(value);
              setSelectedApartmentId('all');
            }}
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Filtrar por bloco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os blocos</SelectItem>
              {blockOptions.map((block) => (
                <SelectItem key={block.id} value={block.id}>
                  Bloco {block.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedApartmentId} onValueChange={setSelectedApartmentId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Filtrar por unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              {apartmentOptions.map((apartment) => (
                <SelectItem key={apartment.id} value={apartment.id}>
                  {`Bloco ${apartment.blockName} • Unidade ${apartment.name}`}
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
