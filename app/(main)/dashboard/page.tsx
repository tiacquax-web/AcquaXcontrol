'use client';

import {
  Building2, FileText, TrendingUp, Droplets, ChevronRight, Loader2,
  AlertTriangle, Ban, Receipt, CalendarCheck2, Building, DoorClosed,
  GaugeCircle, Users, BarChart3, Home, CheckCircle2, Clock,
  ArrowRight, Activity, LogIn, Star, TrendingDown,
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
import { useMeterReport, MeterReportItem } from "@/hooks/useMeterReport";
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

// ─── ConsumoAnualGraph ────────────────────────────────────────────────────────
// Mostra consumo mensal em m³ para o ano selecionado.
// Apenas meses com dados aparecem; seletor de ano auto-seleciona o corrente.
function ConsumoAnualGraph({ apartmentId }: { apartmentId: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [chartData, setChartData] = useState<{ month: string; consumption: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAnual, setTotalAnual] = useState<number | null>(null);

  // Available years: current and up to 3 previous
  const yearOptions = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => String(currentYear - i));
  }, [currentYear]);

  useEffect(() => {
    if (!apartmentId) return;
    setLoading(true);
    setChartData([]);
    setTotalAnual(null);

    const base = process.env.NEXT_PUBLIC_API_URL;
    // Only fetch months up to current month for the current year
    const now = new Date();
    const maxMonth = Number(selectedYear) === currentYear ? now.getMonth() + 1 : 12;
    const months = Array.from({ length: maxMonth }, (_, i) => String(i + 1).padStart(2, '0'));

    Promise.all(
      months.map(month =>
        fetch(`${base}/meter-report?month=${month}&year=${selectedYear}&apartment_id=${apartmentId}`, {
          credentials: 'include',
        })
          .then(r => r.ok ? r.json() : { list: [] })
          .then(d => {
            const list: MeterReportItem[] = d.list ?? [];
            // Sum consumption of all reports for this apartment in this month
            const total = list.reduce((s, r) => s + (r.consumption ?? 0), 0);
            return { month, consumption: total };
          })
          .catch(() => ({ month, consumption: 0 }))
      )
    ).then(results => {
      // Only include months that have data (consumption > 0)
      const withData = results.filter(r => r.consumption > 0);
      const data = withData.map(r => ({
        month: MONTH_NAMES_SHORT[Number(r.month) - 1],
        consumption: r.consumption,
      }));
      setChartData(data);
      setTotalAnual(data.reduce((s, r) => s + r.consumption, 0));
      setLoading(false);
    });
  }, [apartmentId, selectedYear, currentYear]);

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
        <div className="flex items-center gap-2">
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
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
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
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-cyan-400"/>Baixo consumo</span>
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

  // Single apartment (most common case)
  const singleApartment = useMemo(() => {
    if (!context || apartments.length !== 1) return null;
    return apartments[0];
  }, [context, apartments]);

  // Selected apartment when multiple
  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const activeAptId = singleApartment?.id ?? selectedAptId;

  // ── Filipeta preview state (last 3 months) ──
  const [filipetasByMonth, setFilipetasByMonth] = useState<Record<string, MeterReportItem[]>>({});
  const [loadingFilipetas, setLoadingFilipetas] = useState(false);

  const last3 = useMemo(() => Array.from({ length: 3 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return {
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear()),
      label: format(d, 'MMM/yyyy', { locale: ptBR }),
    };
  }), []);

  useEffect(() => {
    if (ctxLoading || apartments.length === 0 || !activeAptId) return;
    setLoadingFilipetas(true);
    const base = process.env.NEXT_PUBLIC_API_URL;
    Promise.all(
      last3.map(m =>
        fetch(`${base}/meter-report?month=${m.month}&year=${m.year}&apartment_id=${activeAptId}`, { credentials: 'include' })
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
  }, [ctxLoading, apartments.length, activeAptId]);

  if (ctxLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Gráfico de consumo anual ── */}
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

        {/* Multiple apartments selector */}
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

        {/* No apartment */}
        {apartments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum apartamento vinculado à sua conta.
          </div>
        )}

        {/* Graph */}
        {activeAptId ? (
          <ConsumoAnualGraph apartmentId={activeAptId} />
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
            <h2 className="text-lg font-semibold">Filipetas — últimos 3 meses</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/meter-report" className="flex items-center gap-1">Ver todas <ChevronRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {!activeAptId && apartments.length > 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Selecione uma unidade para ver as filipetas.</p>
        ) : loadingFilipetas ? (
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
    </div>
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
      const base = process.env.NEXT_PUBLIC_API_URL;
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

  const { data: statsData, loading: loadingStats } = useMeterReport({
    month: statsMonthOpt.month,
    year: statsMonthOpt.year,
    complexId: complex.id,
    enabled: !!complex.id,
  });

  const highConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) > 15) ?? [], [statsData]);
  const zeroConsumptionUnits = useMemo(() =>
    statsData?.list.filter(r => (r.consumption ?? 0) === 0) ?? [], [statsData]);
  const totalConsumption = useMemo(() =>
    statsData?.list.reduce((s, r) => s + (r.consumption ?? 0), 0) ?? null, [statsData]);
  const totalValue = useMemo(() =>
    statsData?.list.reduce((s, r) => s + (r.totalUnit ?? 0), 0) ?? null, [statsData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Voltar ao panorama
        </Button>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">{complex.socialName || complex.aliasName}</h2>
        </div>
        {complex.lastReadingLabel && (
          <Badge variant="secondary" className="text-xs">
            Última leitura: {complex.lastReadingLabel}
          </Badge>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Home className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{complex.totalApartments ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Apartamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="w-5 h-5 text-teal-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{complex.totalMeters ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Medidores</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            {complex.lastReadingDate ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
            ) : (
              <Clock className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            )}
            <p className="text-sm font-bold">{complex.lastReadingLabel ?? 'Sem leitura'}</p>
            <p className="text-xs text-muted-foreground">Última filipeta</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalConsumption !== null ? `${totalConsumption.toFixed(1)}` : '—'}</p>
            <p className="text-xs text-muted-foreground">m³ ({statsMonthOpt.labelShort})</p>
          </CardContent>
        </Card>
      </div>

      {/* Consumption stats for selected month */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
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
              {/* Per-unit table */}
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
                    {statsData.list.slice(0, 8).map(r => (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-3 py-1.5">Bl.{r.apartment?.block?.name} · {r.apartment?.name}</td>
                        <td className="px-3 py-1.5 text-right text-teal-600 font-medium">{r.consumption?.toFixed(3) ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(r.totalUnit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {statsData.list.length > 8 && (
                <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                  Ver todas as {statsData.totalCount} unidades <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de filipeta para {statsMonthOpt.labelShort}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AdminDashboard ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const { data: stats, loading: loadingStats, error: statsError } = useAdminStats();
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

  // If a complex is selected, show its detail view
  if (statsError && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 text-orange-400" />
        <p className="text-sm">Erro ao carregar dados: {statsError}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    );
  }

  // If a complex is selected, show its detail view
  if (selectedComplex) {
    return <ComplexDetailPanel complex={selectedComplex} onBack={() => setSelectedComplex(null)} />;
  }

  return (
    <div className="space-y-8">
      {/* ── Panorama geral ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Panorama Geral</h2>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
              <Building2 className="w-6 h-6 text-blue-500 mb-1" />
              <p className="text-3xl font-extrabold text-blue-600">{stats?.totals?.complexes ?? '—'}</p>
              <p className="text-xs text-muted-foreground font-medium">Condomínios</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
              <Home className="w-6 h-6 text-teal-500 mb-1" />
              <p className="text-3xl font-extrabold text-teal-600">{stats?.totals?.apartments ?? '—'}</p>
              <p className="text-xs text-muted-foreground font-medium">Apartamentos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
              <Users className="w-6 h-6 text-purple-500 mb-1" />
              <p className="text-3xl font-extrabold text-purple-600">{stats?.totals?.users ?? '—'}</p>
              <p className="text-xs text-muted-foreground font-medium">Usuários</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
              <GaugeCircle className="w-6 h-6 text-orange-500 mb-1" />
              <p className="text-3xl font-extrabold text-orange-600">{stats?.totals?.meters ?? '—'}</p>
              <p className="text-xs text-muted-foreground font-medium">Medidores</p>
            </CardContent>
          </Card>
        </div>

        {/* Users by type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />
              Usuários por Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Moradores', value: stats?.usersByType?.moradores, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
                { label: 'Síndicos', value: stats?.usersByType?.sindicos, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
                { label: 'Administradoras', value: stats?.usersByType?.administradoras, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
                { label: 'Programadores', value: stats?.usersByType?.programadores, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl p-3 text-center ${item.color}`}>
                  <p className="text-2xl font-bold">{item.value ?? 0}</p>
                  <p className="text-xs font-medium mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Today's logins */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LogIn className="w-4 h-4 text-green-500" />
              Logins de Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Moradores', value: stats?.todayLogins?.moradores, icon: '🏠' },
                { label: 'Síndicos', value: stats?.todayLogins?.sindicos, icon: '🔑' },
                { label: 'Administradoras', value: stats?.todayLogins?.administradoras, icon: '🏢' },
                { label: 'Programadores', value: stats?.todayLogins?.programadores, icon: '💻' },
              ].map(item => (
                <div key={item.label} className="rounded-xl border p-3 text-center">
                  <p className="text-xl mb-0.5">{item.icon}</p>
                  <p className="text-2xl font-bold">{item.value ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Logins dos últimos 7 dias */}
        {stats?.loginsByDay && stats.loginsByDay.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                Logins — últimos 7 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.loginsByDay} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="moradores" name="Moradores" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
                  <Bar dataKey="sindicos" name="Síndicos" stackId="a" fill="#14b8a6" radius={[0,0,0,0]} />
                  <Bar dataKey="administradoras" name="Administradoras" stackId="a" fill="#a855f7" radius={[0,0,0,0]} />
                  <Bar dataKey="programadores" name="Programadores" stackId="a" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Most/least updated */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Condomínio mais atualizado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.mostUpdated ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.mostUpdated.socialName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Última filipeta: <span className="font-medium text-green-600">{stats.mostUpdated.lastReadingLabel ?? '—'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.mostUpdated.totalApartments} aptos · {stats.mostUpdated.totalMeters} medidores</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedComplex(stats.mostUpdated)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>}
            </CardContent>
          </Card>

          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <Clock className="w-4 h-4" />
                Condomínio menos atualizado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.leastUpdated ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.leastUpdated.socialName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Última filipeta: <span className="font-medium text-orange-600">{stats.leastUpdated.lastReadingLabel ?? 'Sem leitura'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.leastUpdated.totalApartments} aptos · {stats.leastUpdated.totalMeters} medidores</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedComplex(stats.leastUpdated)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>}
            </CardContent>
          </Card>
        </div>

        {/* Most/least accessed condominiums */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Star className="w-4 h-4" />
                Condomínio mais acessado (30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.mostAccessed ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.mostAccessed.socialName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-blue-600">{stats.mostAccessed.accessCount ?? 0} usuário{(stats.mostAccessed.accessCount ?? 0) !== 1 ? 's' : ''}</span> acessaram nos últimos 30 dias
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.mostAccessed.totalApartments} aptos</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedComplex(stats.mostAccessed)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem acessos registrados</p>}
            </CardContent>
          </Card>

          <Card className="border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <TrendingDown className="w-4 h-4" />
                Condomínio menos acessado (30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.leastAccessed ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{stats.leastAccessed.socialName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-gray-600 dark:text-gray-400">{stats.leastAccessed.accessCount ?? 0} usuário{(stats.leastAccessed.accessCount ?? 0) !== 1 ? 's' : ''}</span> acessaram nos últimos 30 dias
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.leastAccessed.totalApartments} aptos</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedComplex(stats.leastAccessed)}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>}
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* ── Lista de condomínios ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Selecionar Condomínio</h2>
          <span className="text-xs text-muted-foreground ml-1">(clique para ver detalhes)</span>
        </div>

        {stats?.complexes && stats.complexes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.complexes.map((cx: any) => (
              <Card
                key={cx.id}
                className="cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                onClick={() => setSelectedComplex(cx)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                      <p className="font-semibold text-sm truncate">{cx.socialName || cx.aliasName}</p>
                    </div>
                    {cx.lastReadingLabel ? (
                      <Badge variant="secondary" className="text-[10px] shrink-0">{cx.lastReadingLabel}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-orange-500 border-orange-300">Sem leitura</Badge>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Home className="w-3 h-3" />{cx.totalApartments} aptos</span>
                    <span className="flex items-center gap-1"><GaugeCircle className="w-3 h-3" />{cx.totalMeters} medidores</span>
                  </div>
                  <div className="text-xs text-blue-500 flex items-center gap-1 mt-1">
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
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : isMorador ? (
          <MoradorDashboard router={router} />
        ) : (
          <AdminDashboard />
        )}

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
