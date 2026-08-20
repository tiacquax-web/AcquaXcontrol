'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronDown, DollarSign, DoorClosed, Droplets, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SelectComplex from '@/components/ComboboxComplex';
import SelectApartment from '@/components/ComboboxApartment';
import { useToast } from '@/hooks/use-toast';
import { useUserContext } from '@/hooks/useUserContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PeriodMode = 'monthly' | 'quarterly' | 'annual' | 'custom';
type MetricKey = 'averageConsumption' | 'comparison' | 'totalConsumption' | 'commonAreaConsumption' | 'commonAreaCost' | 'totalCost';

type AnalysisRow = {
  key: string;
  label: string;
  unitCount: number;
  averageConsumption: number;
  totalConsumption: number;
  commonAreaConsumption: number;
  selectedConsumption: number | null;
  totalCost: number;
  averageCost: number;
  commonAreaCost: number;
  averageCommonAreaCost: number;
  selectedCommonAreaCost: number | null;
};

type AnalysisResponse = {
  complex: { id: string; socialName: string | null; aliasName: string | null };
  series: AnalysisRow[];
  summary: {
    monthsWithData: number;
    totalConsumption: number;
    totalCost: number;
    totalCommonAreaConsumption: number;
    totalCommonAreaCost: number;
    averageMonthlyConsumption: number;
    averageMonthlyCost: number;
  };
};

