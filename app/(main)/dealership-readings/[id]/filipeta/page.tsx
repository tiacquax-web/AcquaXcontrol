// app/(main)/dealership-readings/[id]/filipeta/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, AlertTriangle, LoaderCircle, X, Search } from 'lucide-react';

import {
  useDealershipFilipetaData,
  useDealershipReadingMeta,
} from '@/hooks/useDealershipFilipetaData';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import FilipetaGridReport from '@/components/dealership-reading/FilipetaGridReport';
import { usePermissionChecker } from '@/hooks/use-permission-checker';
import SelectApartment from '@/components/ComboboxApartment';
import BlocksCombobox from '@/components/ComboboxBlock';
import type { Block, Apartment } from '@prisma/client';

const PRINT_BATCH_SIZE = 20;

const FilipetaPage = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const description = searchParams.get('description');
  const order =
    (searchParams.get('order') as 'block_apartment' | 'apartment_block' | null) ||
    'block_apartment';

  // ── Filtros de bloco e apartamento ──────────────────────────────────────────
  const [filterBlock, setFilterBlock] = useState<Block | undefined>(undefined);
  const [filterApartment, setFilterApartment] = useState<Apartment | undefined>(undefined);

  const filterBlockId = filterBlock?.id;
  const filterAptId = filterApartment?.id;

  // ── Controle de fetch principal ──────────────────────────────────────────────
  // O fetch completo só dispara quando o usuário clica "Buscar Filipetas".
  // `fetchKey` é incrementado a cada busca para forçar re-fetch mesmo com
  // os mesmos filtros (permite "Buscar" novamente).
  const [fetchEnabled, setFetchEnabled] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // ── Pré-carga de metadados (apenas complexId) ────────────────────────────────
  // Chamada leve que retorna imediatamente com a leitura da concessionária
  // mas sem percorrer apartamentos — usada para alimentar o BlocksCombobox
  // antes mesmo do fetch principal disparar.
  const { meta, metaLoading } = useDealershipReadingMeta({ dealershipReadingId: id });
  const complexId = meta?.complexId ?? undefined;

  // ── Fetch principal de filipetas ─────────────────────────────────────────────
  const { data, loading, error } = useDealershipFilipetaData({
    dealershipReadingId: id,
    order,
    blockId: filterBlockId,
    apartmentId: filterAptId,
    enabled: fetchEnabled,
    fetchKey, // garante re-fetch ao clicar "Buscar" mesmo com filtros iguais
  });

  const { hasPermission, loading: permissionsLoading } = usePermissionChecker();
  const [printBatch, setPrintBatch] = useState<number | null>(null);

  const totalPrintBatches = data ? Math.ceil(data.list.length / PRINT_BATCH_SIZE) : 0;
  const reportsToRender = data && printBatch !== null
    ? data.list.slice(printBatch * PRINT_BATCH_SIZE, (printBatch + 1) * PRINT_BATCH_SIZE)
    : data?.list ?? [];

  // O Chrome mobile pode encerrar a aba quando window.print() tenta montar
  // centenas de páginas e imagens de uma única vez. Após o diálogo fechar,
  // avançamos para o próximo lote sem abrir outro diálogo automaticamente.
  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintBatch(current => {
        if (current === null || totalPrintBatches <= 1) return null;
        return current + 1 < totalPrintBatches ? current + 1 : null;
      });
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [totalPrintBatches]);

  const handlePrint = () => {
    if (!data || data.list.length === 0) return;

    if (data.list.length > PRINT_BATCH_SIZE && printBatch === null) {
      setPrintBatch(0);
      window.setTimeout(() => window.print(), 180);
      return;
    }

    window.print();
  };

  const hasFilters = !!(filterBlock || filterApartment);

  const clearFilters = () => {
    setPrintBatch(null);
    setFilterBlock(undefined);
    setFilterApartment(undefined);
  };

  const handleSearch = () => {
    setPrintBatch(null);
    setFetchEnabled(true);
    setFetchKey(k => k + 1);
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
    // Ainda não buscou — mostra prompt para o usuário clicar em Buscar
    if (!fetchEnabled) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground gap-3">
          <Search className="h-10 w-10 opacity-30" />
          <p className="font-medium">Selecione os filtros e clique em <strong>Buscar Filipetas</strong></p>
          <p className="text-sm">Você pode deixar os filtros em branco para carregar todas as unidades.</p>
        </div>
      );
    }

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
          Nenhum relatório de apartamento encontrado para esta leitura
          {hasFilters ? ' com os filtros selecionados' : ''}.
        </div>
      );
    }

    return (
      <div id="filipeta-body" className="space-y-0">
        {reportsToRender.map(report => (
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
    <div className="p-4 sm:p-6 bg-background min-h-screen">
      {/* Cabeçalho com título, filtros e botão imprimir */}
      <div id="print-header" className="no-print space-y-4 mb-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Filipeta de Leitura</h1>
          <div className="flex items-center gap-2">
            {printBatch !== null && totalPrintBatches > 1 && (
              <span className="text-xs text-muted-foreground text-right max-w-[220px]">
                Lote {printBatch + 1} de {totalPrintBatches}. Após fechar a impressão, clique novamente para o próximo lote.
              </span>
            )}
            <Button onClick={handlePrint} disabled={!data || data.list.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              {printBatch !== null && totalPrintBatches > 1
                ? `Imprimir lote ${printBatch + 1}/${totalPrintBatches}`
                : 'Imprimir'}
            </Button>
          </div>
        </div>

        {/* ── Filtros: Bloco + Apartamento + Botão Buscar ───────────────── */}
        <div className="border rounded-lg p-4 bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              {metaLoading ? 'Carregando condomínio...' : 'Filtrar filipetas por:'}
            </p>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bloco — disponível assim que o metadado carregar */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bloco</Label>
              <BlocksCombobox
                block={filterBlock as any}
                complexId={complexId}
                setSelectedBlock={b => {
                  setFilterBlock(b as Block | undefined);
                  setFilterApartment(undefined); // reset apt quando bloco muda
                }}
                disabled={metaLoading || !complexId}
              />
            </div>

            {/* Apartamento — habilitado só quando bloco selecionado */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Apartamento</Label>
              <SelectApartment
                blockId={filterBlockId}
                apartment={filterApartment}
                setSelectedApartment={apt => setFilterApartment(apt ?? undefined)}
                disabled={!filterBlockId}
              />
            </div>
          </div>

          {/* Filtros ativos + resumo de resultados */}
          {hasFilters && (
            <p className="text-xs text-muted-foreground">
              Filtros ativos:{' '}
              {[
                filterBlock?.name && `Bloco ${filterBlock.name}`,
                filterApartment?.name && `Ap. ${filterApartment.name}`,
              ]
                .filter(Boolean)
                .join(' › ')}
              {data && fetchEnabled
                ? ` — ${data.list.length} filipeta${data.list.length !== 1 ? 's' : ''}`
                : ''}
            </p>
          )}

          {/* Botão principal de busca */}
          <div className="flex justify-end pt-1">
            <Button onClick={handleSearch} disabled={loading || metaLoading} className="gap-2">
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Buscar Filipetas
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default FilipetaPage;
