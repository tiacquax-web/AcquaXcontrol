"use client";

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import SelectCompany from '@/components/ComboboxCompany';
import SelectComplex from '@/components/ComboboxComplex';
import SelectBlock from '@/components/ComboboxBlock';
import SelectApartment from '@/components/ComboboxApartment';
import SelectMeter from '@/components/ComboboxMeter';
import { Apartment, Block, Company, Complex, Meter } from '@prisma/client';
import { useUserContext } from '@/hooks/useUserContext';
import { motion } from "framer-motion"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Building, Building2, DoorClosed, GaugeCircle, Filter, ChevronRight, Upload, Search } from 'lucide-react';
import { useApartments } from '@/hooks/useApartments';
import { useRouter } from 'next/navigation';
import ComplexesList from '@/components/ComplexesList';
import BlocksList from '@/components/BlocksList';
import MetersAndReadingsList from '@/components/meters-and-readings-list';
import { ExportReadingsButton } from '@/components/ExportReadingsButton';
import ApartmentsList from '@/components/ApartmentsList';
import ReadingsGraph from '@/components/ReadingsGraph';
import { useReadings } from '@/hooks/useReadings';
import { useMeter } from '@/hooks/useMeters';
import { DateRangeSelector } from "@/components/date-range-selector"
import { ImportReadingsDialog } from '@/components/import-readings-dialog'
import { usePermissionsContext } from '../PermissionsContext';
import ReadingDetailsModal from '@/components/ReadingDetailsModal';
import { useToast } from '@/hooks/use-toast';

// Define a type for permissions array
interface UserPermission {
  action: string;
  entity: string;
}