const METRICS: Array<{ key: MetricKey; label: string; color: string; axis: 'consumption' | 'cost' }> = [
  { key: 'averageConsumption', label: 'Consumo médio das unidades', color: '#2563eb', axis: 'consumption' },
  { key: 'comparison', label: 'Unidade x média', color: '#7c3aed', axis: 'consumption' },
  { key: 'totalConsumption', label: 'Consumo total', color: '#0891b2', axis: 'consumption' },
  { key: 'commonAreaConsumption', label: 'Consumo da área comum', color: '#f97316', axis: 'consumption' },
  { key: 'commonAreaCost', label: 'Custo da área comum', color: '#ea580c', axis: 'cost' },
  { key: 'totalCost', label: 'Custo total', color: '#16a34a', axis: 'cost' },
];

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function number(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function metricValue(row: AnalysisRow, key: MetricKey) {
  if (key === 'averageConsumption') return row.averageConsumption;
  if (key === 'comparison') return row.selectedConsumption;
  if (key === 'totalConsumption') return row.totalConsumption;
  if (key === 'commonAreaConsumption') return row.commonAreaConsumption;
  if (key === 'commonAreaCost') return row.selectedCommonAreaCost ?? row.commonAreaCost;
  return row.totalCost;
}

export default function ConsumptionDashboardPage() {
  const { context } = useUserContext();
  const { isPreviewing, previewRole, effectiveContext } = useRolePreview();
  const { toast } = useToast();
  const [complex, setComplex] = useState<any>();
  const [apartment, setApartment] = useState<any>();
  const [period, setPeriod] = useState<PeriodMode>('annual');
  const [start, setStart] = useState(`${new Date().getFullYear()}-01`);
  const [end, setEnd] = useState(currentMonth());
  const [utilityType, setUtilityType] = useState('water');
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['averageConsumption', 'comparison', 'commonAreaCost']);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const activeContext: any = isPreviewing && effectiveContext ? effectiveContext : context;
  const isSystem = Boolean(activeContext?.isSystem);
  const isResident = useMemo(() => {
    if (!activeContext || isSystem) return false;
    if (isPreviewing) return previewRole === 'morador';
    return activeContext.apartments?.length > 0 &&
      (activeContext.complexes?.length === 0 || activeContext.directApartmentIds?.length > 0) &&
      (activeContext.companyIds?.length || 0) === 0 &&
      (activeContext.directBlockIds?.length || 0) === 0 &&
      (activeContext.directComplexIds?.length || 0) === 0;
  }, [activeContext, isPreviewing, isSystem, previewRole]);
  const residentApartments = useMemo(() => activeContext?.apartments || [], [activeContext]);
  const userComplexes = useMemo(() => {
    if (!activeContext) return [];
    const map = new Map<string, any>();
    residentApartments.forEach((apt: any) => {
      const cx = apt.block?.complex;
      if (cx?.id && !map.has(cx.id)) map.set(cx.id, cx);
    });
    (activeContext.complexes || []).forEach((cx: any) => {
      if (!map.has(cx.id)) map.set(cx.id, cx);
    });
    return Array.from(map.values());
  }, [activeContext, residentApartments]);
  const accessibleComplexes = isResident ? userComplexes : (activeContext?.complexes || []);
  const residentApartmentsInComplex = useMemo(() => residentApartments.filter((apt: any) => apt.block?.complex?.id === complex?.id), [residentApartments, complex?.id]);
  const residentHasSingleComplex = isResident && userComplexes.length === 1;
  const residentHasSingleApartment = isResident && residentApartmentsInComplex.length === 1;

  useEffect(() => {
    if (!activeContext) return;
    if (isResident && userComplexes.length === 1 && complex?.id !== userComplexes[0].id) {
      setComplex(userComplexes[0]);
      return;
    }
    if (!isResident && accessibleComplexes.length === 1 && !complex) {
      setComplex(accessibleComplexes[0]);
    }
  }, [activeContext, accessibleComplexes, complex, isResident, userComplexes]);

  useEffect(() => {
    if (!isResident || !residentApartmentsInComplex.length) return;
    if (residentApartmentsInComplex.length === 1 && apartment?.id !== residentApartmentsInComplex[0].id) {
      setApartment(residentApartmentsInComplex[0]);
    }
    if (apartment && !residentApartmentsInComplex.some((item: any) => item.id === apartment.id)) {
      setApartment(undefined);
    }
  }, [apartment, isResident, residentApartmentsInComplex]);

  useEffect(() => {
    const month = currentMonth();
    if (period === 'monthly') {
      setStart(month);
      setEnd(month);
    } else if (period === 'quarterly') {
      setStart(shiftMonth(month, -2));
      setEnd(month);
    } else if (period === 'annual') {
      setStart(`${new Date().getFullYear()}-01`);
      setEnd(month);
    }
  }, [period]);

  const load = async () => {
    if (!complex?.id) {
      toast({ title: 'Selecione um condomínio', description: 'Escolha o condomínio antes de carregar a análise.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ complex_id: complex.id, start, end, utility_type: utilityType });
      if (apartment?.id) params.set('apartment_id', apartment.id);
      const response = await fetch(`/api/dashboard/consumption-analysis?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a análise');
      setData(payload);
    } catch (error: any) {
      setData(null);
      toast({ title: 'Erro ao carregar análise', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (complex?.id) load();
    // O carregamento deliberado ocorre quando o condomínio, período ou utilitário muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complex?.id, apartment?.id, start, end, utilityType]);

  const chartData = useMemo(() => (data?.series || []).map((row) => ({
    ...row,
    comparisonAverage: row.selectedConsumption == null ? null : row.averageConsumption,
    comparisonUnit: row.selectedConsumption,
  })), [data]);

  const toggleMetric = (key: MetricKey) => {
    setSelectedMetrics((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const selectedComplexName = data?.complex?.socialName || data?.complex?.aliasName || complex?.socialName || 'Condomínio';
  const visibleMetrics = isResident ? METRICS.filter((metric) => metric.key !== 'commonAreaConsumption') : METRICS;
  const consumptionMetricsSelected = selectedMetrics.some((key) => METRICS.find((metric) => metric.key === key)?.axis === 'consumption');
  const costMetricsSelected = selectedMetrics.some((key) => METRICS.find((metric) => metric.key === key)?.axis === 'cost');
  const selectedComparison = data?.series.filter((item) => item.selectedConsumption != null) || [];
  const comparisonAverage = selectedComparison.length ? selectedComparison.reduce((sum, item) => sum + item.averageConsumption, 0) / selectedComparison.length : 0;
  const comparisonUnit = selectedComparison.length ? selectedComparison.reduce((sum, item) => sum + Number(item.selectedConsumption || 0), 0) / selectedComparison.length : 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Análise de Consumo e Custos</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Compare consumo médio, custo, área comum e desempenho da unidade por período.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading || !complex?.id} className="gap-2">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CalendarRange className="h-4 w-4 text-blue-600" /> Filtros da análise</CardTitle>
          <CardDescription>Selecione o condomínio, o período e os indicadores que deseja visualizar.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="space-y-2 xl:col-span-2">
            <Label>Condomínio</Label>
            <SelectComplex getAvailableForEntity="apartment" setSelectedComplex={(value) => { setComplex(value); setApartment(undefined); }} complex={complex} required modal disabled={isResident && residentHasSingleComplex} autoSelectSingle={!isSystem && !isResident} />
          </div>
          <div className="space-y-2">
            <Label>{isResident ? 'Sua unidade' : 'Unidade (opcional)'}</Label>
            {isResident ? (
              <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                <DoorClosed className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{residentHasSingleApartment ? residentApartmentsInComplex[0].name : residentApartmentsInComplex.length ? `${residentApartmentsInComplex.length} unidades vinculadas` : 'Selecione seu condomínio'}</span>
              </div>
            ) : (
              <SelectApartment getAvailableForEntity="apartment" setSelectedApartment={setApartment} apartment={apartment} complexId={complex?.id} required={false} disabled={!complex?.id} modal />
            )}
          </div>
          <div className="space-y-2">
            <Label>Visão</Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as PeriodMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
                <SelectItem value="custom">Período escolhido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Utilitário</Label>
            <Select value={utilityType} onValueChange={setUtilityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="water">Água / Esgoto</SelectItem>
                <SelectItem value="gas">Gás</SelectItem>
                <SelectItem value="energy">Energia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="month" value={start} onChange={(event) => setStart(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="month" value={end} onChange={(event) => setEnd(event.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ChevronDown className="h-4 w-4 text-blue-600" /> Componentes do gráfico</CardTitle>
          <CardDescription>{isResident ? (apartment ? `Valores pagos e consumidos pela unidade ${apartment.name}. A comparação usa a média das unidades do condomínio apenas como referência.` : 'Valores consolidados das suas unidades vinculadas; nenhum dado de outras unidades é incluído.') : apartment ? `Comparação da unidade ${apartment.name} com a média das unidades de ${selectedComplexName}.` : 'Sem unidade selecionada, os indicadores representam o condomínio.'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-3">
          {visibleMetrics.map((metric) => (
            <label key={metric.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selectedMetrics.includes(metric.key)} onCheckedChange={() => toggleMetric(metric.key)} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
              {metric.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando análise…</div>
      )}

      {!loading && !data && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um condomínio para visualizar os dados.</CardContent></Card>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="h-3.5 w-3.5 text-blue-600" /> Consumo no período</p><p className="text-2xl font-bold mt-1">{number(data.summary.totalConsumption)}</p><p className="text-xs text-muted-foreground">{data.summary.monthsWithData} meses com dados</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 text-green-600" /> Custo no período</p><p className="text-2xl font-bold mt-1">{money(data.summary.totalCost)}</p><p className="text-xs text-muted-foreground">média mensal {money(data.summary.averageMonthlyCost)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-orange-600" /> Área comum</p><p className="text-2xl font-bold mt-1">{money(data.summary.totalCommonAreaCost)}</p><p className="text-xs text-muted-foreground">{isResident ? 'rateio pago pela sua unidade' : `${number(data.summary.totalCommonAreaConsumption)} m³ no período`}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5 text-purple-600" /> Comparação</p><p className="text-2xl font-bold mt-1">{apartment ? `${number(comparisonUnit)} / ${number(comparisonAverage)}` : 'Condomínio'}</p><p className="text-xs text-muted-foreground">unidade / média</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectedComplexName} · {start} a {end}</CardTitle>
              <CardDescription>Valores de consumo e custo conforme os componentes selecionados.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedMetrics.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Selecione pelo menos um componente para montar o gráfico.</div>
              ) : (
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      {consumptionMetricsSelected && <YAxis yAxisId="consumption" tick={{ fontSize: 11 }} width={52} />}
                      {costMetricsSelected && <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11 }} width={64} tickFormatter={(value) => `R$${Number(value).toFixed(0)}`} />}
                      <Tooltip formatter={(value: any, name: any) => [name.toLowerCase().includes('custo') || name.toLowerCase().includes('área') ? money(value) : number(value), name]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {selectedMetrics.includes('averageConsumption') && <Line yAxisId="consumption" type="monotone" dataKey="averageConsumption" name="Consumo médio" stroke="#2563eb" strokeWidth={2} dot={false} />}
                      {selectedMetrics.includes('comparison') && apartment && <><Line yAxisId="consumption" type="monotone" dataKey="comparisonAverage" name="Média das unidades" stroke="#7c3aed" strokeDasharray="5 5" dot={false} /><Line yAxisId="consumption" type="monotone" dataKey="comparisonUnit" name={`Unidade ${apartment.name}`} stroke="#db2777" strokeWidth={2} dot={false} /></>}
                      {selectedMetrics.includes('totalConsumption') && <Bar yAxisId="consumption" dataKey="totalConsumption" name="Consumo total" fill="#0891b2" opacity={0.65} radius={[3, 3, 0, 0]} />}
                      {selectedMetrics.includes('commonAreaConsumption') && <Line yAxisId="consumption" type="monotone" dataKey="commonAreaConsumption" name="Consumo da área comum" stroke="#f97316" strokeWidth={2} dot={false} />}
                      {selectedMetrics.includes('commonAreaCost') && <Line yAxisId="cost" type="monotone" dataKey={apartment ? 'selectedCommonAreaCost' : 'commonAreaCost'} name={apartment ? 'Área comum da unidade' : 'Área comum do condomínio'} stroke="#ea580c" strokeWidth={2} dot={false} />}
                      {selectedMetrics.includes('totalCost') && <Line yAxisId="cost" type="monotone" dataKey="totalCost" name="Custo total" stroke="#16a34a" strokeWidth={2} dot={false} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
