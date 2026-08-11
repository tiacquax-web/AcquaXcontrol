'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Loader2, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CommonAreaMonth {
  month: string;
  label: string;
  areaCommon: number | null;
  totalBill: number | null;
  condominiumConsumption: number | null;
  readingDate: string | null;
  nextReadingDate: string | null;
}

interface CommonAreaResponse {
  months: CommonAreaMonth[];
  summary: {
    total: number;
    average: number;
    peak: { label: string; value: number } | null;
    monthsWithData: number;
  };
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AreaCommonAnnualDashboard({ complexId, complexName }: { complexId: string; complexName?: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [data, setData] = useState<CommonAreaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => Array.from({ length: 5 }, (_, index) => String(currentYear - index)), [currentYear]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/common-area?complex_id=${encodeURIComponent(complexId)}&year=${year}`, { credentials: 'include' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a Área Comum');
        return payload as CommonAreaResponse;
      })
      .then(payload => {
        if (!cancelled) setData(payload);
      })
      .catch(reason => {
        if (!cancelled) {
          setData(null);
          setError(reason?.message || 'Erro ao carregar os dados');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [complexId, year]);

  const chartData = (data?.months ?? []).map(item => ({
    ...item,
    value: item.areaCommon ?? 0,
    valueLabel: item.areaCommon == null ? 'Sem leitura' : currency.format(item.areaCommon),
  }));

  return (
    <Card className="border-teal-200 dark:border-teal-900">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-teal-600" />
            Área Comum — acompanhamento anual
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {complexName || 'Condomínio'} · valores de rateio da conta da concessionária
          </p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(option => <SelectItem key={option} value={option} className="text-xs">{option}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-56 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-teal-50/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Total no ano</p>
                <p className="mt-1 text-lg font-bold text-teal-700">{currency.format(data?.summary.total ?? 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Média mensal</p>
                <p className="mt-1 text-lg font-bold">{currency.format(data?.summary.average ?? 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Maior mês</p>
                <p className="mt-1 text-lg font-bold text-orange-600">{data?.summary.peak?.label || '—'}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Meses com dados</p>
                <p className="mt-1 text-lg font-bold">{data?.summary.monthsWithData ?? 0}/12</p>
              </div>
            </div>

            {chartData.some(item => item.areaCommon != null) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-25" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={value => `R$${Number(value).toFixed(0)}`} />
                  <Tooltip formatter={(value: number) => [currency.format(value), 'Área Comum']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map(item => (
                      <Cell key={item.month} fill={data?.summary.peak?.label === item.label ? '#f97316' : '#0d9488'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <CalendarDays className="h-9 w-9 opacity-30" />
                <p className="text-sm">Nenhum valor de Área Comum registrado em {year}.</p>
              </div>
            )}

            {data?.summary.peak && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                Maior rateio: {data.summary.peak.label} ({currency.format(data.summary.peak.value)}).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
