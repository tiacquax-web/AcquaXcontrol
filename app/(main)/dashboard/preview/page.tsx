"use client";

import {
  Building2, FileText, TrendingUp, Droplets, ChevronRight, Loader2, Eye,
  AlertTriangle, Ban, Receipt, CalendarCheck2, DoorClosed,
  GaugeCircle, Users, BarChart3, Home, Star,
  Activity, ArrowRight, LogIn, TrendingDown, CheckCircle2, Clock, X,
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

import ResidentMonitoringCard from '@/components/dashboard/ResidentMonitoringCard';
import AreaCommonAnnualDashboard from '@/components/dashboard/AreaCommonAnnualDashboard';
import OperationsHealthCard from '@/components/dashboard/OperationsHealthCard';
import { useRolePreview } from '@/contexts/RolePreviewContext';

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
function ConsumoAnualGraph({ apartmentId, complexId }: { apartmentId: string; complexId?: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [chartData, setChartData] = useState<{ month: string; consumption: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAnual, setTotalAnual] = useState<number | null>(null);

  const yearOptions = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => String(currentYear - i)),
  [currentYear]);

  useEffect(() => {
    if (!apartmentId) return;
    setLoading(true);
    setChartData([]);
    setTotalAnual(null);

    const base = '/api';
    const now = new Date();
    const maxMonth = Number(selectedYear) === currentYear ? now.getMonth() + 1 : 12;
    const months = Array.from({ length: maxMonth }, (_, i) => String(i + 1).padStart(2, '0'));

    Promise.all(
      months.map(month =>
        fetch(`${base}/meter-report?month=${month}&year=${selectedYear}&apartment_id=${apartmentId}${complexId ? `&complex_id=${complexId}` : ''}`, {
          credentials: 'include',
        })
          .then(r => r.ok ? r.json() : { list: [] })
          .then(d => {
            const list: MeterReportItem[] = d.list ?? [];
            const total = list.reduce((s, r) => s + (r.consumption ?? 0), 0);
            return { month, consumption: total };
          })
          .catch(() => ({ month, consumption: 0 }))
      )
    ).then(results => {
      const withData = results.filter(r => r.consumption > 0);
      const data = withData.map(r => ({
        month: MONTH_NAMES_SHORT[Number(r.month) - 1],
        consumption: r.consumption,
      }));
      setChartData(data);
      setTotalAnual(data.reduce((s, r) => s + r.consumption, 0));
      setLoading(false);
    });
  }, [apartmentId, selectedYear, currentYear, complexId]);

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
  const { isPreviewing, effectiveContext: previewCtx } = useRolePreview();
  const { context: realCtx, loading: realLoading } = useUserContext();
  const context = isPreviewing ? previewCtx : realCtx;
  const ctxLoading = isPreviewing ? false : realLoading;
  const apartments = context?.apartments ?? [];

  const [selectedMonthVal, setSelectedMonthVal] = useState(allMonthOptions[0].value);
  const selectedMonthOpt = allMonthOptions.find(o => o.value === selectedMonthVal) || allMonthOptions[0];
  const [selectedUtility, setSelectedUtility] = useState<'water' | 'gas' | 'energy'>('water');

  const singleApartment = useMemo(() => {
    if (!context || apartments.length !== 1) return null;
    return apartments[0];
  }, [context, apartments]);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const activeAptId = singleApartment?.id ?? selectedAptId;

  const { data: reportData, loading: reportLoading } = useMeterReport({
    month: selectedMonthOpt.month,
    year: selectedMonthOpt.year,
    apartmentId: activeAptId ?? undefined,
    enabled: !!activeAptId,
  });

  const userReport = reportData?.list?.[0] ?? null;

  if (ctxLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Meu Consumo</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedUtility} onValueChange={(v: any) => setSelectedUtility(v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="water">Água</SelectItem>
              <SelectItem value="gas">Gás</SelectItem>
              <SelectItem value="energy">Energia</SelectItem>
            </SelectContent>
          </Select>
          <MonthSelect value={selectedMonthVal} onChange={setSelectedMonthVal} />
        </div>
      </div>

      {apartments.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {apartments.map((apt: any) => (
            <Button key={apt.id} variant={activeAptId === apt.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedAptId(apt.id)} className="text-xs">
              Bl. {apt.block?.name} · Apto {apt.name}
            </Button>
          ))}
        </div>
      )}

      {activeAptId && (
        <>
          <ResidentMonitoringCard apartmentId={activeAptId} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-500" /> Resumo do Mês — {selectedMonthOpt.labelShort}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
              ) : userReport ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Consumo</p>
                    <p className="text-xl font-bold text-teal-600 mt-0.5">
                      {userReport.consumption?.toFixed(2) ?? '0.00'} {selectedUtility === 'energy' ? 'kWh' : 'm³'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor da Unidade</p>
                    <p className="text-xl font-bold text-blue-600 mt-0.5">{formatCurrency(userReport.totalUnit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Leitura Final</p>
                    <p className="text-base font-semibold mt-1">
                      {userReport.lastReading?.reading?.toFixed(3) ?? '—'} {selectedUtility === 'energy' ? 'kWh' : 'm³'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Link href={`/apartment-report/${userReport.id}`}>
                      <Button size="sm" className="gap-1.5 text-xs">Ver Filipeta Completa <ChevronRight className="w-3.5 h-3.5" /></Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <Droplets className="w-8 h-8 mx-auto mb-2 opacity-30 text-teal-500" />
                  <p>Nenhum relatório de {selectedUtility === 'water' ? 'água' : selectedUtility === 'gas' ? 'gás' : 'energia'} fechado para {selectedMonthOpt.labelShort}.</p>
                </div>
              )}
            </CardContent>
          </Card>
          <ConsumoAnualGraph apartmentId={activeAptId} complexId={apartments.find((a: any) => a.id === activeAptId)?.block?.complexId} />
          <AreaCommonAnnualDashboard complexId={apartments.find((a: any) => a.id === activeAptId)?.block?.complexId} />
        </>
      )}
    </div>
  );
}

// ─── GLStatusCard ─────────────────────────────────────────────────────────────
function GLStatusCard({ complexId }: { complexId: string }) {
  const [status, setStatus] = useState<{ lastImport: string | null; daysSince: number | null; hasGL: boolean; loading: boolean }>({
    lastImport: null,
    daysSince: null,
    hasGL: false,
    loading: true,
  });

  useEffect(() => {
    if (!complexId) return;
    setStatus(s => ({ ...s, loading: true }));
    fetch(`/api/gl-status?complexId=${complexId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setStatus({
          lastImport: data.lastImport ?? null,
          daysSince: data.daysSince ?? null,
          hasGL: data.hasGL ?? false,
          loading: false,
        });
      })
      .catch(() => setStatus({ lastImport: null, daysSince: null, hasGL: false, loading: false }));
  }, [complexId]);

  if (!status.loading && !status.hasGL) return null;
  if (status.loading) return null;

  const days = status.daysSince;
  const isStale = days !== null && days > 3;
  const isWarning = days !== null && days > 1 && days <= 3;
  const isOk = days !== null && days <= 1;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" /> Status das Leituras Automáticas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status.lastImport ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {isOk && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {isWarning && <Clock className="w-5 h-5 text-amber-500" />}
              {isStale && <AlertTriangle className="w-5 h-5 text-red-500" />}
              <span className={`text-sm font-medium ${isOk ? 'text-green-600' : isWarning ? 'text-amber-600' : 'text-red-600'}`}>
                {isOk ? 'Atualizado' : isWarning ? `${days} dias sem nova leitura` : `${days} dias sem receber dados`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Última leitura recebida: {status.lastImport}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-gray-400" /><span className="text-sm text-muted-foreground">Sem leituras automáticas registradas</span></div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── BlockComparisonCard ──────────────────────────────────────────────────────
function BlockComparisonCard({ complexId, month, year }: { complexId: string; month: string; year: string }) {
  const [data, setData] = useState<{ blocks: any[]; loading: boolean }>({ blocks: [], loading: true });

  useEffect(() => {
    if (!complexId) return;
    setData(s => ({ ...s, loading: true }));
    fetch(`/api/block-comparison?complexId=${complexId}&month=${month}&year=${year}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData({ blocks: d.blocks ?? [], loading: false }))
      .catch(() => setData({ blocks: [], loading: false }));
  }, [complexId, month, year]);

  if (data.loading) return <Card><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>;

  const maxConsumption = Math.max(...data.blocks.map(b => b.totalConsumption), 1);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Comparativo entre Blocos</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data.blocks.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Sem dados para este período</p> : 
          data.blocks.map((block) => (
            <div key={block.blockName} className="space-y-1">
              <div className="flex items-center justify-between text-xs"><span className="font-medium">{block.blockName}</span><span className="text-muted-foreground">{block.totalConsumption.toFixed(1)} m³ / {block.unitCount} un.</span></div>
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(block.totalConsumption / maxConsumption) * 100}%` }} /></div>
            </div>
          ))
        }
      </CardContent>
    </Card>
  );
}

// ─── SindicoDashboard ─────────────────────────────────────────────────────────
function SindicoDashboard() {
  const { isPreviewing, effectiveContext: previewCtx } = useRolePreview();
  const { context: realCtx, loading: realLoading } = useUserContext();
  const context = isPreviewing ? previewCtx : realCtx;
  const ctxLoading = isPreviewing ? false : realLoading;

  const complexes = useMemo(() => {
    if (!context) return [];
    const map = new Map<string, any>();
    context.complexes.forEach((c: any) => map.set(c.id, c));
    context.apartments.forEach((a: any) => {
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
    take: 100,
  });

  const billReading = useMemo(() => {
    if (!dealershipReadings?.length) return null;
    return dealershipReadings.find(
      dr => String(dr.monthRef).padStart(2, '0') === billMonthOpt.month && String(dr.yearRef) === billMonthOpt.year
    ) ?? null;
  }, [dealershipReadings, billMonthOpt]);

  const highConsumptionUnits = useMemo(() => statsData?.list.filter((r: any) => (r.consumption ?? 0) > 15) ?? [], [statsData]);
  const zeroConsumptionUnits = useMemo(() => statsData?.list.filter((r: any) => (r.consumption ?? 0) === 0) ?? [], [statsData]);
  const totalConsumption = useMemo(() => filipetaData?.list.reduce((s: number, r: any) => s + (r.consumption ?? 0), 0) ?? null, [filipetaData]);
  const totalValue = useMemo(() => filipetaData?.list.reduce((s: number, r: any) => s + (r.totalUnit ?? 0), 0) ?? null, [filipetaData]);

  if (ctxLoading) return <div className="space-y-3"><Skeleton className="h-6 w-48" /><div className="flex gap-2 flex-wrap">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-32" />)}</div></div>;

  return (
    <>
      {complexes.length > 0 ? (
        <section className="w-full space-y-3">
          <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /><h2 className="text-lg font-semibold">Meus Condomínios</h2></div>
          <div className="flex gap-2 flex-wrap">
            {complexes.map((cx: any, idx: number) => (
              <Button key={cx.id} variant={selectedComplexIdx === idx ? 'default' : 'outline'} size="sm" onClick={() => setSelectedComplexIdx(idx)} className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{cx.socialName || cx.aliasName}</Button>
            ))}
          </div>
        </section>
      ) : (
        <section className="w-full py-12 flex flex-col items-center text-muted-foreground"><Building2 className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm font-medium">Nenhum condomínio encontrado</p></section>
      )}

      {selectedComplex && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
          <GLStatusCard complexId={selectedComplex.id} />
          <BlockComparisonCard complexId={selectedComplex.id} month={statsMonthOpt.month} year={statsMonthOpt.year} />
        </div>
      )}

      {selectedComplex && (
        <section className="w-full space-y-4 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /> Filipetas</CardTitle><MonthSelect value={filipetaMonthVal} onChange={setFilipetaMonthVal} /></CardHeader>
              <CardContent className="flex-1 overflow-y-auto max-h-[520px] space-y-3 pr-1">
                {loadingFilipetas ? [1,2].map(i => <FilipetaMiniSkeleton key={i} />) : filipetaData && filipetaData.list.length > 0 ? 
                  <>{filipetaData.list.slice(0, 5).map((r: any) => <FilipetaMiniCard key={r.id} report={r} />)}{filipetaData.list.length > 5 && <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">+{filipetaData.list.length - 5} unidades <ChevronRight className="w-3 h-3" /></Link>}</> : 
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-teal-500" /> Resumo de Consumo</CardTitle><MonthSelect value={statsMonthVal} onChange={setStatsMonthVal} /></CardHeader>
              <CardContent className="space-y-4">
                {loadingStats ? <Skeleton className="h-32 w-full" /> : statsData && statsData.list.length > 0 ? 
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border p-3 text-center"><p className="text-[10px] text-muted-foreground mb-1">Consumo Total</p><p className="text-xl font-bold text-teal-600">{totalConsumption?.toFixed(2)} <span className="text-xs font-normal">m³</span></p></div>
                      <div className="rounded-xl border p-3 text-center"><p className="text-[10px] text-muted-foreground mb-1">Total Arrecadado</p><p className="text-lg font-bold text-blue-600">{formatCurrency(totalValue)}</p></div>
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3"><p className="text-xs font-semibold text-orange-700">Consumo {'>'} 15 m³ — {highConsumptionUnits.length} un.</p></div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-700">Sem consumo — {zeroConsumptionUnits.length} un.</p></div>
                  </> : <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2"><CardTitle className="text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-purple-500" /> Conta Concessionária</CardTitle><MonthSelect value={billMonthVal} onChange={setBillMonthVal} /></CardHeader>
              <CardContent>
                {loadingBill ? <Skeleton className="h-32 w-full" /> : billReading ? 
                  <div className="space-y-4"><div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center"><p className="text-xs text-muted-foreground mb-1">Valor Total</p><p className="text-2xl font-bold text-purple-700">{formatCurrency((billReading as any).totalValue)}</p></div></div> : 
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem conta registrada</p>}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </>
  );
}

// ─── useAdminStats hook ──────────────────────────────────────────────────────────
function useAdminStats() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin-stats', { credentials: 'include' });
      if (!res.ok) setError(`Erro ${res.status}`);
      else setData(await res.json());
    } catch (e: any) { setError(e.message || 'Erro de conexão'); }
    finally { setLoading(false); }
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
      <div className="flex items-center gap-3"><button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ChevronRight className="w-4 h-4 rotate-180" /> Voltar</button><h2 className="text-lg font-semibold">{complex.socialName || complex.aliasName}</h2></div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex flex-col items-center text-center gap-1"><Home className="w-5 h-5 text-teal-500 mb-1" /><p className="text-2xl font-extrabold text-teal-600">{complex.totalApartments ?? '—'}</p><p className="text-xs text-muted-foreground">Apartamentos</p></CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col items-center text-center gap-1"><GaugeCircle className="w-5 h-5 text-orange-500 mb-1" /><p className="text-2xl font-extrabold text-orange-600">{complex.totalMeters ?? '—'}</p><p className="text-xs text-muted-foreground">Medidores</p></CardContent></Card>
      </div>
      <AreaCommonAnnualDashboard complexId={complex.id} complexName={complex.socialName || complex.aliasName} />
    </div>
  );
}

// ─── AdminKPIDashboard ────────────────────────────────────────────────────────
function AdminKPIDashboard() {
  const { data: stats, loading: loadingStats, error: statsError, refetch } = useAdminStats();
  const [selectedComplex, setSelectedComplex] = useState<any>(null);
  if (loadingStats) return <div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div></div>;
  if (statsError && !stats) return <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"><AlertTriangle className="w-8 h-8 text-orange-400" /><p>Erro: {statsError}</p><Button variant="outline" size="sm" onClick={refetch}>Tentar novamente</Button></div>;
  if (selectedComplex) return <ComplexDetailPanel complex={selectedComplex} onBack={() => setSelectedComplex(null)} />;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Building2 className="w-6 h-6 text-blue-500 mb-1" />, value: stats?.totals?.complexes, label: 'Condomínios', color: 'text-blue-600' },
          { icon: <Home className="w-6 h-6 text-teal-500 mb-1" />, value: stats?.totals?.apartments, label: 'Apartamentos', color: 'text-teal-600' },
          { icon: <Users className="w-6 h-6 text-purple-500 mb-1" />, value: stats?.totals?.users, label: 'Usuários', color: 'text-purple-600' },
          { icon: <GaugeCircle className="w-6 h-6 text-orange-500 mb-1" />, value: stats?.totals?.meters, label: 'Medidores', color: 'text-orange-600' },
        ].map(item => (
          <Card key={item.label}><CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">{item.icon}<p className={`text-3xl font-extrabold ${item.color}`}>{item.value ?? '—'}</p><p className="text-xs text-muted-foreground font-medium">{item.label}</p></CardContent></Card>
        ))}
      </div>
      <OperationsHealthCard />
      <section className="space-y-4">
        <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /><h2 className="text-lg font-semibold">Condomínios</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {stats?.complexes?.map((cx: any) => (
            <Card key={cx.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedComplex(cx)}>
              <CardContent className="p-4 flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-semibold text-sm truncate">{cx.socialName || cx.aliasName}</p><p className="text-xs text-muted-foreground mt-0.5">{cx.totalApartments} apto{cx.totalApartments !== 1 ? 's' : ''}</p></div>
                <ArrowRight className="w-4 h-4 text-blue-500 shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Preview Page Component ──────────────────────────────────────────────────
export default function PreviewPage() {
  const router = useRouter();
  const { isPreviewing, previewRole, setPreviewRole, canPreview } = useRolePreview();
  const { context, loading } = useUserContext();

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-8 container mx-auto md:px-6 py-8">
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-blue-600 fill-blue-600" />
            <CardTitle className="text-sm font-bold text-blue-900">Página de Preview Direta</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-blue-700 uppercase tracking-wider">Visualizar como:</span>
            <Select value={previewRole} onValueChange={(v) => setPreviewRole(v as any)}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-white border-blue-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="real">Meu Perfil Real</SelectItem>
                <SelectItem value="administrador">Administrador Master</SelectItem>
                <SelectItem value="administradora">Administradora</SelectItem>
                <SelectItem value="sindico">Síndico</SelectItem>
                <SelectItem value="morador">Morador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {previewRole === 'administrador' ? <AdminKPIDashboard /> :
       previewRole === 'morador' ? <MoradorDashboard router={router} /> :
       previewRole === 'sindico' ? <SindicoDashboard /> :
       <AdminKPIDashboard />}
    </div>
  );
}
