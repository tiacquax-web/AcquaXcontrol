'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, FileText, ChevronLeft, ChevronRight, Loader2, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import MeterReportCard from '@/components/MeterReportCard';
import { useMeterReport } from '@/hooks/useMeterReport';
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

export default function MeterReportPage() {
  const { context, loading: contextLoading } = useUserContext();

  // Selected month/year (default = current month)
  const [selectedMonthOption, setSelectedMonthOption] = useState(monthOptions[0]);

  // Selected complex (for non-residents or residents with multiple complexes)
  const [selectedComplexId, setSelectedComplexId] = useState<string | undefined>(undefined);
  const [selectedComplexObj, setSelectedComplexObj] = useState<any>(null);

  // Whether to fetch
  const [fetchEnabled, setFetchEnabled] = useState(false);

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

  // Auto-enable fetch when we have all required data
  useEffect(() => {
    if (!selectedMonthOption) return;
    if (isMorador) {
      // Need a complex selected
      if (selectedComplexId) setFetchEnabled(true);
      else setFetchEnabled(false);
    } else {
      // Admin: need a complex selected OR show all (but that could be very large)
      if (selectedComplexId) setFetchEnabled(true);
      else setFetchEnabled(false);
    }
  }, [selectedMonthOption, selectedComplexId, isMorador]);

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
    enabled: fetchEnabled,
  });

  const handleComplexSelect = (complex: any) => {
    if (complex?.id !== selectedComplexId) {
      setSelectedComplexId(complex?.id);
      setSelectedComplexObj(complex ?? null);
    }
  };

  const complexDisplayName = selectedComplexObj?.socialName || selectedComplexObj?.aliasName || '';

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Filipeta Medição</h1>
          <p className="text-sm text-gray-500">Resumo de leitura, consumo e valores por unidade</p>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {/* Month selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mês de Referência</label>
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
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Condomínio</label>
            {isMorador && userComplexes.length <= 1 ? (
              /* Morador with single complex: just show the name */
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-gray-50 text-sm text-gray-700 min-w-[200px]">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span>{complexDisplayName || 'Carregando...'}</span>
              </div>
            ) : isMorador && userComplexes.length > 1 ? (
              /* Morador with multiple complexes: show their complexes only */
              <div className="flex flex-col gap-1">
                <div className="flex gap-2 flex-wrap">
                  {userComplexes.map(cx => (
                    <Button
                      key={cx.id}
                      variant={selectedComplexId === cx.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedComplexId(cx.id);
                        setSelectedComplexObj(cx);
                      }}
                      className="text-sm"
                    >
                      <Building2 className="w-3.5 h-3.5 mr-1.5" />
                      {cx.socialName || cx.aliasName}
                    </Button>
                  ))}
                </div>
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
          <span className="ml-3 text-gray-500">Carregando filipetas...</span>
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
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mb-3 text-gray-300" />
              <p className="font-medium">Nenhuma filipeta encontrada</p>
              <p className="text-sm mt-1">
                Não há dados de leitura para{' '}
                <strong>{selectedMonthOption.label}</strong>
                {complexDisplayName ? ` em ${complexDisplayName}` : ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  <strong>{data.totalCount}</strong> unidade{data.totalCount !== 1 ? 's' : ''} encontrada{data.totalCount !== 1 ? 's' : ''}
                  {complexDisplayName ? ` em ${complexDisplayName}` : ''}
                  {' — '}<strong>{selectedMonthOption.label}</strong>
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.list.map(report => (
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