export default function ReadingsPage() {
  // Espera-se que permissions já seja um array
  const { permissions, loading: loadingPermissions } = usePermissionsContext();
  // Helper to check permission
  function canCreateReading() {
    if (!permissions || !Array.isArray(permissions)) return false;
    return (permissions as UserPermission[]).some((p) => p.action === 'create' && p.entity === 'reading');
  }

  // Contexto do usuário (moradores têm contexto de apartamentos específicos)
  const { context: userContext, loading: loadingContext } = useUserContext();

  // Determina se o usuário é morador (não tem permissão de sistema e tem apartamentos vinculados)
  const isMorador = !loadingContext && userContext !== null && !userContext.isSystem && userContext.apartments.length > 0;
  // Único apartamento vinculado (morador com 1 unidade)
  const singleApartment = isMorador && userContext.apartments.length === 1 ? userContext.apartments[0] : null;

  const [viewType, setViewType] = useState<'Cards' | 'List'>("Cards")
  const [complexSearchText, setComplexSearchText] = useState("")
  const [filters, setFilters] = useState<{
    company: Company | undefined,
    complex: Complex | undefined,
    block: Block | undefined,
    apartment: Apartment | undefined,
    meter: Meter | undefined,
    isPreReading: boolean,
    take: number,
    skip: number,
  }>({
    company: undefined,
    complex: undefined,
    block: undefined,
    apartment: undefined,
    meter: undefined,
    isPreReading: false,
    take: 10,
    skip: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Auto-aplica filtros para morador com 1 apartamento
  useEffect(() => {
    if (singleApartment && !filters.apartment) {
      const block = singleApartment.block as any;
      const complex = block?.complex as any;
      setFilters((prev) => ({
        ...prev,
        complex: complex || undefined,
        block: block || undefined,
        apartment: singleApartment as any,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleApartment]);

  const maxRangeStart = new Date();
  maxRangeStart.setMonth(maxRangeStart.getMonth() - 3);

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: maxRangeStart,
    to: new Date(),
  });

  function handleOnDateRangeChange({ from, to }: { from: Date; to: Date }) {
    // Coloca no início do mês de `from` e no final do mês de `to`
    const startOfMonth = new Date(from.getFullYear(), from.getMonth(), 1);
    const endOfMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0); // Último dia do mês de `to`
    setDateRange({ from: startOfMonth, to: endOfMonth });
    setFilters((prev) => ({
      ...prev,
      skip: 0, // Reseta a paginação ao mudar o período
    }));
  }

  function handleSelectedComplex(complex: Complex | undefined) {
    setFilters((prev) => ({
      ...prev,
      complex,
      block: undefined,
      apartment: undefined,
      meter: undefined,
    }));
  }

  function handleSelectedBlock(block: Block | undefined) {
    setFilters((prev) => ({
      ...prev,
      block,
      apartment: undefined,
      meter: undefined,
    }));
  }

  function handleSelectedApartment(apartment: Apartment | undefined) {
    setFilters((prev) => ({
      ...prev,
      apartment,
      meter: undefined,
    }));
  }

  // Novo componente para renderizar gráficos dos medidores do apartamento selecionado
  function MedidorGraphs({ apartment, dateRange }: { apartment: Apartment, dateRange: { from: Date, to: Date } }) {
    const { readings, loading, error } = useReadings({
      apartmentId: apartment.id,
      withMeter: true,
      take: 500,
      fromDate: dateRange.from,
      toDate: dateRange.to,
    });
    const { meters: aptoMeters, loading: loadingMeters, error: errorMeters } = useMeter({
      apartmentId: apartment.id,
    });

    const { toast } = useToast();

    // Ao iniciar o componente, exibe um toast dando dica para clicar na leitura para ver detalhes
    useEffect(() => {
      setTimeout(() => {
        toast({
          title: "😉 Clique na leitura para ver detalhes",
          description: "Você pode clicar em qualquer leitura para ver mais informações.",
          duration: 5000,
        });
      }, 3000);
    }, [toast]);

    // Medidores que têm pelo menos uma leitura no período
    const metersWithReadings = readings.reduce((acc, reading) => {
      if (reading.meter && reading.meter.id && !acc.some(m => m.id === reading.meter!.id)) {
        acc.push(reading.meter);
      }
      return acc;
    }, [] as Meter[]);

    console.warn('Medidores com leituras:', metersWithReadings);

    // Medidores que NÃO têm leituras no período
    const metersWithoutReadings = (aptoMeters ?? []).filter(
      m => !metersWithReadings.some(mwr => mwr.id === m.id)
    );

    if (loading || loadingMeters) {
      return <Skeleton className="h-40 w-full" />;
    }

    if ((!metersWithReadings || !metersWithReadings.length) && (!metersWithoutReadings || !metersWithoutReadings.length)) {
      return <div className="text-center text-muted-foreground py-8">Nenhum medidor encontrado para este apartamento.</div>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {metersWithReadings.map((meter) => {
          const thisMeterReadings = readings.filter(reading => reading.meter?.id === meter.id);
          return <ReadingsGraph readings={thisMeterReadings} register={meter.register} meterId={meter.id} key={meter.id} detailsModalAvailable />
        })}
        {metersWithoutReadings.map((meter) => (
          <Card key={meter.id}>
            <CardHeader>
              <CardTitle>{meter.register}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Nenhuma leitura encontrada para este medidor no período selecionado.
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full p-6 flex flex-col md:flex-row gap-4">
      <div className="flex flex-col gap-4 w-full">

        {/* Header: Breadcrumb para Cards, Card de filtros para Lista */}
        {viewType === "Cards" ? (
          <div className="mb-2">
            <Button
              variant="link"
              size="sm"
              className="px-1"
              onClick={() => setViewType("List")}
            >
              Ver Tabela Completa
            </Button>
            <div className="flex items-center space-x-1">
              {/* Morador com 1 apt não pode navegar de volta para condomínios */}
              <Button
                variant="link"
                className="flex items-center px-1 mx-0 py-1"
                disabled={!!singleApartment}
                onClick={() => {
                  if (singleApartment) return;
                  setFilters((prev) => ({ ...prev, complex: undefined, block: undefined, apartment: undefined, meter: undefined }))
                }}
              >
                <Building2 />{' '}
                <span>
                  {filters.complex?.socialName?.length
                    ? filters.complex.socialName.length > 12
                      ? `${filters.complex.socialName.slice(0, 12)}...`
                      : filters.complex.socialName
                    : 'Condomínios'}
                </span>
              </Button>
              {filters.complex?.id && (
                <>
                  <ChevronRight className="text-muted-foreground" width={15} />
                  <Button
                    variant="link"
                    className="flex items-center px-1 mx-0 py-1"
                    disabled={!!singleApartment}
                    onClick={() => {
                      if (singleApartment) return;
                      setFilters((prev) => ({ ...prev, block: undefined, apartment: undefined, meter: undefined }))
                    }}
                  >
                    <Building />{' '}
                    <span>
                      {filters.block
                        ? filters.block.name.length > 12
                          ? `${filters.block.name.slice(0, 12)}...`
                          : filters.block.name
                        : 'Blocos'}
                    </span>
                  </Button>
                </>
              )}
              {filters.block?.id && (
                <>
                  <ChevronRight className="text-muted-foreground" width={15} />
                  <Button
                    variant="link"
                    className="flex items-center px-1 mx-0 py-1"
                    disabled={!!singleApartment}
                    onClick={() => {
                      if (singleApartment) return;
                      setFilters((prev) => ({ ...prev, apartment: undefined, meter: undefined }))
                    }}
                  >
                    <DoorClosed />{' '}
                    <span>
                      {filters.apartment
                        ? filters.apartment.name.length > 12
                          ? `${filters.apartment.name.slice(0, 12)}...`
                          : filters.apartment.name
                        : 'Apartamentos'}
                    </span>
                  </Button>
                </>
              )}
              {filters.apartment?.id && (
                <>
                  <ChevronRight className="text-muted-foreground" width={15} />
                  <Button
                    variant="link"
                    className="flex items-center px-1 mx-0 py-1"
                    onClick={() => setFilters((prev) => ({ ...prev, meter: undefined }))}
                  >
                    <GaugeCircle />{' '}
                    <span>
                      {filters.meter
                        ? filters.meter.register.length > 12
                          ? `${filters.meter.register.slice(0, 12)}...`
                          : filters.meter.register
                        : 'Medidores'}
                    </span>
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <Card className="mb-4">
            <CardHeader className="pb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Filter />
                  <span>Leituras</span>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setViewType("Cards")}
                  className="h-9 px-0"
                >
                  Navegar por Cards
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex flex-col items-start">
                  <SelectCompany
                    company={filters.company}
                    getAvailableForEntity='reading'
                    setSelectedCompany={(company) => {
                      setFilters((prev) => ({
                        ...prev,
                        company,
                        complex: undefined,
                        block: undefined,
                        apartment: undefined,
                        meter: undefined,
                      }))
                    }}
                  />
                </div>
                <div className="flex flex-col items-start">
                  <SelectComplex
                    complex={filters.complex}
                    getAvailableForEntity='reading'
                    setSelectedComplex={(complex) => {
                      setFilters((prev) => ({
                        ...prev,
                        complex,
                        block: undefined,
                        apartment: undefined,
                        meter: undefined,
                      }))
                    }}
                    companyId={filters.company?.id}
                  />
                </div>
                <div className="flex flex-col items-start">
                  <SelectBlock
                    block={filters.block}
                    getAvailableForEntity='reading'
                    setSelectedBlock={(block) => {
                      setFilters((prev) => ({
                        ...prev,
                        block,
                        apartment: undefined,
                        meter: undefined,
                      }))
                    }}
                    complexId={filters.complex?.id}
                  />
                </div>
                <div className="flex flex-col items-start">
                  <SelectApartment
                    apartment={filters.apartment}
                    getAvailableForEntity='reading'
                    setSelectedApartment={(apartment) => {
                      setFilters((prev) => ({
                        ...prev,
                        apartment,
                        meter: undefined,
                      }))
                    }}
                    blockId={filters.block?.id}
                  />
                </div>
                <div className="flex flex-col items-start">
                  <SelectMeter
                    meter={filters.meter}
                    setSelectedMeter={(meter) => setFilters((prev) => ({ ...prev, meter }))}
                    apartmentId={filters.apartment?.id}
                  />
                </div>
                <div className="flex flex-col items-start">
                  <Label className="flex items-center gap-1 text-xs font-semibold">Pré-leitura</Label>
                  <Switch id="pre-reading-switch" checked={filters.isPreReading} onCheckedChange={(checked) => setFilters((prev) => ({ ...prev, isPreReading: checked }))} />
                </div>
                <div className="flex flex-col items-start">
                  <DateRangeSelector onDateRangeChange={handleOnDateRangeChange} />
                </div>
              </div>
              {canCreateReading() && (
                <div className="mt-4 flex items-center">
                  <Button variant="link" onClick={() => setImportDialogOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Importar Leituras
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {/* Filtro de período - visível apenas no modo Cards */}
        {viewType === "Cards" && (
          <>
            <div className="mb-2">
              <DateRangeSelector onDateRangeChange={handleOnDateRangeChange} />
            </div>
            {/* Botão de importação de leituras */}
            {canCreateReading() && (
              <div className="mb-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Leituras
                </Button>
              </div>
            )}
          </>
        )}
        {/* Botão de exportação XLSX (mantido comentado) */}
        
        {filters.complex && viewType == "List" && (
          <div className="flex gap-2">
            <ExportReadingsButton
              filters={filters}
              complexId={filters.complex.id}
              blockId={filters.block?.id}
            />
          </div>
        )}
       
        {viewType == "Cards" && !filters.complex?.id && (
          <>
            {/* Morador: não mostra busca se já tem contexto restrito */}
            {!isMorador && (
              <div className="mb-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Pesquisar condomínios..."
                    className="pl-10"
                    value={complexSearchText}
                    onChange={(e) => setComplexSearchText(e.target.value)}
                  />
                </div>
              </div>
            )}
            <ComplexesList 
              viewType="Cards" 
              getAvailableForEntity='reading' 
              setSelectedComplex={(complex) => {
                if (isMorador && complex) {
                  // Verifica se o morador tem apenas 1 apartamento neste condomínio
                  const aptsInComplex = userContext!.apartments.filter(
                    (a) => (a.block as any)?.complex?.id === complex.id
                  );
                  if (aptsInComplex.length === 1) {
                    const apt = aptsInComplex[0];
                    setFilters((prev) => ({
                      ...prev,
                      complex,
                      block: apt.block as any,
                      apartment: apt as any,
                      meter: undefined,
                    }));
                    return;
                  }
                }
                handleSelectedComplex(complex);
              }} 
              nameQuery={!isMorador ? complexSearchText : ''}
            />
          </>
        )}
        {/* Morador com múltiplos apts no condomínio: mostrar lista dos seus apts */}
        {viewType == "Cards" && filters.complex?.id && !filters.apartment?.id && isMorador && (
          (() => {
            const aptsInComplex = userContext!.apartments.filter(
              (a) => (a.block as any)?.complex?.id === filters.complex?.id
            );
            if (aptsInComplex.length > 1) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {aptsInComplex.map((apt) => (
                    <Card
                      key={apt.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setFilters((prev) => ({
                          ...prev,
                          block: apt.block as any,
                          apartment: apt as any,
                          meter: undefined,
                        }));
                      }}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DoorClosed className="h-5 w-5" />
                          Apto {apt.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">Bloco {(apt.block as any)?.name}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            }
            return null;
          })()
        )}
        {/* Usuário normal: seleção de bloco e apartamento */}
        {viewType == "Cards" && filters.complex?.id && !filters.block?.id && !isMorador && (
          <BlocksList viewType="Cards" complexId={filters.complex.id} setSelectedBlock={handleSelectedBlock} />
        )}
        {viewType == "Cards" && filters.complex?.id && filters.block?.id && !filters.apartment?.id && !isMorador && (
          <ApartmentsList viewType="Cards" blockId={filters.block.id} setSelectedApartment={handleSelectedApartment} />
        )}
        {/* Visualização Cards ou Lista */}
        {filters.complex && (
          viewType === "Cards" ? (
            filters.complex?.id && filters.block?.id && filters.apartment?.id ? (
              <MedidorGraphs apartment={filters.apartment} dateRange={dateRange} />
            ) : (
              <div className="text-center text-muted-foreground py-8">Selecione empresa, condomínio, bloco e apartamento para visualizar os gráficos dos medidores.</div>
            )
          ) : (
            <MetersAndReadingsList
              key={JSON.stringify({ filters, page: currentPage, dateRange })}
              complexId={filters.complex.id}
              blockId={filters.block?.id}
              search={''}
              filters={filters}
              currentPage={currentPage}
              handlePageChange={setCurrentPage}
              handleRowsPerPageChange={(value) => setFilters((prev) => ({ ...prev, take: Number(value), skip: 0 }))}
              dateRange={dateRange}
            />
          )
        )}
      </div>

      {/* Diálogo de importação de leituras */}
      <ImportReadingsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          setImportDialogOpen(false);
          // Aqui você pode adicionar lógica para atualizar a lista de leituras após importação, se necessário
        }}
      />

    </div>
  );
}