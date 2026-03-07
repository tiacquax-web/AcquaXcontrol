'use client';

import EnhancedCarousel from "@/components/services-carousel";
import { DatePickerComponent } from "@/components/date-picker";
import {
  Gavel, Hammer, Layers, Paintbrush, Shield, ShieldCheck, Wrench, Plus,
  Building2, FileText, TrendingUp, Droplets, ChevronRight, Loader2
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { clearCachedPermissions } from '@/lib/permissions-cache';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import ReadingsGraph from '@/components/ReadingsGraph';
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
import MeterReportCard from "@/components/MeterReportCard";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── static data ────────────────────────────────────────────────────────────
const itemsList = [
  { footer: "Garantidora", content: <Shield className="mt-5" /> },
  { footer: "Pintura", content: <Paintbrush className="mt-5" /> },
  { footer: "Advogado", content: <Gavel className="mt-5" /> },
  { footer: "Seguros", content: <ShieldCheck className="mt-5" /> },
  { footer: "Gesso e Drywall", content: <Layers className="mt-5" /> },
  { footer: "Construção Civil", content: <Hammer className="mt-5" /> },
  { footer: <p className="text-center text-sm">Manutenção de Ar&nbsp;Condicionado</p>, content: <Wrench className="mt-5" /> },
];

const bannersList = [
  {
    footer: <p className="text-center pt-2 w-full">Veja o que está acontecendo em Vila Velha neste momento</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image src="/news/vila-velha-4k-2.jpeg" sizes="100vw" className="object-cover object-center transition-transform hover:scale-105" fill priority alt="Banner 1" quality={100} unoptimized />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Corpo de Bombeiros lança nota técnica sobre segurança em edificações</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image src="/news/banner4.jpg" sizes="100vw" className="object-cover object-center transition-transform hover:scale-105" fill quality={100} alt="Banner 4" />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Conheça as novas regras para a instalação de gás em condomínios</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image src="/news/banner5.jpg" sizes="100vw" className="object-cover transition-transform hover:scale-105" fill quality={85} alt="Banner 5" />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Aprenda a economizar água e energia em seu condomínio</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image src="/news/banner6.jpg" sizes="100vw" className="object-cover transition-transform hover:scale-105" fill quality={85} alt="Banner 6" />
      </Link>
    ),
  },
];

// ─── helpers ────────────────────────────────────────────────────────────────
const defaultFromDate = new Date(new Date().setDate(new Date().getDate() - 30));
const currentDay = new Date();

function last3Months() {
  return [0, 1, 2].map(i => {
    const d = subMonths(new Date(), i);
    return {
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear()),
      label: format(d, 'MMM/yyyy', { locale: ptBR }),
    };
  });
}

// ─── small sub-components ───────────────────────────────────────────────────

