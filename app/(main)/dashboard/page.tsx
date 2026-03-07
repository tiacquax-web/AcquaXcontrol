'use client';

import {
  Building2, FileText, TrendingUp, Droplets, ChevronRight, Loader2,
  AlertTriangle, Ban, Receipt, CalendarCheck2, Building, DoorClosed,
  BarChart3,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { clearCachedPermissions } from '@/lib/permissions-cache';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import SelectComplex from "@/components/ComboboxComplex";
import SelectBlock from "@/components/ComboboxBlock";
import SelectApartment from "@/components/ComboboxApartment";
import SelectMeter from "@/components/ComboboxMeter";
import { useUpdateUserPreferences } from '@/hooks/useUserPreferences';
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { useMeterReport, MeterReportItem } from "@/hooks/useMeterReport";
import { useDealershipReadings } from "@/hooks/useDealershipReadings";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComplexesList from '@/components/ComplexesList';
import { Apartment, Block, Complex } from '@prisma/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildMonthOptions(count = 24) {
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(new Date(), i);
    return {
      value: `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
      label: format(d, 'MMMM / yyyy', { locale: ptBR }),
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear()),
      labelShort: format(d, 'MMM/yyyy', { locale: ptBR }),
    };
  });
}
const allMonthOptions = buildMonthOptions();

const formatCurrency = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

// ─── FilipetaMiniCard ─────────────────────────────────────────────────────────
function FilipetaMiniCard({ report }: { report: MeterReportItem }) {
  const apt = report.apartment;
  const cx = apt?.block?.complex as any;
  const block = apt?.block as any;
  const monthLabel = report.monthRef
    ? format(new Date(Number(report.yearRef), Number(report.monthRef) - 1), 'MMM/yyyy', { locale: ptBR })
    : `${report.monthRef}/${report.yearRef}`;

  return (
    <Link href="/meter-report">
      <div className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer bg-background">
        <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold truncate">{cx?.socialName || 'Condomínio'}</span>
          <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0 shrink-0">{monthLabel}</Badge>
        </div>
        <div className="px-3 py-1 border-b text-xs text-muted-foreground flex gap-3">
          <span>Bl. {block?.name}</span>
          <span>Apto {apt?.name}</span>
        </div>
        <div className="flex gap-0">
          {report.lastReading?.urlCover ? (
            <div className="relative w-20 h-20 shrink-0 border-r">
              <Image src={report.lastReading.urlCover} alt="medidor" fill className="object-cover" sizes="80px" />
            </div>
          ) : (
            <div className="w-20 h-20 shrink-0 border-r bg-muted flex items-center justify-center">
              <Droplets className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 grid grid-cols-2 divide-x divide-y text-xs">
            <div className="px-2 py-1.5 text-center">
              <p className="text-muted-foreground">Consumo</p>
              <p className="font-bold text-teal-600">{report.consumption?.toFixed(2) ?? '—'} m³</p>
            </div>
            <div className="px-2 py-1.5 text-center">
              <p className="text-muted-foreground">Total</p>
              <p className="font-bold text-blue-600">{formatCurrency(report.totalUnit)}</p>
            </div>
            <div className="px-2 py-1.5 text-center col-span-2">
              <p className="text-muted-foreground text-[10px]">Leitura Atual</p>
              <p className="font-semibold">{report.lastReading?.reading?.toFixed(3) ?? '—'} m³</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function FilipetaMiniSkeleton() {
  return (
    <div className="border rounded-xl overflow-hidden">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-5 w-1/2 m-2" />
      <div className="flex">
        <Skeleton className="w-20 h-20 shrink-0" />
        <div className="flex-1 p-2 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

// ─── MonthSelect ──────────────────────────────────────────────────────────────
function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allMonthOptions.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── MONTH_NAMES ─────────────────────────────────────────────────────────────
const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── ConsumoAnualGraph ────────────────────────────────────────────────────────
// Busca consumo mensal (m³) via meter-report para o ano selecionado e plota
// um gráfico de barras. Apenas meses com dados aparecem no gráfico.
function ConsumoAnualGraph({ apartmentId }: { apartmentId: string }) {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));

  // Fetch all 12 months in parallel for the selected year
  const [monthlyData, setMonthlyData] = useState<{ month: string; consumo: number; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_API_URL;
    Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const month = String(i + 1).padStart(2, '0');
        return fetch(`${base}/meter-report?month=${month}&year=${selectedYear}&apartment_id=${apartmentId}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : { list: [] })
          .then(d => {
            const list: MeterReportItem[] = d.list ?? [];
            // Sum consumption of all reports for this apartment in this month
            const totalConsumo = list.reduce((sum, r) => sum + (r.consumption ?? 0), 0);
            return { monthIndex: i, totalConsumo };
          })
          .catch(() => ({ monthIndex: i, totalConsumo: 0 }));
      })
    ).then(results => {
      const data = results
        .filter(r => r.totalConsumo > 0) // Only months with consumption
        .map(r => ({
          month: String(r.monthIndex + 1).padStart(2, '0'),
          consumo: parseFloat(r.totalConsumo.toFixed(3)),
          label: MONTH_NAMES_SHORT[r.monthIndex],
        }));
      setMonthlyData(data);
      setLoading(false);
    });
  }, [apartmentId, selectedYear]);

  const totalAnual = monthlyData.reduce((s, d) => s + d.consumo, 0);
  const maxConsumo = monthlyData.length > 0 ? Math.max(...monthlyData.map(d => d.consumo)) : 0;

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg text-xs">
          <p className="font-semibold mb-1">{label} / {selectedYear}</p>
          <p className="text-teal-600 font-bold">{payload[0].value.toFixed(3)} m³</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-teal-600" />
          Consumo Mensal (m³)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando consumo de {selectedYear}...</span>
          </div>
        ) : monthlyData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Droplets className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">Sem dados de consumo</p>
            <p className="text-xs mt-1">para o ano {selectedYear}</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}m³`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="consumo" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {monthlyData.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={entry.consumo === maxConsumo ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span>{monthlyData.length} {monthlyData.length === 1 ? 'mês' : 'meses'} com consumo</span>
              <span className="font-semibold text-foreground">Total: {totalAnual.toFixed(3)} m³</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── MoradorDashboard ─────────────────────────────────────────────────────────
function MoradorDashboard({ router }: { router: ReturnType<typeof useRouter> }) {
  const { context, loading: ctxLoading } = useUserContext();
  const apartments = context?.apartments ?? [];

  const [filters, setFilters] = useState<{
    complex: Complex | undefined;
    block: Block | undefined;
    apartment: Apartment | undefined;
  }>({ complex: undefined, block: undefined, apartment: undefined });

  // Single apartment auto-apply
  const singleApartment = useMemo(() => {
    if (!context || apartments.length !== 1) return null;
    return apartments[0];
  }, [context, apartments]);

  useEffect(() => {
    if (singleApartment && !filters.apartment) {
      const block = singleApartment.block as any;
      const complex = block?.complex as any;
      setFilters({ complex: complex || undefined, block: block || undefined, apartment: singleApartment as any });
    }
  }, [singleApartment]);

  // ── Filipeta preview state ──
  const [filipetasByMonth, setFilipetasByMonth] = useState<Record<string, MeterReportItem[]>>({});
  const [loadingFilipetas, setLoadingFilipetas] = useState(false);

  const last3 = useMemo(() => Array.from({ length: 3 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()), label: format(d, 'MMM/yyyy', { locale: ptBR }) };
  }), []);

  useEffect(() => {
    if (ctxLoading || apartments.length === 0) return;
    setLoadingFilipetas(true);
    const base = process.env.NEXT_PUBLIC_API_URL;
    Promise.all(
      last3.map(m =>
        fetch(`${base}/meter-report?month=${m.month}&year=${m.year}`, { credentials: 'include' })
          .then(r => r.json())
          .then(d => ({ key: `${m.month}-${m.year}`, list: (d.list ?? []) as MeterReportItem[] }))
          .catch(() => ({ key: `${m.month}-${m.year}`, list: [] as MeterReportItem[] }))
      )
    ).then(results => {
      const map: Record<string, MeterReportItem[]> = {};
      results.forEach(r => { map[r.key] = r.list; });
      setFilipetasByMonth(map);
      setLoadingFilipetas(false);
    });
  }, [ctxLoading, apartments.length]);

  return (
    <>
      {/* ── Consumo Anual section ── */}
      <section className="w-full space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Consumo da Unidade</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/readings')}>
            Ver leituras detalhadas <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Breadcrumb navigation — only for moradores with multiple complexes/apts */}
        {!singleApartment && (
          <div className="flex items-center space-x-1 flex-wrap text-sm">
            <Button
              variant="link"
              className="flex items-center px-1 mx-0 py-1"
              onClick={() => setFilters({ complex: undefined, block: undefined, apartment: undefined })}
            >
              <Building2 className="mr-1 h-4 w-4" />
              {filters.complex?.socialName
                ? filters.complex.socialName.length > 14
                  ? `${filters.complex.socialName.slice(0, 14)}...`
                  : filters.complex.socialName
                : 'Condomínios'}
            </Button>
            {filters.complex?.id && (
              <>
                <ChevronRight className="text-muted-foreground w-4 h-4" />
                <Button
                  variant="link"
                  className="flex items-center px-1 mx-0 py-1"
                  onClick={() => setFilters(prev => ({ ...prev, block: undefined, apartment: undefined }))}
                >
                  <Building className="mr-1 h-4 w-4" />
                  {filters.block ? (filters.block.name.length > 12 ? `${filters.block.name.slice(0, 12)}...` : filters.block.name) : 'Blocos'}
                </Button>
              </>
            )}
            {filters.block?.id && (
              <>
                <ChevronRight className="text-muted-foreground w-4 h-4" />
                <Button
                  variant="link"
                  className="flex items-center px-1 mx-0 py-1"
                  onClick={() => setFilters(prev => ({ ...prev, apartment: undefined }))}
                >
                  <DoorClosed className="mr-1 h-4 w-4" />
                  {filters.apartment ? (filters.apartment.name.length > 12 ? `${filters.apartment.name.slice(0, 12)}...` : filters.apartment.name) : 'Apartamentos'}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Complex list — only when no complex selected and multiple options */}
        {!filters.complex?.id && !singleApartment && (
          <ComplexesList
            viewType="Cards"
            getAvailableForEntity="reading"
            setSelectedComplex={(complex) => {
              if (!complex) return;
              if (context) {
                const aptsInComplex = context.apartments.filter(
                  (a) => (a.block as any)?.complex?.id === complex.id
                );
                if (aptsInComplex.length === 1) {
                  const apt = aptsInComplex[0];
                  setFilters({ complex, block: apt.block as any, apartment: apt as any });
                  return;
                }
              }
              setFilters({ complex, block: undefined, apartment: undefined });
            }}
            nameQuery=""
          />
        )}

        {/* Multiple apartments in complex: list them */}
        {filters.complex?.id && !filters.apartment?.id && context && (() => {
          const aptsInComplex = context.apartments.filter(
            (a) => (a.block as any)?.complex?.id === filters.complex?.id
          );
          if (aptsInComplex.length > 1) {
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aptsInComplex.map((apt) => (
                  <Card
                    key={apt.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setFilters(prev => ({ ...prev, block: apt.block as any, apartment: apt as any }))}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DoorClosed className="h-5 w-5" />Apto {apt.name}
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
        })()}

        {/* Annual consumption chart when apartment is selected */}
        {filters.apartment?.id && (
          <ConsumoAnualGraph apartmentId={filters.apartment.id} />
        )}

        {/* Empty state when no complex selected and user has multiple */}
        {!filters.complex?.id && !singleApartment && apartments.length > 1 && (
          <p className="text-xs text-muted-foreground mt-1">Selecione um condomínio para ver o consumo.</p>
        )}
      </section>

      {/* ── Filipeta preview ── */}
      <section className="w-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Filipetas — últimos 3 meses</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/meter-report" className="flex items-center gap-1">Ver todas <ChevronRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {loadingFilipetas ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <FilipetaMiniSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {last3.map(m => {
              const items = filipetasByMonth[`${m.month}-${m.year}`] ?? [];
              if (items.length === 0)
                return (
                  <div key={m.label} className="border rounded-xl p-4 flex flex-col items-center justify-center text-muted-foreground text-sm min-h-[120px]">
                    <span className="font-medium capitalize mb-1">{m.label}</span>
                    <span className="text-xs">Sem dados</span>
                  </div>
                );
              return items.map(r => <FilipetaMiniCard key={r.id} report={r} />);
            })}
          </div>
        )}
      </section>
    </>
  );
}

// ─── AdminDashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ setAddDialogOpen }: any) {
  const { context, loading: ctxLoading } = useUserContext();

  // All complexes
  const complexes = useMemo(() => {
    if (!context) return [];
    const map = new Map<string, any>();
    context.complexes.forEach(c => map.set(c.id, c));
    context.apartments.forEach(a => { const cx = a.block?.complex; if (cx && !map.has(cx.id)) map.set(cx.id, cx); });
    return Array.from(map.values());
  }, [context]);

  const [selectedComplexIdx, setSelectedComplexIdx] = useState(0);
  const selectedComplex = complexes[selectedComplexIdx] ?? null;

  // Month selectors (filipeta + bill can be different months)
  const [filipetaMonthVal, setFilipetaMonthVal] = useState(allMonthOptions[0].value);
  const [statsMonthVal, setStatsMonthVal] = useState(allMonthOptions[0].value);
  const [billMonthVal, setBillMonthVal] = useState(allMonthOptions[0].value);

  const filipetaMonthOpt = allMonthOptions.find(o => o.value === filipetaMonthVal)!;
  const statsMonthOpt = allMonthOptions.find(o => o.value === statsMonthVal)!;
  const billMonthOpt = allMonthOptions.find(o => o.value === billMonthVal)!;

  // Filipeta data for preview panel
  const { data: filipetaData, loading: loadingFilipetas } = useMeterReport({
    month: filipetaMonthOpt.month,
    year: filipetaMonthOpt.year,
    complexId: selectedComplex?.id,
    enabled: !!selectedComplex?.id,
  });

  // Stats data (consumption > 15m³ and zero consumption)
  const { data: statsData, loading: loadingStats } = useMeterReport({
    month: statsMonthOpt.month,
    year: statsMonthOpt.year,
    complexId: selectedComplex?.id,
    enabled: !!selectedComplex?.id,
  });

  // Dealership readings for the bill panel
  const { dealershipReadings, loading: loadingBill } = useDealershipReadings({
    complexId: selectedComplex?.id ?? undefined,
    withDealership: true,
    withComplex: true,
    take: 50,
  });

  // Filter bill for selected month
  const billReading = useMemo(() => {
    if (!dealershipReadings?.length) return null;
    return dealershipReadings.find(
      dr => String(dr.monthRef).padStart(2, '0') === billMonthOpt.month && String(dr.yearRef) === billMonthOpt.year
    ) ?? null;
  }, [dealershipReadings, billMonthOpt]);

  // Stats computed
  const highConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) > 15) ?? [], [statsData]);
  const zeroConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) === 0) ?? [], [statsData]);

  const totalConsumption = useMemo(() =>
    filipetaData?.list.reduce((s, r) => s + (r.consumption ?? 0), 0) ?? null, [filipetaData]);
  const totalValue = useMemo(() =>
    filipetaData?.list.reduce((s, r) => s + (r.totalUnit ?? 0), 0) ?? null, [filipetaData]);

  return (
    <>
      {/* ── Condomínio selector ── */}
      {!ctxLoading && complexes.length > 0 && (
        <section className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Meus Condomínios</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {complexes.map((cx, idx) => (
              <Button key={cx.id} variant={selectedComplexIdx === idx ? 'default' : 'outline'} size="sm" onClick={() => setSelectedComplexIdx(idx)} className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />{cx.socialName || cx.aliasName}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ── Three bottom panels ── */}
      {selectedComplex && (
        <section className="w-full space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">{selectedComplex.socialName || selectedComplex.aliasName}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ── Panel 1: Filipeta preview ── */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Filipetas
                </CardTitle>
                <MonthSelect value={filipetaMonthVal} onChange={setFilipetaMonthVal} />
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto max-h-[520px] space-y-3 pr-1">
                {loadingFilipetas ? (
                  [1, 2].map(i => <FilipetaMiniSkeleton key={i} />)
                ) : filipetaData && filipetaData.list.length > 0 ? (
                  <>
                    {filipetaData.list.slice(0, 5).map(r => <FilipetaMiniCard key={r.id} report={r} />)}
                    {filipetaData.list.length > 5 && (
                      <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                        +{filipetaData.list.length - 5} unidades <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados para {filipetaMonthOpt.labelShort}</p>
                )}
              </CardContent>
            </Card>

            {/* ── Panel 2: Consumption stats ── */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-500" />
                  Resumo de Consumo
                </CardTitle>
                <MonthSelect value={statsMonthVal} onChange={setStatsMonthVal} />
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingStats ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" />
                  </div>
                ) : statsData && statsData.list.length > 0 ? (
                  <>
                    {/* Totals row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          <Droplets className="w-3 h-3 text-blue-400" /> Consumo Total
                        </p>
                        <p className="text-xl font-bold text-teal-600">{totalConsumption?.toFixed(2)} <span className="text-xs font-normal">m³</span></p>
                      </div>
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1">Total Arrecadado</p>
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(totalValue)}</p>
                      </div>
                    </div>

                    {/* High consumption alert */}
                    <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                        <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                          Consumo &gt; 15 m³ — {highConsumptionUnits.length} unidade{highConsumptionUnits.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {highConsumptionUnits.length > 0 ? (
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {highConsumptionUnits.map(r => (
                            <div key={r.id} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Bl.{r.apartment?.block?.name} · Apto {r.apartment?.name}</span>
                              <span className="font-semibold text-orange-600">{r.consumption?.toFixed(2)} m³</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhuma unidade acima de 15 m³</p>
                      )}
                    </div>

                    {/* Zero consumption alert */}
                    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Ban className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                          Sem consumo — {zeroConsumptionUnits.length} unidade{zeroConsumptionUnits.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {zeroConsumptionUnits.length > 0 ? (
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {zeroConsumptionUnits.map(r => (
                            <div key={r.id} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Bl.{r.apartment?.block?.name} · Apto {r.apartment?.name}</span>
                              <span className="font-semibold text-red-600">0.000 m³</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Todas as unidades tiveram consumo</p>
                      )}
                    </div>

                    {/* Per-unit mini table */}
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Unidade</th>
                            <th className="text-right px-3 py-2">m³</th>
                            <th className="text-right px-3 py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {statsData.list.slice(0, 6).map(r => (
                            <tr key={r.id} className="hover:bg-muted/40">
                              <td className="px-3 py-1.5">Bl.{r.apartment?.block?.name} · {r.apartment?.name}</td>
                              <td className="px-3 py-1.5 text-right text-teal-600 font-medium">{r.consumption?.toFixed(3) ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(r.totalUnit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {statsData.list.length > 6 && (
                      <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                        Ver todas as {statsData.totalCount} unidades <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados para {statsMonthOpt.labelShort}</p>
                )}
              </CardContent>
            </Card>

            {/* ── Panel 3: Bill summary (dealership reading) ── */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-purple-500" />
                  Conta da Concessionária
                </CardTitle>
                <MonthSelect value={billMonthVal} onChange={setBillMonthVal} />
              </CardHeader>
              <CardContent>
                {loadingBill ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-8 w-full" />
                  </div>
                ) : billReading ? (
                  <div className="space-y-4">
                    {/* Total bill value */}
                    <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Valor Total da Conta</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {formatCurrency((billReading as any).totalValue)}
                      </p>
                    </div>

                    {/* Reading date */}
                    <div className="rounded-xl border p-3 flex items-center gap-3">
                      <CalendarCheck2 className="w-5 h-5 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Data de Leitura</p>
                        <p className="font-semibold text-sm">
                          {(billReading as any).readingDate
                            ? format(new Date((billReading as any).readingDate.includes('T') ? (billReading as any).readingDate : `${(billReading as any).readingDate}T00:00:00`), 'dd/MM/yyyy')
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Next reading date */}
                    {(billReading as any).nextReadingDate && (
                      <div className="rounded-xl border p-3 flex items-center gap-3">
                        <CalendarCheck2 className="w-5 h-5 text-teal-500 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Próxima Leitura</p>
                          <p className="font-semibold text-sm">
                            {format(new Date((billReading as any).nextReadingDate.includes('T') ? (billReading as any).nextReadingDate : `${(billReading as any).nextReadingDate}T00:00:00`), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Extra info */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-muted-foreground mb-1">Consumo Total</p>
                        <p className="font-bold text-teal-600">{(billReading as any).dealershipConsumption ?? (billReading as any).monthlyConsumption ?? '—'} m³</p>
                      </div>
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-muted-foreground mb-1">Concessionária</p>
                        <p className="font-semibold truncate">{(billReading as any).dealership?.name ?? '—'}</p>
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                      <Link href="/dealership-readings">Ver detalhes completos</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Receipt className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm font-medium">Sem conta registrada</p>
                    <p className="text-xs mt-1">para {billMonthOpt.labelShort}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const { preferences, refetch: refetchPreferences } = useUserPreferences();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState<any>(undefined);
  const [selectedBlock, setSelectedBlock] = useState<any>(undefined);
  const [selectedApartment, setSelectedApartment] = useState<any>(undefined);
  const [selectedMeter, setSelectedMeter] = useState<any>(undefined);
  const { updatePreferences, loading: updatingPref } = useUpdateUserPreferences();
  const [error, setError] = useState<string | null>(null);
  const { context, loading: ctxLoading } = useUserContext();

  useEffect(() => { clearCachedPermissions(); }, []);

  useEffect(() => {
    if (!addDialogOpen) {
      setSelectedComplex(undefined); setSelectedBlock(undefined);
      setSelectedApartment(undefined); setSelectedMeter(undefined); setError(null);
    }
  }, [addDialogOpen]);

  const handleSavePreference = async () => {
    if (!selectedMeter?.id) { setError('Selecione um medidor.'); return; }
    try {
      const newMeters = Array.from(new Set([...(preferences?.meters || []), selectedMeter.id]));
      await updatePreferences(newMeters);
      await refetchPreferences();
      setAddDialogOpen(false);
    } catch (e: any) { setError(e.message || 'Erro ao salvar preferência.'); }
  };

  const isMorador = useMemo(() => {
    if (!context) return false;
    return !context.isSystem && context.companyIds.length === 0 && context.complexes.length === 0 && context.blocks.length === 0 && context.apartments.length > 0;
  }, [context]);

  return (
    <div className="space-y-8 w-full">
      <div className="space-y-8 container mx-auto md:px-6">

        {ctxLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : isMorador ? (
          <MoradorDashboard router={router} />
        ) : (
          <AdminDashboard
            setAddDialogOpen={setAddDialogOpen}
          />
        )}

        {/* Shared add-meter dialog (available for moradores via "Ver página completa" → /readings, but keeping dialog for direct access) */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Medidor à Dashboard</DialogTitle>
              <DialogDescription>Selecione o contexto e o medidor que deseja visualizar no dashboard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Condomínio</Label><SelectComplex getAvailableForEntity="reading" setSelectedComplex={setSelectedComplex} complex={selectedComplex} modal required /></div>
              <div><Label>Bloco</Label><SelectBlock getAvailableForEntity="reading" setSelectedBlock={setSelectedBlock} block={selectedBlock} complexId={selectedComplex?.id} modal required /></div>
              <div><Label>Apartamento</Label><SelectApartment getAvailableForEntity="reading" setSelectedApartment={setSelectedApartment} apartment={selectedApartment} blockId={selectedBlock?.id} complexId={selectedComplex?.id} modal required /></div>
              <div><Label>Medidor</Label><SelectMeter setSelectedMeter={setSelectedMeter} meter={selectedMeter} apartmentId={selectedApartment?.id} modal required /></div>
              {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={updatingPref}>Cancelar</Button>
              <Button onClick={handleSavePreference} disabled={updatingPref}>{updatingPref ? 'Salvando...' : 'Salvar preferência'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
