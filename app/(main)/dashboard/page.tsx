'use client';

import {
  Building2, FileText, TrendingUp, Droplets, ChevronRight, Loader2,
  AlertTriangle, Ban, Receipt, CalendarCheck2, DoorClosed,
  GaugeCircle, Users, BarChart3, Home, Star,
  Activity, ArrowRight, LogIn, TrendingDown, CheckCircle2, Clock,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import {
  useMeterReport,
  useRecentApartmentReports,
  MeterReportItem,
  RecentMeterReportMonth,
} from "@/hooks/useMeterReport";
import { useDealershipReadings } from '@/hooks/useDealershipReadings';
import { useComplexes } from '@/hooks/useComplexes';
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';

// ─── helpers ─────────────────────────────────────────────────────────────────
const MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

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

const getMonthConsumptionTotal = (month: RecentMeterReportMonth) =>
  month.list.reduce((sum, report) => sum + (report.consumption ?? 0), 0);

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
        {/* Header */}
        <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold truncate">{cx?.socialName || 'Condomínio'}</span>
          <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0 shrink-0 whitespace-nowrap">{monthLabel}</Badge>
        </div>
        {/* Unit */}
        <div className="px-3 py-1.5 border-b text-xs text-muted-foreground flex gap-3 flex-wrap">
          <span>Bl. {block?.name}</span>
          <span>Apto {apt?.name}</span>
        </div>
        {/* Content */}
        <div className="flex gap-0">
          {/* Photo */}
          {report.lastReading?.urlCover ? (
            <div className="relative w-24 h-24 shrink-0 border-r">
              <Image src={report.lastReading.urlCover} alt="medidor" fill className="object-cover" sizes="96px" />
            </div>
          ) : (
            <div className="w-24 h-24 shrink-0 border-r bg-muted flex items-center justify-center">
              <Droplets className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          {/* Info */}
          <div className="flex-1 flex flex-col divide-y text-xs min-w-0">
            <div className="grid grid-cols-2 divide-x flex-1">
              <div className="px-2 py-2 text-center flex flex-col justify-center">
                <p className="text-muted-foreground text-[10px] mb-0.5">Consumo</p>
                <p className="font-bold text-teal-600 leading-tight">{report.consumption?.toFixed(2) ?? '—'}</p>
                <p className="text-muted-foreground text-[10px]">m³</p>
              </div>
              <div className="px-2 py-2 text-center flex flex-col justify-center">
                <p className="text-muted-foreground text-[10px] mb-0.5">Total</p>
                <p className="font-bold text-blue-600 leading-tight text-[11px]">{formatCurrency(report.totalUnit)}</p>
              </div>
            </div>
            <div className="px-2 py-1.5 text-center">
              <p className="text-muted-foreground text-[10px]">Leitura Atual</p>
              <p className="font-semibold text-[11px]">{report.lastReading?.reading?.toFixed(3) ?? '—'} m³</p>
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

// ─── ConsumoAnualGraph ────────────────────────────────────────────────────────
function ConsumoAnualGraph({
  recentMonths,
  loading,
}: {
  recentMonths: RecentMeterReportMonth[];
  loading: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));

  const yearOptions = useMemo(() => {
    const availableYears = Array.from(new Set(recentMonths.map(month => month.yearRef)));
    return availableYears.length > 0 ? availableYears : [String(currentYear)];
  }, [recentMonths, currentYear]);

  useEffect(() => {
    if (yearOptions.length === 0) return;
    setSelectedYear(prev => yearOptions.includes(prev) ? prev : yearOptions[0]);
  }, [yearOptions]);

  const chartData = useMemo(() =>
    recentMonths
      .filter(month => month.yearRef === selectedYear)
      .map(month => ({
        monthNumber: Number(month.monthRef),
        month: MONTH_NAMES_SHORT[Number(month.monthRef) - 1],
        consumption: getMonthConsumptionTotal(month),
      }))
      .sort((a, b) => a.monthNumber - b.monthNumber)
      .map(({ month, consumption }) => ({ month, consumption })),
  [recentMonths, selectedYear]);

  const totalAnual = useMemo(() =>
    chartData.reduce((sum, month) => sum + month.consumption, 0),
  [chartData]);

  const maxVal = useMemo(() => Math.max(...chartData.map(d => d.consumption), 1), [chartData]);
  const peakMonth = useMemo(() =>
    chartData.length > 0 ? chartData.reduce((a, b) => a.consumption > b.consumption ? a : b) : null,
  [chartData]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <CardTitle className="text-base font-semibold">Consumo Anual — m³ por mês</CardTitle>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => (
              <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : recentMonths.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Sem leituras registradas para esta unidade</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Sem leituras registradas em {selectedYear}</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={55} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(3)} m³`, 'Consumo']}
                  labelStyle={{ fontSize: 12 }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="consumption" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={peakMonth && entry.month === peakMonth.month
                        ? '#f97316'
                        : entry.consumption < maxVal * 0.4
                          ? '#22d3ee'
                          : '#3b82f6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center justify-between px-2 py-2 bg-muted/50 rounded-lg text-sm">
              <span className="text-muted-foreground">Total em {selectedYear}</span>
              <span className="font-bold text-teal-600">{totalAnual?.toFixed(3) ?? '—'} m³</span>
            </div>
            <div className="mt-2 flex gap-4 px-2 text-xs text-muted-foreground flex-wrap">
              {peakMonth && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-orange-400"/>
                  {peakMonth.month} — maior consumo ({peakMonth.consumption.toFixed(3)} m³)
                </span>
              )}
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-cyan-400"/>Baixo</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500"/>Normal</span>
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

  const singleApartment = useMemo(() => {
    if (!context || apartments.length !== 1) return null;
    return apartments[0];
  }, [context, apartments]);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const activeAptId = singleApartment?.id ?? selectedAptId;
  const {
    data: recentReportsData,
    loading: loadingRecentReports,
  } = useRecentApartmentReports({
    apartmentId: activeAptId ?? undefined,
    monthsLimit: 48,
    enabled: !ctxLoading && apartments.length > 0 && !!activeAptId,
  });
  const recentMonths = recentReportsData?.months ?? [];
  const recentFilipetas = useMemo(() => recentMonths.slice(0, 3), [recentMonths]);

  if (ctxLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Consumo Anual ── */}
      <section className="w-full space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Consumo da Unidade</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/readings')}>
            Ver leituras completas <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {!singleApartment && apartments.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {apartments.map(apt => {
              const block = apt.block as any;
              const cx = block?.complex;
              return (
                <Button
                  key={apt.id}
                  variant={selectedAptId === apt.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAptId(apt.id)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <DoorClosed className="w-3.5 h-3.5" />
                  {cx?.socialName ? `${cx.socialName} — ` : ''}Bl.{block?.name} Apto {apt.name}
                </Button>
              );
            })}
          </div>
        )}

        {apartments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum apartamento vinculado à sua conta.
          </div>
        )}

        {activeAptId ? (
          <ConsumoAnualGraph recentMonths={recentMonths} loading={loadingRecentReports} />
        ) : (
          !singleApartment && apartments.length > 1 && (
            <p className="text-xs text-muted-foreground text-center">Selecione uma unidade para ver o gráfico de consumo.</p>
          )
        )}
      </section>

      {/* ── Filipeta preview ── */}
      <section className="w-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Filipetas — mais recentes</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/meter-report" className="flex items-center gap-1">Ver todas <ChevronRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {!activeAptId && apartments.length > 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Selecione uma unidade para ver as filipetas.</p>
        ) : loadingRecentReports ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <FilipetaMiniSkeleton key={i} />)}
          </div>
        ) : recentFilipetas.length === 0 ? (
          <div className="border rounded-xl p-6 flex flex-col items-center justify-center text-muted-foreground text-sm min-h-[160px]">
            <FileText className="w-8 h-8 mb-2 opacity-30" />
            <span className="font-medium mb-1">Sem filipetas disponíveis</span>
            <span className="text-xs">Nenhum relatório foi encontrado para esta unidade.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recentFilipetas.flatMap(month =>
              month.list.map(report => <FilipetaMiniCard key={report.id} report={report} />)
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── SindicoDashboard ─────────────────────────────────────────────────────────
// Dashboard para Síndico e Administradora — exibe condomínios vinculados com
// 3 painéis: Filipetas, Resumo de Consumo, Conta da Concessionária
function SindicoDashboard() {
  const { context, loading: ctxLoading } = useUserContext();

  const complexes = useMemo(() => {
    if (!context) return [];
    const map = new Map<string, any>();
    context.complexes.forEach(c => map.set(c.id, c));
    context.apartments.forEach(a => {
      const cx = (a.block as any)?.complex;
      if (cx && !map.has(cx.id)) map.set(cx.id, cx);
    });
    return Array.from(map.values());
  }, [context]);

  const [selectedComplexIdx, setSelectedComplexIdx] = useState(0);
  const selectedComplex = complexes[selectedComplexIdx] ?? null;

  const [filipetaMonthVal, setFilipetaMonthVal] = useState(allMonthOptions[0].value);
  const [statsMonthVal, setStatsMonthVal]   = useState(allMonthOptions[0].value);
  const [billMonthVal, setBillMonthVal]     = useState(allMonthOptions[0].value);

  const filipetaMonthOpt = allMonthOptions.find(o => o.value === filipetaMonthVal)!;
  const statsMonthOpt    = allMonthOptions.find(o => o.value === statsMonthVal)!;
  const billMonthOpt     = allMonthOptions.find(o => o.value === billMonthVal)!;

  const { data: filipetaData, loading: loadingFilipetas } = useMeterReport({
    month: filipetaMonthOpt.month,
    year:  filipetaMonthOpt.year,
    complexId: selectedComplex?.id,
    enabled: !!selectedComplex?.id,
  });

  const { data: statsData, loading: loadingStats } = useMeterReport({
    month: statsMonthOpt.month,
    year:  statsMonthOpt.year,
    complexId: selectedComplex?.id,
    enabled: !!selectedComplex?.id,
  });

  const { dealershipReadings, loading: loadingBill } = useDealershipReadings({
    complexId: selectedComplex?.id ?? undefined,
    withDealership: true,
    withComplex: true,
    take: 50,
  });

  const billReading = useMemo(() => {
    if (!dealershipReadings?.length) return null;
    return dealershipReadings.find(
      dr => String(dr.monthRef).padStart(2, '0') === billMonthOpt.month && String(dr.yearRef) === billMonthOpt.year
    ) ?? null;
  }, [dealershipReadings, billMonthOpt]);

  const highConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) > 15) ?? [], [statsData]);
  const zeroConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) === 0) ?? [], [statsData]);
  const totalConsumption = useMemo(() =>
    filipetaData?.list.reduce((s, r) => s + (r.consumption ?? 0), 0) ?? null, [filipetaData]);
  const totalValue = useMemo(() =>
    filipetaData?.list.reduce((s, r) => s + (r.totalUnit ?? 0), 0) ?? null, [filipetaData]);

  if (ctxLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <div className="flex gap-2 flex-wrap">
          {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-32" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Condomínio selector ── */}
      {complexes.length > 0 ? (
        <section className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Meus Condomínios</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {complexes.map((cx, idx) => (
              <Button key={cx.id} variant={selectedComplexIdx === idx ? 'default' : 'outline'} size="sm"
                onClick={() => setSelectedComplexIdx(idx)} className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />{cx.socialName || cx.aliasName}
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <section className="w-full py-12 flex flex-col items-center text-muted-foreground">
          <Building2 className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum condomínio encontrado</p>
          <p className="text-xs mt-1">Sem condomínios vinculados à sua conta.</p>
        </section>
      )}

      {/* ── Three panels ── */}
      {selectedComplex && (
        <section className="w-full space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">{selectedComplex.socialName || selectedComplex.aliasName}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Panel 1: Filipeta preview */}
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
                  [1,2].map(i => <FilipetaMiniSkeleton key={i} />)
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

            {/* Panel 2: Consumption stats */}
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
                      ) : <p className="text-xs text-muted-foreground">Nenhuma unidade acima de 15 m³</p>}
                    </div>
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
                      ) : <p className="text-xs text-muted-foreground">Todas as unidades tiveram consumo</p>}
                    </div>
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

            {/* Panel 3: Bill summary */}
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
                    <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Valor Total da Conta</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {formatCurrency((billReading as any).totalValue)}
                      </p>
                    </div>
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

// ─── AdminStats hook ──────────────────────────────────────────────────────────
function useAdminStats() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = '/api';
      const res = await fetch(`${base}/admin-stats`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[useAdminStats] API error:', res.status, errData);
        setError(`Erro ${res.status}`);
        setData(null);
      } else {
        const d = await res.json();
        setData(d);
      }
    } catch (e: any) {
      console.error('[useAdminStats] Fetch error:', e);
      setError(e.message || 'Erro de conexão');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

// ─── ComplexDetailPanel ───────────────────────────────────────────────────────
function ComplexDetailPanel({ complex, onBack }: { complex: any; onBack: () => void }) {
  const [statsMonthVal, setStatsMonthVal] = useState(allMonthOptions[0].value);
  const statsMonthOpt = allMonthOptions.find(o => o.value === statsMonthVal)!;

  const { data: statsData, loading: statsLoading } = useMeterReport({
    month: statsMonthOpt.month,
    year: statsMonthOpt.year,
    complexId: complex.id,
    enabled: true,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
        </button>
        <h2 className="text-lg font-semibold">{complex.socialName || complex.aliasName}</h2>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <Home className="w-5 h-5 text-teal-500 mb-1" />
            <p className="text-2xl font-extrabold text-teal-600">{complex.totalApartments ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Apartamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <GaugeCircle className="w-5 h-5 text-orange-500 mb-1" />
            <p className="text-2xl font-extrabold text-orange-600">{complex.totalMeters ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Medidores</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <CalendarCheck2 className="w-5 h-5 text-blue-500 mb-1" />
            <p className="text-lg font-extrabold text-blue-600">{complex.lastReadingLabel ?? 'Sem leitura'}</p>
            <p className="text-xs text-muted-foreground">Última leitura</p>
          </CardContent>
        </Card>
      </div>

      {/* Month selector + consumption table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Consumo — {statsMonthOpt.labelShort}</CardTitle>
          <MonthSelect value={statsMonthVal} onChange={setStatsMonthVal} />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : statsData && statsData.list.length > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {statsData.list.slice(0, 20).map((r: any) => (
                <div key={r.id} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                  <span className="text-muted-foreground">{r.apartment?.block?.name} / {r.apartment?.name}</span>
                  <div className="flex gap-4">
                    {r.consumption > 15 && <span className="text-orange-500 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{r.consumption?.toFixed(1)} m³</span>}
                    {r.consumption === 0 && <span className="text-red-500 font-medium flex items-center gap-1"><Ban className="w-3 h-3" />Zero</span>}
                    {r.consumption > 0 && r.consumption <= 15 && <span className="text-teal-600 font-semibold">{r.consumption?.toFixed(1)} m³</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : statsData && statsData.list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados para {statsMonthOpt.labelShort}</p>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Selecione uma unidade para ver as filipetas.</p>
          )}
          {statsData && statsData.totalCount > 0 && (
            <div className="mt-2 pt-2 border-t flex justify-between items-center text-xs text-muted-foreground">
              <span>{statsData.totalCount} unidade{statsData.totalCount !== 1 ? 's' : ''}</span>
              <Link href="/meter-report" className="text-blue-500 flex items-center gap-1">
                Ver detalhes <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
          {statsData && statsData.list.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados de filipeta para {statsMonthOpt.labelShort}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AdminKPIDashboard ────────────────────────────────────────────────────────
// Exclusivo para o papel "Administrador" (isSystem=true, role=Administrador)
// Exibe panorama geral com KPIs, logins, condomínios mais/menos atualizados
function AdminKPIDashboard() {
  const { data: stats, loading: loadingStats, error: statsError, refetch } = useAdminStats();
  const [selectedComplex, setSelectedComplex] = useState<any>(null);

  if (loadingStats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (statsError && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 text-orange-400" />
        <p className="text-sm">Erro ao carregar dados: {statsError}</p>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar novamente</Button>
      </div>
    );
  }

  if (selectedComplex) {
    return <ComplexDetailPanel complex={selectedComplex} onBack={() => setSelectedComplex(null)} />;
  }

  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Panorama Geral</h2>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Building2 className="w-6 h-6 text-blue-500 mb-1" />, value: stats?.totals?.complexes, label: 'Condomínios', color: 'text-blue-600' },
            { icon: <Home className="w-6 h-6 text-teal-500 mb-1" />, value: stats?.totals?.apartments, label: 'Apartamentos', color: 'text-teal-600' },
            { icon: <Users className="w-6 h-6 text-purple-500 mb-1" />, value: stats?.totals?.users, label: 'Usuários', color: 'text-purple-600' },
            { icon: <GaugeCircle className="w-6 h-6 text-orange-500 mb-1" />, value: stats?.totals?.meters, label: 'Medidores', color: 'text-orange-600' },
          ].map(item => (
            <Card key={item.label}>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
                {item.icon}
                <p className={`text-3xl font-extrabold ${item.color}`}>{item.value ?? '—'}</p>
                <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Users by type + today logins */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" /> Usuários por Perfil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Moradores',     value: stats?.usersByType?.moradores,     color: 'bg-blue-500' },
                { label: 'Síndicos',      value: stats?.usersByType?.sindicos,      color: 'bg-teal-500' },
                { label: 'Administradoras', value: stats?.usersByType?.administradoras, color: 'bg-purple-500' },
                { label: 'Programadores', value: stats?.usersByType?.programadores, color: 'bg-orange-500' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
                  <span className="flex-1 text-muted-foreground">{row.label}</span>
                  <span className="font-semibold">{row.value ?? 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LogIn className="w-4 h-4 text-green-500" /> Logins Hoje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Moradores',     value: stats?.todayLogins?.moradores,     color: 'bg-blue-500' },
                { label: 'Síndicos',      value: stats?.todayLogins?.sindicos,      color: 'bg-teal-500' },
                { label: 'Administradoras', value: stats?.todayLogins?.administradoras, color: 'bg-purple-500' },
                { label: 'Programadores', value: stats?.todayLogins?.programadores, color: 'bg-orange-500' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
                  <span className="flex-1 text-muted-foreground">{row.label}</span>
                  <span className="font-semibold">{row.value ?? 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* 7-day login chart */}
        {stats?.loginsByDay && stats.loginsByDay.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" /> Logins — Últimos 7 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.loginsByDay} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="moradores" name="Moradores" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="sindicos" name="Síndicos" stackId="a" fill="#10b981" />
                  <Bar dataKey="administradoras" name="Administ." stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="programadores" name="Programadores" stackId="a" fill="#f59e0b" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Most/Least updated */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats?.mostUpdated && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Mais atualizado</p>
                  <p className="font-semibold text-sm">{stats.mostUpdated.socialName || stats.mostUpdated.aliasName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Última filipeta: <span className="font-medium text-green-600">{stats.mostUpdated.lastReadingLabel ?? '—'}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats?.leastUpdated && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Menos atualizado</p>
                  <p className="font-semibold text-sm">{stats.leastUpdated.socialName || stats.leastUpdated.aliasName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Última filipeta: <span className="font-medium text-orange-600">{stats.leastUpdated.lastReadingLabel ?? 'Sem leitura'}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats?.mostAccessed && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Mais acessado (30 dias)</p>
                  <p className="font-semibold text-sm">{stats.mostAccessed.socialName || stats.mostAccessed.aliasName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-blue-600">{stats.mostAccessed.accessCount} usuário{stats.mostAccessed.accessCount !== 1 ? 's' : ''}</span> únicos
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {stats?.leastAccessed && (
            <Card className="border-gray-200 bg-gray-50/50">
              <CardContent className="p-4 flex items-start gap-3">
                <TrendingDown className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Menos acessado (30 dias)</p>
                  <p className="font-semibold text-sm">{stats.leastAccessed.socialName || stats.leastAccessed.aliasName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-gray-600">{stats.leastAccessed.accessCount} usuário{stats.leastAccessed.accessCount !== 1 ? 's' : ''}</span> únicos
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Complexes list */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Condomínios</h2>
        </div>
        {stats?.complexes && stats.complexes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {stats.complexes.map((cx: any) => (
              <Card
                key={cx.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedComplex(cx)}
              >
                <CardContent className="p-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{cx.socialName || cx.aliasName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cx.totalApartments} apto{cx.totalApartments !== 1 ? 's' : ''} · {cx.totalMeters} medidor{cx.totalMeters !== 1 ? 'es' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Última leitura: <span className={cx.lastReadingLabel ? 'text-green-600 font-medium' : 'text-orange-500'}>{cx.lastReadingLabel ?? 'Sem leitura'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-blue-500 shrink-0 text-xs">
                    Ver detalhes <ArrowRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mb-3 opacity-30 mx-auto" />
            <p className="text-sm font-medium">Nenhum condomínio cadastrado</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── ProgramadorDashboard ────────────────────────────────────────────────────
// Exclusivo para o papel "Programador" (isSystem=true, role=Programador)
// Exibe atalhos rápidos para as principais operações administrativas
function ProgramadorDashboard() {
  const shortcuts = [
    {
      href: '/users',
      icon: Users,
      label: 'Usuários',
      description: 'Cadastrar / gerenciar usuários',
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      iconColor: 'text-purple-600',
    },
    {
      href: '/complexes',
      icon: Building2,
      label: 'Condomínios',
      description: 'Cadastrar / gerenciar condomínios',
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      href: '/blocks',
      icon: Home,
      label: 'Blocos',
      description: 'Cadastrar / gerenciar blocos',
      color: 'bg-sky-50 border-sky-200 hover:bg-sky-100',
      iconColor: 'text-sky-600',
    },
    {
      href: '/apartments',
      icon: DoorClosed,
      label: 'Apartamentos',
      description: 'Cadastrar / gerenciar unidades',
      color: 'bg-teal-50 border-teal-200 hover:bg-teal-100',
      iconColor: 'text-teal-600',
    },
    {
      href: '/meters',
      icon: GaugeCircle,
      label: 'Medidores',
      description: 'Cadastrar / gerenciar medidores',
      color: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
      iconColor: 'text-orange-600',
    },
    {
      href: '/readings/create',
      icon: Droplets,
      label: 'Subir Leitura',
      description: 'Registrar nova leitura de medidor',
      color: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100',
      iconColor: 'text-cyan-600',
    },
    {
      href: '/dealership-readings/new',
      icon: Receipt,
      label: 'Cadastrar Conta',
      description: 'Lançar conta da concessionária',
      color: 'bg-green-50 border-green-200 hover:bg-green-100',
      iconColor: 'text-green-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-foreground">Acesso Rápido</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {shortcuts.map(({ href, icon: Icon, label, description, color, iconColor }) => (
          <Link key={href} href={href}>
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl border p-5 text-center cursor-pointer transition-all active:scale-95 ${color}`}
            >
              <div className={`w-12 h-12 rounded-full bg-white/70 flex items-center justify-center shadow-sm`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
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

  // ── Role detection ──────────────────────────────────────────────────────────
  // Administrador (isSystem + role='Administrador') → AdminKPIDashboard (panorama KPI)
  // Programador (isSystem + não-Administrador)       → ProgramadorDashboard (atalhos)
  // Síndico / Administradora de empresa              → SindicoDashboard
  // Morador (só apartments)                          → MoradorDashboard
  const isSystem      = context?.isSystem ?? false;
  const isAdministrador = isSystem && (context?.systemRoles ?? []).includes('Administrador');
  // Programador = qualquer usuário system que NÃO seja Administrador (inclui 'Programador', roles sem nome específico, etc.)
  const isProgramador = isSystem && !isAdministrador;
  const isMorador = useMemo(() => {
    if (!context) return false;
    return !context.isSystem
      && context.companyIds.length === 0
      && context.complexes.length === 0
      && context.blocks.length === 0
      && context.apartments.length > 0;
  }, [context]);

  const renderDashboard = () => {
    if (ctxLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      );
    }
    if (isProgramador)    return <ProgramadorDashboard />;
    if (isAdministrador)  return <AdminKPIDashboard />;
    if (isMorador)        return <MoradorDashboard router={router} />;
    return <SindicoDashboard />;   // síndico ou administradora
  };

  return (
    <div className="space-y-8 w-full">
      <div className="space-y-8 container mx-auto md:px-6">
        {renderDashboard()}

        {/* Shared add-meter dialog */}
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