/** Mini filipeta preview card used in dashboard previews */
function FilipetaMiniCard({ report }: { report: MeterReportItem }) {
  const apt = report.apartment;
  const cx = apt?.block?.complex as any;
  const block = apt?.block as any;
  const formatCurrency = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

  const monthLabel = report.monthRef
    ? format(new Date(Number(report.yearRef), Number(report.monthRef) - 1), 'MMM/yyyy', { locale: ptBR })
    : `${report.monthRef}/${report.yearRef}`;

  return (
    <Link href="/meter-report">
      <div className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer bg-background">
        {/* header */}
        <div className="bg-blue-600 text-white px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold truncate">{cx?.socialName || 'Condomínio'}</span>
          <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0 shrink-0">{monthLabel}</Badge>
        </div>
        {/* unit */}
        <div className="px-3 py-1 border-b text-xs text-muted-foreground flex gap-3">
          <span>Bl. {block?.name}</span>
          <span>Apto {apt?.name}</span>
        </div>
        {/* photo + values */}
        <div className="flex gap-0">
          {report.lastReading?.urlCover ? (
            <div className="relative w-20 h-20 shrink-0 border-r">
              <Image src={report.lastReading.urlCover} alt="medidor" fill className="object-cover" sizes="80px" />
            </div>
          ) : (
            <div className="w-20 h-20 shrink-0 border-r bg-gray-100 flex items-center justify-center">
              <Droplets className="w-6 h-6 text-gray-400" />
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

/** Loading skeleton for mini cards */
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

// ─── Morador dashboard section ───────────────────────────────────────────────
function MoradorDashboard({
  dateRange, setDateRange, preferredMeters, loadingPreferences,
  addDialogOpen, setAddDialogOpen, handleRemovePreference, router,
}: any) {
  const { context, loading: ctxLoading } = useUserContext();
  const months = useMemo(() => last3Months(), []);

  // For moradores: gather apartment IDs and complexes
  const apartments = context?.apartments ?? [];
  const uniqueComplexIds = useMemo(() => (
    [...new Set(apartments.map(a => a.block?.complex?.id).filter(Boolean))]
  ), [apartments]) as string[];

  // Fetch last 3 months of filipetas for each complex the morador belongs to
  const [filipetasByMonth, setFilipetasByMonth] = useState<Record<string, MeterReportItem[]>>({});
  const [loadingFilipetas, setLoadingFilipetas] = useState(false);

  useEffect(() => {
    if (ctxLoading || apartments.length === 0) return;
    // We'll fetch month by month for the first complex (simplest case)
    // Full logic handles multiple complexes too
    const apartmentIds = apartments.map(a => a.id);
    setLoadingFilipetas(true);

    // Fetch last 3 months in parallel using the API directly
    const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;
    Promise.all(
      months.map(m =>
        fetch(`${NEXT_PUBLIC_API_URL}/meter-report?month=${m.month}&year=${m.year}`, {
          credentials: 'include',
        })
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
      {/* ── Graph section ── */}
      <section className="w-full">
        <div className="flex justify-center gap-3 md:justify-start md:gap-2 md:w-full items-center mb-4">
          <DatePickerComponent
            isRangeable
            quickSelectDays={[7, 15, 30, 90]}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
          <Button variant="default" onClick={() => router.push('/readings')}>Ver mais</Button>
        </div>
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          {loadingPreferences ? (
            [1, 2].map(i => (
              <Card key={i} className="h-[320px]">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-[200px] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))
          ) : (
            preferredMeters.map((meterId: string) => (
              <ReadingsGraph
                key={meterId}
                meterId={meterId}
                dateRange={dateRange}
                detailsModalAvailable
                onRemove={handleRemovePreference}
              />
            ))
          )}
          {!loadingPreferences && (
            <Card
              className="flex items-center justify-center min-h-[180px] cursor-pointer border-dashed border-2 border-primary hover:bg-accent/40 transition-colors"
              onClick={() => setAddDialogOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center w-full h-full p-8">
                <Plus className="w-10 h-10 text-primary" />
                <span className="mt-2 text-primary font-medium">Adicionar Medidor</span>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ── Filipeta preview section ── */}
      <section className="w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Filipetas dos últimos 3 meses</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/meter-report" className="flex items-center gap-1">
              Ver todas <ChevronRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        {loadingFilipetas ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <FilipetaMiniSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {months.map(m => {
              const key = `${m.month}-${m.year}`;
              const items = filipetasByMonth[key] ?? [];
              if (items.length === 0) {
                return (
                  <div key={key} className="border rounded-xl p-4 flex flex-col items-center justify-center text-muted-foreground text-sm min-h-[120px]">
                    <span className="font-medium capitalize mb-1">{m.label}</span>
                    <span className="text-xs">Sem dados</span>
                  </div>
                );
              }
              return items.map(r => <FilipetaMiniCard key={r.id} report={r} />);
            })}
          </div>
        )}
      </section>
    </>
  );
}

// ─── Admin/Síndico dashboard section ────────────────────────────────────────
function AdminDashboard({
  dateRange, setDateRange, preferredMeters, loadingPreferences,
  addDialogOpen, setAddDialogOpen, handleRemovePreference, router,
}: any) {
  const { context, loading: ctxLoading } = useUserContext();
  const months = useMemo(() => last3Months(), []);

  // All complexes accessible to this admin
  const complexes = useMemo(() => {
    if (!context) return [];
    // Union from directly assigned complexes + via apartments
    const map = new Map<string, any>();
    context.complexes.forEach(c => map.set(c.id, c));
    context.apartments.forEach(a => {
      const cx = a.block?.complex;
      if (cx && !map.has(cx.id)) map.set(cx.id, cx);
    });
    return Array.from(map.values());
  }, [context]);

  const [selectedComplexIdx, setSelectedComplexIdx] = useState(0);
  const selectedComplex = complexes[selectedComplexIdx] ?? null;

  // Latest month filipetas for selected complex
  const latestMonth = months[0];
  const {
    data: filipetaData,
    loading: loadingFilipetas,
  } = useMeterReport({
    month: latestMonth.month,
    year: latestMonth.year,
    complexId: selectedComplex?.id,
    enabled: !!selectedComplex?.id,
  });

  // Total consumption summary for latest month
  const totalConsumption = useMemo(() => {
    if (!filipetaData?.list) return null;
    return filipetaData.list.reduce((sum, r) => sum + (r.consumption ?? 0), 0);
  }, [filipetaData]);

  const totalValue = useMemo(() => {
    if (!filipetaData?.list) return null;
    return filipetaData.list.reduce((sum, r) => sum + (r.totalUnit ?? 0), 0);
  }, [filipetaData]);

  const formatCurrency = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

  return (
    <>
      {/* ── Condomínios summary ── */}
      {!ctxLoading && complexes.length > 0 && (
        <section className="w-full">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Meus Condomínios</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {complexes.map((cx, idx) => (
              <Button
                key={cx.id}
                variant={selectedComplexIdx === idx ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedComplexIdx(idx)}
                className="flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                {cx.socialName || cx.aliasName}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ── Graph section ── */}
      <section className="w-full">
        <div className="flex justify-center gap-3 md:justify-start md:gap-2 md:w-full items-center mb-4">
          <DatePickerComponent
            isRangeable
            quickSelectDays={[7, 15, 30, 90]}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
          <Button variant="default" onClick={() => router.push('/readings')}>Ver mais</Button>
        </div>
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          {loadingPreferences ? (
            [1, 2].map(i => (
              <Card key={i} className="h-[320px]">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-[200px] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))
          ) : (
            preferredMeters.map((meterId: string) => (
              <ReadingsGraph
                key={meterId}
                meterId={meterId}
                dateRange={dateRange}
                detailsModalAvailable
                onRemove={handleRemovePreference}
              />
            ))
          )}
          {!loadingPreferences && (
            <Card
              className="flex items-center justify-center min-h-[180px] cursor-pointer border-dashed border-2 border-primary hover:bg-accent/40 transition-colors"
              onClick={() => setAddDialogOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center w-full h-full p-8">
                <Plus className="w-10 h-10 text-primary" />
                <span className="mt-2 text-primary font-medium">Adicionar Medidor</span>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ── Bottom two panels: filipeta preview + consumption summary ── */}
      {selectedComplex && (
        <section className="w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">{selectedComplex.socialName || selectedComplex.aliasName}</span>
              <Badge variant="outline" className="text-xs capitalize">{latestMonth.label}</Badge>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/meter-report" className="flex items-center gap-1">
                Ver filipetas <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: filipeta preview (first 4 units) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Preview Filipetas — {latestMonth.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFilipetas ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <FilipetaMiniSkeleton key={i} />)}
                  </div>
                ) : filipetaData && filipetaData.list.length > 0 ? (
                  <div className="space-y-3">
                    {filipetaData.list.slice(0, 4).map(r => (
                      <FilipetaMiniCard key={r.id} report={r} />
                    ))}
                    {filipetaData.list.length > 4 && (
                      <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                        +{filipetaData.list.length - 4} unidades <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados para {latestMonth.label}</p>
                )}
              </CardContent>
            </Card>

            {/* Right: consumption summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-500" />
                  Resumo de Consumo — {latestMonth.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFilipetas ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : filipetaData && filipetaData.list.length > 0 ? (
                  <div className="space-y-4">
                    {/* Totals */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          <Droplets className="w-3 h-3 text-blue-400" /> Consumo Total
                        </p>
                        <p className="text-2xl font-bold text-teal-600">
                          {totalConsumption?.toFixed(2)} <span className="text-sm font-normal">m³</span>
                        </p>
                      </div>
                      <div className="rounded-xl border p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Total a Pagar</p>
                        <p className="text-xl font-bold text-blue-600">{formatCurrency(totalValue)}</p>
                      </div>
                    </div>
                    {/* Per-unit table (top 8) */}
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Unidade</th>
                            <th className="text-right px-3 py-2">Consumo m³</th>
                            <th className="text-right px-3 py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filipetaData.list.slice(0, 8).map(r => (
                            <tr key={r.id} className="hover:bg-muted/40">
                              <td className="px-3 py-1.5">
                                Bl.{r.apartment?.block?.name} · {r.apartment?.name}
                              </td>
                              <td className="px-3 py-1.5 text-right text-teal-600 font-medium">
                                {r.consumption?.toFixed(3) ?? '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right font-medium">
                                {formatCurrency(r.totalUnit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filipetaData.list.length > 8 && (
                      <Link href="/meter-report" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                        Ver todas as {filipetaData.totalCount} unidades <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados para {latestMonth.label}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: defaultFromDate, to: currentDay });
  const router = useRouter();
  const { preferences, loading: loadingPreferences, refetch: refetchPreferences } = useUserPreferences();
  const preferredMeters = preferences?.meters || [];
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
      setSelectedComplex(undefined);
      setSelectedBlock(undefined);
      setSelectedApartment(undefined);
      setSelectedMeter(undefined);
      setError(null);
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

  const handleRemovePreference = async (meterIdToRemove: string) => {
    try {
      const newMeters = (preferences?.meters || []).filter(id => id !== meterIdToRemove);
      await updatePreferences(newMeters);
      await refetchPreferences();
    } catch (e: any) { console.error(e); }
  };

  // Detect user type
  const isMorador = useMemo(() => {
    if (!context) return false;
    return !context.isSystem && context.companyIds.length === 0 && context.complexes.length === 0 && context.blocks.length === 0 && context.apartments.length > 0;
  }, [context]);

  const sharedProps = {
    dateRange, setDateRange, preferredMeters, loadingPreferences,
    addDialogOpen, setAddDialogOpen, handleRemovePreference, router,
  };

  return (
    <div className="space-y-8 w-full">
      <div className="space-y-8 container mx-auto md:px-6">

        {/* Loading skeleton while detecting user type */}
        {ctxLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : isMorador ? (
          <MoradorDashboard {...sharedProps} />
        ) : (
          <AdminDashboard {...sharedProps} />
        )}

        {/* Add meter dialog — shared */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Medidor à Dashboard</DialogTitle>
              <DialogDescription>Selecione o contexto e o medidor que deseja visualizar no dashboard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Condomínio</Label>
                <SelectComplex getAvailableForEntity="reading" setSelectedComplex={setSelectedComplex} complex={selectedComplex} modal required />
              </div>
              <div>
                <Label>Bloco</Label>
                <SelectBlock getAvailableForEntity="reading" setSelectedBlock={setSelectedBlock} block={selectedBlock} complexId={selectedComplex?.id} modal required />
              </div>
              <div>
                <Label>Apartamento</Label>
                <SelectApartment getAvailableForEntity="reading" setSelectedApartment={setSelectedApartment} apartment={selectedApartment} blockId={selectedBlock?.id} complexId={selectedComplex?.id} modal required />
              </div>
              <div>
                <Label>Medidor</Label>
                <SelectMeter setSelectedMeter={setSelectedMeter} meter={selectedMeter} apartmentId={selectedApartment?.id} modal required />
              </div>
              {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={updatingPref}>Cancelar</Button>
              <Button onClick={handleSavePreference} disabled={updatingPref}>{updatingPref ? 'Salvando...' : 'Salvar preferência'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom banners + services — always shown */}
      <div className="space-y-6 container mx-auto md:px-6">
        <section className="data-services-group w-full">
          <div className="w-full">
            <EnhancedCarousel footerPosition="over-translucid" slidesToShow={1} horizontalOffset={200} items={bannersList} alignItems="baseline" justifyContent="center" extraCardContentClasses="p-0" />
          </div>
        </section>
        <section className="data-services-group w-full">
          <div className="w-full">
            <EnhancedCarousel aspectRatio="aspect-[3/1]" items={itemsList} alignItems="center" />
          </div>
        </section>
      </div>
    </div>
  );
}
