'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, FileText, Loader2, AlertCircle, Info, Search, X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import MeterReportCard from '@/components/MeterReportCard';
import { useMeterReport, MeterReportItem } from '@/hooks/useMeterReport';
import { useUserContext } from '@/hooks/useUserContext';
import SelectComplex from '@/components/ComboboxComplex';

// Build list of months: current month backwards 24 months
function buildMonthOptions() {
  const options = [];
  for (let i = 0; i < 24; i++) {
    const d = subMonths(new Date(), i);
    options.push({
      value: `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
      label: format(d, 'MMMM / yyyy', { locale: ptBR }),
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear()),
    });
  }
  return options;
}

const monthOptions = buildMonthOptions();
const ALL_FILTER_VALUE = '__all__';

type ComplexSelection = {
  id?: string;
  socialName?: string;
  aliasName?: string | null;
};

type DealershipReadingOption = {
  id: string;
  label: string;
};

export default function MeterReportPage() {
  const { context, loading: contextLoading } = useUserContext();

  // Selected month/year (default = current month)
  const [selectedMonthOption, setSelectedMonthOption] = useState(monthOptions[0]);

  // Selected complex (for non-residents or residents with multiple complexes)
  const [selectedComplexId, setSelectedComplexId] = useState<string | undefined>(undefined);
  const [selectedComplexObj, setSelectedComplexObj] = useState<ComplexSelection | null>(null);

  // Search text for filtering by apartment/block (admin/sindico only)
  const [searchText, setSearchText] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>(ALL_FILTER_VALUE);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string>(ALL_FILTER_VALUE);
  const [selectedDealershipReadingId, setSelectedDealershipReadingId] = useState<string>(ALL_FILTER_VALUE);

  // Resident helpers
  const isMorador = useMemo(() => {
    if (!context) return false;
    return !context.isSystem && context.companyIds.length === 0 && context.complexes.length === 0 && context.blocks.length === 0 && context.apartments.length > 0;
  }, [context]);

  // Unique complexes accessible by this user (via their apartments)
  const userComplexes = useMemo(() => {
    if (!context) return [];
    const map = new Map<string, { id: string; socialName: string; aliasName?: string | null }>();
    context.apartments.forEach(apt => {
      const cx = apt.block?.complex;
      if (cx?.id && !map.has(cx.id)) {
        map.set(cx.id, { id: cx.id, socialName: cx.socialName, aliasName: cx.aliasName });
      }
    });
    context.complexes.forEach(cx => {
      if (!map.has(cx.id)) map.set(cx.id, cx);
    });
    return Array.from(map.values());
  }, [context]);

  // Apartments for the selected complex (for moradores)
  const userApartmentsInComplex = useMemo(() => {
    if (!context || !selectedComplexId) return [];
    return context.apartments.filter(a => a.block?.complex?.id === selectedComplexId);
  }, [context, selectedComplexId]);

  // Auto-select complex when morador has only one
  useEffect(() => {
    if (!contextLoading && isMorador && userComplexes.length === 1 && !selectedComplexId) {
      setSelectedComplexId(userComplexes[0].id);
      setSelectedComplexObj(userComplexes[0]);
    }
  }, [contextLoading, isMorador, userComplexes, selectedComplexId]);

  // For moradores with single apt in complex, pass apartment_id directly
  const apartmentIdFilter = useMemo(() => {
    if (!isMorador) return undefined;
    if (userApartmentsInComplex.length === 1) return userApartmentsInComplex[0].id;
    return undefined;
  }, [isMorador, userApartmentsInComplex]);

  const { data, loading, error } = useMeterReport({
    month: selectedMonthOption.month,
    year: selectedMonthOption.year,
    complexId: selectedComplexId,
    apartmentId: apartmentIdFilter,
    enabled: !!selectedComplexId && !!selectedMonthOption?.month && !!selectedMonthOption?.year,
  });

  const blockOptions = useMemo(() => {
    if (!data?.list?.length) return [];
    const map = new Map<string, string>();
    data.list.forEach(item => {
      const block = item.apartment?.block;
      if (block?.id && block.name && !map.has(block.id)) map.set(block.id, block.name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [data]);

  const apartmentOptions = useMemo(() => {
    if (!data?.list?.length) return [];
    const map = new Map<string, { id: string; name: string; blockName: string; blockId: string }>();
    data.list.forEach(item => {
      const apt = item.apartment;
      const block = apt?.block;
      if (!apt?.id || !apt.name || !block?.id) return;
      if (selectedBlockId !== ALL_FILTER_VALUE && block.id !== selectedBlockId) return;
      if (!map.has(apt.id)) {
        map.set(apt.id, { id: apt.id, name: apt.name, blockName: block.name ?? '', blockId: block.id });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const byBlock = a.blockName.localeCompare(b.blockName, undefined, { numeric: true, sensitivity: 'base' });
      if (byBlock !== 0) return byBlock;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data, selectedBlockId]);

  const dealershipReadingOptions = useMemo(() => {
    if (!data?.dealershipReadings?.length) return [];
    return (data.dealershipReadings as Array<{
      id: string;
      monthRef: string | number;
      yearRef: string | number;
      dealership?: { name?: string | null } | null;
    }>)
      .map((reading): DealershipReadingOption => ({
        id: reading.id,
        label: reading.dealership?.name
          ? `${reading.dealership.name} — ${String(reading.monthRef).padStart(2, '0')}/${reading.yearRef}`
          : `Boleto ${String(reading.monthRef).padStart(2, '0')}/${reading.yearRef}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [data]);

  useEffect(() => {
    setSearchText('');
    setSelectedBlockId(ALL_FILTER_VALUE);
    setSelectedApartmentId(ALL_FILTER_VALUE);
    setSelectedDealershipReadingId(ALL_FILTER_VALUE);
  }, [selectedComplexId, selectedMonthOption.value]);

  useEffect(() => {
    if (selectedApartmentId === ALL_FILTER_VALUE) return;
    const stillExists = apartmentOptions.some(apt => apt.id === selectedApartmentId);
    if (!stillExists) setSelectedApartmentId(ALL_FILTER_VALUE);
  }, [apartmentOptions, selectedApartmentId]);

  // Client-side filter by search text (block name or apartment name)
  const filteredList = useMemo((): MeterReportItem[] => {
    if (!data?.list) return [];
    const q = searchText.trim().toLowerCase();
    return data.list.filter(r => {
      if (selectedBlockId !== ALL_FILTER_VALUE && r.apartment?.block?.id !== selectedBlockId) return false;
      if (selectedApartmentId !== ALL_FILTER_VALUE && r.apartmentId !== selectedApartmentId) return false;
      if (selectedDealershipReadingId !== ALL_FILTER_VALUE && r.dealershipReadingId !== selectedDealershipReadingId) return false;
      if (!q) return true;
      const aptName = (r.apartment?.name ?? '').toLowerCase();
      const blockName = (r.apartment?.block?.name ?? '').toLowerCase();
      return aptName.includes(q) || blockName.includes(q) || `bloco ${blockName}`.includes(q) || `apto ${aptName}`.includes(q);
    });
  }, [data, searchText, selectedBlockId, selectedApartmentId, selectedDealershipReadingId]);

  const handleComplexSelect = (complex: ComplexSelection | null | undefined) => {
    if (complex?.id !== selectedComplexId) {
      setSelectedComplexId(complex?.id);
      setSelectedComplexObj(complex ?? null);
      setSearchText('');
      setSelectedBlockId(ALL_FILTER_VALUE);
      setSelectedApartmentId(ALL_FILTER_VALUE);
      setSelectedDealershipReadingId(ALL_FILTER_VALUE);
    }
  };

  const complexDisplayName = selectedComplexObj?.socialName || selectedComplexObj?.aliasName || '';

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Filipeta Medição</h1>
          <p className="text-sm text-muted-foreground">Resumo de leitura, consumo e valores por unidade</p>
        </div>
      </div>

      <Separator />

      {/* Filters row */}
      <div className="meter-report-filters flex flex-col sm:flex-row gap-3 flex-wrap items-end">
        {/* Month selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês de Referência</label>
          <Select
            value={selectedMonthOption.value}
            onValueChange={val => {
              const opt = monthOptions.find(o => o.value === val);
              if (opt) setSelectedMonthOption(opt);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Complex selector */}
        {!contextLoading && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Condomínio</label>
            {isMorador && userComplexes.length <= 1 ? (
              /* Morador with single complex: just show the name */
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted text-sm min-w-[200px]">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span>{complexDisplayName || 'Carregando...'}</span>
              </div>
            ) : isMorador && userComplexes.length > 1 ? (
              /* Morador with multiple complexes: show their complexes only */
              <div className="flex gap-2 flex-wrap">
                {userComplexes.map(cx => (
                  <Button
                    key={cx.id}
                    variant={selectedComplexId === cx.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setSelectedComplexId(cx.id); setSelectedComplexObj(cx); setSearchText(''); }}
                  >
                    <Building2 className="w-3.5 h-3.5 mr-1.5" />
                    {cx.socialName || cx.aliasName}
                  </Button>
                ))}
              </div>
            ) : (
              /* Admin/síndico: full complex selector */
              <SelectComplex
                setSelectedComplex={handleComplexSelect}
                complex={selectedComplexObj}
                autoSelectSingle={false}
              />
            )}
          </div>
        )}

        {/* Search box — only shown for non-moradores when a complex is selected and data is loaded */}
        {!isMorador && selectedComplexId && data && data.list.length > 0 && (
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar unidade</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Bloco ou apartamento..."
                className="pl-9 pr-9"
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
          </div>
        )}

        {!isMorador && selectedComplexId && data && data.list.length > 0 && (
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bloco</label>
            <Select value={selectedBlockId} onValueChange={setSelectedBlockId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os blocos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>Todos os blocos</SelectItem>
                {blockOptions.map(block => (
                  <SelectItem key={block.id} value={block.id}>
                    Bloco {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isMorador && selectedComplexId && data && data.list.length > 0 && (
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unidade</label>
            <Select value={selectedApartmentId} onValueChange={setSelectedApartmentId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>Todas as unidades</SelectItem>
                {apartmentOptions.map(apt => (
                  <SelectItem key={apt.id} value={apt.id}>
                    Bl. {apt.blockName} / Ap. {apt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isMorador && selectedComplexId && data && data.list.length > 0 && (
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Boleto</label>
            <Select value={selectedDealershipReadingId} onValueChange={setSelectedDealershipReadingId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todos os boletos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>Todos os boletos</SelectItem>
                {dealershipReadingOptions.map(reading => (
                  <SelectItem key={reading.id} value={reading.id}>
                    {reading.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Prompt to select complex */}
      {!selectedComplexId && !contextLoading && (
        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription>
            Selecione um condomínio para visualizar as filipetas do mês.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Carregando filipetas...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {!loading && !error && data && (
        <>
          {data.list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma filipeta encontrada</p>
              <p className="text-sm mt-1">
                Não há dados de leitura para{' '}
                <strong>{selectedMonthOption.label}</strong>
                {complexDisplayName ? ` em ${complexDisplayName}` : ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  {searchText || selectedBlockId !== ALL_FILTER_VALUE || selectedApartmentId !== ALL_FILTER_VALUE || selectedDealershipReadingId !== ALL_FILTER_VALUE ? (
                    <>
                      <strong>{filteredList.length}</strong> de <strong>{data.totalCount}</strong> unidade{data.totalCount !== 1 ? 's' : ''}
                      {complexDisplayName ? ` em ${complexDisplayName}` : ''}
                      {' — '}<strong>{selectedMonthOption.label}</strong>
                      {searchText ? ` ` : ''}
                      {searchText && <span className="text-blue-500">(busca: &quot;{searchText}&quot;)</span>}
                    </>
                  ) : (
                    <>
                      <strong>{data.totalCount}</strong> unidade{data.totalCount !== 1 ? 's' : ''} encontrada{data.totalCount !== 1 ? 's' : ''}
                      {complexDisplayName ? ` em ${complexDisplayName}` : ''}
                      {' — '}<strong>{selectedMonthOption.label}</strong>
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {searchText && filteredList.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Nenhuma unidade corresponde à busca.</p>
                  )}
                  {/* Botão imprimir — oculto na impressão */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="meter-report-print-bar flex items-center gap-2"
                    onClick={() => window.print()}
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir filipetas
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredList.map(report => (
                  <MeterReportCard key={report.id} report={report} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
