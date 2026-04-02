'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Building2, Calendar,
  Droplets, Loader2, AlertCircle, Info, Search, X,
  Printer, ChevronDown, ChevronUp, Camera, ZoomIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import SelectComplex from '@/components/ComboboxComplex';
import { useUserContext } from '@/hooks/useUserContext';
import { MeterReportItem } from '@/hooks/useMeterReport';
import { sanitizeImageUrl } from '@/lib/utils';

const API = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildMonthOptions(count = 24) {
  const opts = [];
  for (let i = 0; i < count; i++) {
    const d = subMonths(new Date(), i);
    opts.push({
      value: `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
      label: format(d, 'MMM/yyyy', { locale: ptBR }),
      labelFull: format(d, 'MMMM / yyyy', { locale: ptBR }),
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear()),
    });
  }
  return opts;
}

const ALL_MONTHS = buildMonthOptions(24);

function fmt(v: number | null | undefined) {
  return v != null ? v.toFixed(3) : '—';
}
function fmtBRL(v: number | null | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function monthLabel(m: string, y: string) {
  const mo = ALL_MONTHS.find(o => o.month === m && o.year === y);
  return mo ? mo.label : `${m}/${y}`;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface MonthData {
  month: string;
  year: string;
  label: string;
  items: MeterReportItem[];
  loading: boolean;
  error: string | null;
}

// ─── Componente de foto do medidor (thumbnail na tabela) ──────────────────────
function MeterPhoto({ url, alt, monthLabel }: { url: string; alt?: string; monthLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* ── TELA: thumbnail 80×80 clicável ── */}
      <div className="levantamento-photo-screen flex flex-col items-center gap-1">
        <button
          className="relative w-20 h-20 rounded-lg overflow-hidden bg-black border border-gray-200 shrink-0 hover:opacity-80 hover:scale-105 transition-all shadow-sm"
          onClick={() => setOpen(true)}
          title="Ver foto completa"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt ?? 'Medidor'} className="w-full h-full object-contain" />
          <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">
            ampliar
          </div>
        </button>
        {monthLabel && <span className="text-[9px] text-gray-400 whitespace-nowrap">{monthLabel}</span>}
      </div>

      {/* ── IMPRESSÃO: img nativo tamanho grande, sempre visível ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt ?? 'Medidor'}
        className="levantamento-photo-print"
      />

      {/* ── Modal tela cheia (oculto no print via CSS) ── */}
      {open && (
        <div
          className="levantamento-photo-modal fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <p className="absolute top-4 left-4 text-white/60 text-xs">Toque para fechar</p>
          <button
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
            onClick={() => setOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt ?? 'Medidor'}
            className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {monthLabel && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
              {monthLabel}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ─── Card de foto do medidor para moradores ───────────────────────────────────
// Exibe foto em tamanho grande com todos os dados abaixo
function MeterPhotoCard({
  photoUrl, label, currReading, prevReading, consumption, totalUnit, partial, waterSewage,
}: {
  photoUrl: string | null;
  label: string;
  currReading: number | null;
  prevReading: number | null;
  consumption: number | null;
  totalUnit: number | null;
  partial: number | null;
  waterSewage: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="morador-meter-card bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Badge do mês */}
      <div className="bg-teal-600 text-white text-center text-xs font-bold uppercase tracking-wider py-1.5 px-3">
        {label}
      </div>

      {/* FOTO — grande, sem corte */}
      <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '220px' }}>
        {photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`Medidor ${label}`}
              className="morador-meter-photo w-full object-contain"
              style={{ maxHeight: '280px', minHeight: '220px' }}
            />
            <button
              onClick={() => setOpen(true)}
              className="morador-zoom-btn absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-all print:hidden"
              title="Ampliar foto"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-500">
            <Camera className="w-10 h-10 opacity-30" />
            <span className="text-xs text-gray-400">Sem foto neste mês</span>
          </div>
        )}
      </div>

      {/* Dados de leitura */}
      <div className="p-3 flex flex-col gap-2 text-xs">
        {/* Leituras */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">Leit. Anterior</div>
            <div className="font-semibold text-gray-700">{fmt(prevReading)}</div>
            <div className="text-[10px] text-gray-400">m³</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <div className="text-blue-400 text-[10px] uppercase tracking-wide mb-0.5">Leit. Atual</div>
            <div className="font-bold text-blue-700 text-base">{fmt(currReading)}</div>
            <div className="text-[10px] text-blue-400">m³</div>
          </div>
        </div>

        {/* Consumo */}
        <div className="bg-teal-50 rounded-lg p-2 text-center">
          <div className="text-teal-500 text-[10px] uppercase tracking-wide mb-0.5">Consumo do Período</div>
          <div className="font-bold text-teal-700 text-lg">{fmt(consumption)} <span className="text-sm font-normal">m³</span></div>
        </div>

        {/* Valores */}
        {(waterSewage != null || partial != null || totalUnit != null) && (
          <div className="border-t border-gray-100 pt-2 flex flex-col gap-1">
            {waterSewage != null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Água/Esgoto</span>
                <span className="font-medium text-gray-700">{fmtBRL(waterSewage)}</span>
              </div>
            )}
            {partial != null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Área Comum</span>
                <span className="font-medium text-gray-700">{fmtBRL(partial)}</span>
              </div>
            )}
            {totalUnit != null && (
              <div className="flex justify-between border-t border-gray-100 pt-1 mt-0.5">
                <span className="font-bold text-gray-700">Total a Pagar</span>
                <span className="font-bold text-blue-700">{fmtBRL(totalUnit)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de zoom (apenas tela) */}
      {open && photoUrl && (
        <div
          className="levantamento-photo-modal fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 print:hidden"
          onClick={() => setOpen(false)}
        >
          <p className="absolute top-4 left-4 text-white/60 text-xs">Toque para fechar</p>
          <button
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
            onClick={() => setOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={`Medidor ${label}`}
            className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
            {label}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Indicador de tendência ───────────────────────────────────────────────────
function TrendIcon({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) return <Minus className="w-4 h-4 text-gray-400" />;
  const diff = current - previous;
  if (diff > 0.01) return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (diff < -0.01) return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function LevantamentoPage() {
  const { context, loading: ctxLoading } = useUserContext();

  // Período: mês início e mês fim
  const [fromMonth, setFromMonth] = useState(ALL_MONTHS[5]); // 6 meses atrás
  const [toMonth, setToMonth] = useState(ALL_MONTHS[0]);     // mês atual

  const [selectedComplexId, setSelectedComplexId] = useState<string | undefined>();
  const [selectedComplexObj, setSelectedComplexObj] = useState<any>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [selectedApartment, setSelectedApartment] = useState('all');
  const [expandedApt, setExpandedApt] = useState<string | null>(null);

  // ── Helpers de contexto ──────────────────────────────────────────────────────
  const isMorador = useMemo(() => {
    if (!context) return false;
    return !context.isSystem && context.companyIds.length === 0 &&
      context.complexes.length === 0 && context.blocks.length === 0 &&
      context.apartments.length > 0;
  }, [context]);

  const userComplexes = useMemo(() => {
    if (!context) return [];
    const map = new Map<string, any>();
    context.apartments.forEach(a => {
      const cx = (a as any).block?.complex;
      if (cx?.id && !map.has(cx.id)) map.set(cx.id, cx);
    });
    context.complexes.forEach(cx => { if (!map.has(cx.id)) map.set(cx.id, cx); });
    return Array.from(map.values());
  }, [context]);

  const userApartments = useMemo(() => {
    if (!context || !selectedComplexId) return [];
    return context.apartments.filter((a: any) => a.block?.complex?.id === selectedComplexId);
  }, [context, selectedComplexId]);

  // Auto-select condomínio único para moradores
  useEffect(() => {
    if (!ctxLoading && isMorador && userComplexes.length === 1 && !selectedComplexId) {
      setSelectedComplexId(userComplexes[0].id);
      setSelectedComplexObj(userComplexes[0]);
    }
  }, [ctxLoading, isMorador, userComplexes, selectedComplexId]);

  // ── Montar lista de meses selecionados ───────────────────────────────────────
  const selectedMonths = useMemo(() => {
    const from = ALL_MONTHS.findIndex(o => o.value === fromMonth.value);
    const to = ALL_MONTHS.findIndex(o => o.value === toMonth.value);
    if (from < 0 || to < 0) return [];
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    // ALL_MONTHS é do mais recente para o mais antigo, então invertemos para cronológico
    return ALL_MONTHS.slice(start, end + 1).reverse();
  }, [fromMonth, toMonth]);

  // ── Buscar dados de cada mês ─────────────────────────────────────────────────
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);

  const apartmentIdFilter = useMemo(() => {
    if (!isMorador) return undefined;
    if (userApartments.length === 1) return userApartments[0].id;
    return undefined;
  }, [isMorador, userApartments]);

  const fetchMonth = useCallback(async (month: string, year: string, complexId: string, aptId?: string) => {
    const params: Record<string, string> = { month, year };
    if (complexId) params.complex_id = complexId;
    if (aptId) params.apartment_id = aptId;
    const res = await axios.get<{ list: MeterReportItem[] }>(`${API}/meter-report`, { params, withCredentials: true });
    return res.data.list;
  }, []);

  useEffect(() => {
    if (!selectedComplexId || selectedMonths.length === 0) {
      setMonthsData([]);
      return;
    }

    // Inicializa estado loading para cada mês
    setMonthsData(selectedMonths.map(m => ({
      month: m.month,
      year: m.year,
      label: m.label,
      items: [],
      loading: true,
      error: null,
    })));

    // Busca paralela
    selectedMonths.forEach(async (m, idx) => {
      try {
        const items = await fetchMonth(m.month, m.year, selectedComplexId!, apartmentIdFilter);
        setMonthsData(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], items, loading: false };
          return next;
        });
      } catch (e: any) {
        setMonthsData(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], loading: false, error: e?.message ?? 'Erro' };
          return next;
        });
      }
    });
  }, [selectedComplexId, selectedMonths, apartmentIdFilter, fetchMonth]);

  const isAnyLoading = monthsData.some(m => m.loading);
  const allLoaded = monthsData.length > 0 && !isAnyLoading;

  // ── Montar mapa de unidades → consumos por mês ───────────────────────────────
  interface AptRow {
    apartmentId: string;
    blockId: string;
    aptName: string;
    blockName: string;
    months: Array<{
      label: string;
      consumption: number | null;
      totalUnit: number | null;
      partial: number | null;
      waterSewage: number | null;
      prevReading: number | null;
      currReading: number | null;
      photoUrl: string | null;
    }>;
    avgConsumption: number;
    maxConsumption: number;
    minConsumption: number;
  }

  const aptRows = useMemo((): AptRow[] => {
    if (!allLoaded) return [];
    const map = new Map<string, AptRow>();

    monthsData.forEach(md => {
      md.items.forEach(item => {
        const aptId = item.apartmentId;
        if (!map.has(aptId)) {
          map.set(aptId, {
            apartmentId: aptId,
            blockId: item.apartment?.block?.id ?? '',
            aptName: item.apartment?.name ?? '',
            blockName: item.apartment?.block?.name ?? '',
            months: monthsData.map(m2 => ({ label: m2.label, consumption: null, totalUnit: null, partial: null, waterSewage: null, prevReading: null, currReading: null, photoUrl: null })),
            avgConsumption: 0,
            maxConsumption: 0,
            minConsumption: 0,
          });
        }
        const row = map.get(aptId)!;
        const mIdx = monthsData.findIndex(m2 => m2.month === md.month && m2.year === md.year);
        if (mIdx >= 0) {
          const ws = item.totalUnit != null && item.partial != null ? item.totalUnit - item.partial : null;
          row.months[mIdx] = {
            label: md.label,
            consumption: item.consumption,
            totalUnit: item.totalUnit,
            partial: item.partial,
            waterSewage: ws,
            prevReading: item.history?.[0]?.lastReading?.reading ?? null,
            currReading: item.lastReading?.reading ?? null,
            photoUrl: item.lastReading?.urlCover ? sanitizeImageUrl(item.lastReading.urlCover) : null,
          };
        }
      });
    });

    // Calcula estatísticas
    map.forEach(row => {
      const vals = row.months.map(m => m.consumption).filter(v => v != null) as number[];
      if (vals.length > 0) {
        row.avgConsumption = vals.reduce((a, b) => a + b, 0) / vals.length;
        row.maxConsumption = Math.max(...vals);
        row.minConsumption = Math.min(...vals);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const bComp = a.blockName.localeCompare(b.blockName);
      if (bComp !== 0) return bComp;
      return a.aptName.localeCompare(b.aptName, undefined, { numeric: true });
    });
  }, [allLoaded, monthsData]);

  const blockOptions = useMemo(() => {
    const byId = new Map<string, string>();
    aptRows.forEach((row) => {
      if (row.blockId && row.blockName && !byId.has(row.blockId)) {
        byId.set(row.blockId, row.blockName);
      }
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [aptRows]);

  const apartmentOptions = useMemo(() => {
    const rows = selectedBlock === 'all'
      ? aptRows
      : aptRows.filter((row) => row.blockId === selectedBlock);
    return rows
      .map((row) => ({ apartmentId: row.apartmentId, aptName: row.aptName, blockName: row.blockName, blockId: row.blockId }))
      .sort((a, b) => {
        const blockCmp = a.blockName.localeCompare(b.blockName, 'pt-BR', { numeric: true, sensitivity: 'base' });
        if (blockCmp !== 0) return blockCmp;
        return a.aptName.localeCompare(b.aptName, 'pt-BR', { numeric: true, sensitivity: 'base' });
      });
  }, [aptRows, selectedBlock]);

  useEffect(() => {
    if (selectedApartment === 'all') return;
    const stillExists = apartmentOptions.some((opt) => opt.apartmentId === selectedApartment);
    if (!stillExists) setSelectedApartment('all');
  }, [apartmentOptions, selectedApartment]);

  // Filtro por texto
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return aptRows.filter((r) => {
      if (selectedBlock !== 'all' && r.blockId !== selectedBlock) return false;
      if (selectedApartment !== 'all' && r.apartmentId !== selectedApartment) return false;
      if (!q) return true;
      return (
        r.aptName.toLowerCase().includes(q) ||
        r.blockName.toLowerCase().includes(q) ||
        `bloco ${r.blockName}`.toLowerCase().includes(q) ||
        `apto ${r.aptName}`.toLowerCase().includes(q)
      );
    });
  }, [aptRows, searchText, selectedBlock, selectedApartment]);

  // ── Dados para gráfico geral (consumo médio por mês) ─────────────────────────
  const chartData = useMemo(() => {
    if (!allLoaded) return [];
    return monthsData.map(md => {
      const vals = md.items.map(i => i.consumption).filter(v => v != null) as number[];
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const total = vals.reduce((a, b) => a + b, 0);
      return {
        label: md.label,
        média: parseFloat(avg.toFixed(3)),
        total: parseFloat(total.toFixed(3)),
        unidades: md.items.length,
      };
    });
  }, [allLoaded, monthsData]);

  const complexDisplayName = selectedComplexObj?.socialName || selectedComplexObj?.aliasName || '';

  // ── Para morador: dados da sua unidade ──────────────────────────────────────
  // Cada mês tem: foto, leituras, consumo, valores
  const moradorRow = useMemo(() => {
    if (!isMorador || aptRows.length === 0) return null;
    return aptRows[0]; // morador sempre tem 1 unidade
  }, [isMorador, aptRows]);

  // Quando um admin/síndico selecionar unidade específica, exibir a mesma visão detalhada
  // usada para morador (fotos por mês + gráfico da unidade + resumo de média).
  const selectedUnitRow = useMemo(() => {
    if (selectedApartment === 'all') return null;
    return filteredRows.find((row) => row.apartmentId === selectedApartment) || null;
  }, [filteredRows, selectedApartment]);

  const detailedUnitRow = isMorador ? moradorRow : selectedUnitRow;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 print:p-2">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2 rounded-lg print:hidden">
            <TrendingUp className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Levantamento de Consumo</h1>
            <p className="text-sm text-muted-foreground">
              {isMorador ? 'Histórico de leituras da sua unidade' : 'Comparativo por período — consumo, leituras e valores'}
            </p>
          </div>
        </div>
        {allLoaded && (isMorador ? moradorRow : filteredRows.length > 0) && (
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir / Exportar
          </Button>
        )}
      </div>

      <Separator className="print:hidden" />

      {/* Filtros */}
      <div className="print:hidden flex flex-col sm:flex-row gap-4 flex-wrap items-end">

        {/* Período De */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">De</label>
          <Select value={fromMonth.value} onValueChange={v => {
            const o = ALL_MONTHS.find(m => m.value === v);
            if (o) setFromMonth(o);
          }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_MONTHS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.labelFull}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Período Até */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Até</label>
          <Select value={toMonth.value} onValueChange={v => {
            const o = ALL_MONTHS.find(m => m.value === v);
            if (o) setToMonth(o);
          }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_MONTHS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.labelFull}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Badge meses selecionados */}
        {selectedMonths.length > 0 && (
          <Badge variant="secondary" className="h-9 px-3 text-sm">
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            {selectedMonths.length} {selectedMonths.length === 1 ? 'mês' : 'meses'}
          </Badge>
        )}

        {/* Condomínio */}
        {!ctxLoading && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Condomínio</label>
            {isMorador && userComplexes.length <= 1 ? (
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted text-sm min-w-[200px]">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span>{complexDisplayName || 'Carregando...'}</span>
              </div>
            ) : isMorador && userComplexes.length > 1 ? (
              <div className="flex gap-2 flex-wrap">
                {userComplexes.map((cx: any) => (
                  <Button key={cx.id} variant={selectedComplexId === cx.id ? 'default' : 'outline'} size="sm"
                    onClick={() => {
                      setSelectedComplexId(cx.id);
                      setSelectedComplexObj(cx);
                      setSearchText('');
                      setSelectedBlock('all');
                      setSelectedApartment('all');
                    }}>
                    <Building2 className="w-3.5 h-3.5 mr-1.5" />
                    {cx.socialName || cx.aliasName}
                  </Button>
                ))}
              </div>
            ) : (
              <SelectComplex
                setSelectedComplex={(cx: any) => {
                  setSelectedComplexId(cx?.id);
                  setSelectedComplexObj(cx ?? null);
                  setSearchText('');
                  setSelectedBlock('all');
                  setSelectedApartment('all');
                }}
                complex={selectedComplexObj}
                autoSelectSingle={false}
              />
            )}
          </div>
        )}

        {/* Filtros de unidade — só para não moradores */}
        {!isMorador && allLoaded && aptRows.length > 0 && (
          <>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bloco</label>
              <Select
                value={selectedBlock}
                onValueChange={(value) => {
                  setSelectedBlock(value);
                  setSelectedApartment('all');
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Todos os blocos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os blocos</SelectItem>
                  {blockOptions.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      Bloco {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unidade</label>
              <Select value={selectedApartment} onValueChange={setSelectedApartment}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {apartmentOptions.map((apartment) => (
                    <SelectItem key={apartment.apartmentId} value={apartment.apartmentId}>
                      {`Bloco ${apartment.blockName} • Apto ${apartment.aptName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar unidade</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="Bloco ou apartamento..." className="pl-9 pr-9" />
                {searchText && (
                  <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Alert: selecione condomínio */}
      {!selectedComplexId && !ctxLoading && (
        <Alert className="print:hidden">
          <Info className="w-4 h-4" />
          <AlertDescription>Selecione um condomínio e o período para iniciar o levantamento.</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isAnyLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 print:hidden">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          <p className="text-muted-foreground">
            Carregando {monthsData.filter(m => m.loading).length} {monthsData.filter(m => m.loading).length === 1 ? 'mês' : 'meses'}...
          </p>
          <div className="flex gap-1.5 flex-wrap justify-center max-w-sm">
            {monthsData.map(m => (
              <Badge key={m.label} variant={m.loading ? 'secondary' : 'default'} className="text-xs">
                {m.loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                {m.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Resultado vazio */}
      {allLoaded && aptRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground print:hidden">
          <Droplets className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium">Nenhum dado encontrado</p>
          <p className="text-sm mt-1">Não há leituras no período selecionado para este condomínio.</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VISTA DO MORADOR: fotos em destaque, uma por mês
          ═══════════════════════════════════════════════════════════════════════ */}
      {allLoaded && isMorador && moradorRow && (
        <>
          {/* Cabeçalho print */}
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">{complexDisplayName}</h2>
            <p className="text-sm text-gray-600">
              Bl. {moradorRow.blockName} — Ap. {moradorRow.aptName} — {selectedMonths[0]?.labelFull} a {selectedMonths[selectedMonths.length - 1]?.labelFull}
            </p>
            <p className="text-xs text-gray-400">Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>

          {/* Identificação da unidade */}
          <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 print:hidden">
            <div className="bg-teal-600 rounded-lg p-2">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-teal-800 text-sm">
                {complexDisplayName} — Bl. {moradorRow.blockName} / Ap. {moradorRow.aptName}
              </p>
              <p className="text-xs text-teal-600">
                {selectedMonths.length} {selectedMonths.length === 1 ? 'mês selecionado' : 'meses selecionados'} · Média {moradorRow.avgConsumption.toFixed(2)} m³/mês
              </p>
            </div>
          </div>

          {/* ── Cards de foto por mês ────────────────────────────────── */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 print:text-base">
              <Camera className="w-4 h-4 text-teal-500 print:hidden" />
              Fotos do Medidor por Mês
            </h3>
            {/* Grid: 1 col mobile, 2 col sm, 3 col md, 4 col lg */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 morador-cards-grid">
              {moradorRow.months.map((m, mi) => (
                <MeterPhotoCard
                  key={mi}
                  photoUrl={m.photoUrl}
                  label={m.label}
                  currReading={m.currReading}
                  prevReading={m.prevReading}
                  consumption={m.consumption}
                  totalUnit={m.totalUnit}
                  partial={m.partial}
                  waterSewage={m.waterSewage}
                />
              ))}
            </div>
          </div>

          {/* ── Gráfico de evolução da unidade ──────────────────────── */}
          <div className="bg-white border rounded-xl p-4 print:border-gray-400">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              Evolução do Consumo — {complexDisplayName} Bl.{moradorRow.blockName} Ap.{moradorRow.aptName}
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={moradorRow.months.map(m => ({ label: m.label, consumo: m.consumption ?? 0 }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={60} />
                <Tooltip formatter={(val: any) => [`${val} m³`, 'Consumo']} labelStyle={{ fontWeight: 'bold' }} />
                <ReferenceLine
                  y={moradorRow.avgConsumption}
                  stroke="#94a3b8" strokeDasharray="4 4"
                  label={{ value: 'Média', position: 'right', fontSize: 10, fill: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="consumo" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Footer print */}
          <div className="hidden print:block text-xs text-gray-400 text-center mt-4">
            AcquaX Control — Levantamento — {complexDisplayName} Bl.{moradorRow.blockName} Ap.{moradorRow.aptName} — Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VISTA DE ADMIN/SÍNDICO: tabela comparativa de todas as unidades
          ═══════════════════════════════════════════════════════════════════════ */}
      {allLoaded && !isMorador && aptRows.length > 0 && !selectedUnitRow && (
        <>
          {/* ── Cabeçalho do relatório (visível no print) ── */}
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">{complexDisplayName}</h2>
            <p className="text-sm text-gray-600">
              Levantamento de Consumo — {selectedMonths[0]?.labelFull} a {selectedMonths[selectedMonths.length - 1]?.labelFull}
            </p>
            <p className="text-xs text-gray-400">Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>

          {/* ── KPIs gerais ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
            {[
              { label: 'Unidades', value: aptRows.length.toString(), icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Meses', value: selectedMonths.length.toString(), icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
              {
                label: 'Consumo Médio/Mês',
                value: `${(chartData.reduce((a, b) => a + b.média, 0) / (chartData.length || 1)).toFixed(2)} m³`,
                icon: Droplets, color: 'text-teal-600', bg: 'bg-teal-50',
              },
              {
                label: 'Consumo Total',
                value: `${chartData.reduce((a, b) => a + b.total, 0).toFixed(2)} m³`,
                icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50',
              },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3 flex flex-col gap-1`}>
                <div className="flex items-center gap-1.5">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-xs text-gray-500">{kpi.label}</span>
                </div>
                <span className={`font-bold text-lg ${kpi.color}`}>{kpi.value}</span>
              </div>
            ))}
          </div>

          {/* ── Gráfico consumo médio por mês ──────────────────────────── */}
          <div className="bg-white border rounded-xl p-4 print:border-gray-400">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              Evolução do Consumo Médio por Mês (m³)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={60} />
                <Tooltip
                  formatter={(val: any) => [`${val} m³`, 'Consumo médio']}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <ReferenceLine
                  y={chartData.reduce((a, b) => a + b.média, 0) / (chartData.length || 1)}
                  stroke="#94a3b8" strokeDasharray="4 4"
                  label={{ value: 'Média', position: 'right', fontSize: 10, fill: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="média" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Gráfico barras por mês ─────────────────────────────────── */}
          <div className="bg-white border rounded-xl p-4 print:border-gray-400">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-500" />
              Consumo Total do Condomínio por Mês (m³)
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={65} />
                <Tooltip formatter={(val: any) => [`${val} m³`, 'Total']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabela por unidade ──────────────────────────────────────── */}
          <div className="bg-white border rounded-xl overflow-hidden print:border-gray-400">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                Detalhamento por Unidade
                {searchText && <span className="text-xs text-muted-foreground">({filteredRows.length} de {aptRows.length})</span>}
              </h3>
            </div>

            {/* Tabela scroll horizontal */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="sticky left-0 bg-gray-50 px-3 py-2.5 text-left font-semibold text-gray-700 whitespace-nowrap z-10 min-w-[130px]">
                      Unidade
                    </th>
                    {monthsData.map(m => (
                      <th key={m.label} className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap min-w-[110px] border-l">
                        {m.label}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap min-w-[90px] border-l bg-teal-50 text-teal-700">
                      Média m³
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, ri) => {
                    const isExpanded = expandedApt === row.apartmentId;
                    return (
                      <React.Fragment key={row.apartmentId}>
                        {/* Linha principal: consumo */}
                        <tr
                          className={`border-b cursor-pointer transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/40`}
                          onClick={() => setExpandedApt(isExpanded ? null : row.apartmentId)}
                        >
                          <td className={`sticky left-0 z-10 px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/40`}>
                            <div className="flex items-center gap-1.5">
                              {isExpanded
                                ? <ChevronUp className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              }
                              <span className="text-gray-500">Bl.{row.blockName}</span>
                              <span>Ap.{row.aptName}</span>
                            </div>
                          </td>
                          {row.months.map((m, mi) => {
                            const prev = mi > 0 ? row.months[mi - 1].consumption : null;
                            return (
                              <td key={mi} className="px-3 py-2.5 text-center border-l">
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <TrendIcon current={m.consumption} previous={prev} />
                                    <span className={`font-semibold ${m.consumption != null ? 'text-gray-800' : 'text-gray-300'}`}>
                                      {fmt(m.consumption)}
                                    </span>
                                  </div>
                                  <span className="text-gray-400 text-[10px]">m³</span>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center border-l bg-teal-50">
                            <span className="font-bold text-teal-700">{row.avgConsumption.toFixed(2)}</span>
                            <div className="text-[10px] text-teal-400">m³/mês</div>
                          </td>
                        </tr>

                        {/* Linha expandida: detalhes completos */}
                        {isExpanded && (
                          <tr className="border-b bg-blue-50/30">
                            <td colSpan={monthsData.length + 2} className="px-3 py-3">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <td className="pr-3 pb-1 font-semibold whitespace-nowrap">Detalhe</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 pb-1 text-center font-semibold whitespace-nowrap text-blue-600">{m.label}</td>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {/* Foto */}
                                    <tr>
                                      <td className="pr-3 py-2 text-gray-500 whitespace-nowrap align-top">Foto</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-2 text-center align-top">
                                          {m.photoUrl
                                            ? <div className="flex justify-center">
                                                <MeterPhoto url={m.photoUrl} alt={`Medidor ${m.label}`} monthLabel={m.label} />
                                              </div>
                                            : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                      ))}
                                    </tr>
                                    {/* Leitura anterior */}
                                    <tr>
                                      <td className="pr-3 py-1.5 text-gray-500 whitespace-nowrap">Leit. Anterior</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-1.5 text-center text-gray-700">{fmt(m.prevReading)} m³</td>
                                      ))}
                                    </tr>
                                    {/* Leitura atual */}
                                    <tr>
                                      <td className="pr-3 py-1.5 text-gray-500 whitespace-nowrap">Leit. Atual</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-1.5 text-center font-semibold text-blue-700">{fmt(m.currReading)} m³</td>
                                      ))}
                                    </tr>
                                    {/* Consumo */}
                                    <tr>
                                      <td className="pr-3 py-1.5 text-gray-500 whitespace-nowrap">Consumo</td>
                                      {row.months.map((m, mi) => {
                                        const prev = mi > 0 ? row.months[mi - 1].consumption : null;
                                        const diff = m.consumption != null && prev != null ? m.consumption - prev : null;
                                        return (
                                          <td key={mi} className="px-3 py-1.5 text-center">
                                            <span className="font-bold text-teal-700">{fmt(m.consumption)} m³</span>
                                            {diff != null && (
                                              <div className={`text-[10px] ${diff > 0.01 ? 'text-red-500' : diff < -0.01 ? 'text-green-500' : 'text-gray-400'}`}>
                                                {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                                              </div>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    {/* Água/Esgoto */}
                                    <tr>
                                      <td className="pr-3 py-1.5 text-gray-500 whitespace-nowrap">Água/Esgoto</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-1.5 text-center text-gray-700">{fmtBRL(m.waterSewage)}</td>
                                      ))}
                                    </tr>
                                    {/* Área Comum */}
                                    <tr>
                                      <td className="pr-3 py-1.5 text-gray-500 whitespace-nowrap">Área Comum</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-1.5 text-center text-gray-700">{fmtBRL(m.partial)}</td>
                                      ))}
                                    </tr>
                                    {/* Total a Pagar */}
                                    <tr>
                                      <td className="pr-3 py-1.5 font-bold text-gray-700 whitespace-nowrap">Total a Pagar</td>
                                      {row.months.map((m, mi) => (
                                        <td key={mi} className="px-3 py-1.5 text-center font-bold text-blue-700">{fmtBRL(m.totalUnit)}</td>
                                      ))}
                                    </tr>
                                    {/* Mini gráfico linha */}
                                    <tr>
                                      <td className="pr-3 py-2 text-gray-500 whitespace-nowrap">Evolução</td>
                                      <td colSpan={row.months.length} className="px-3 py-2">
                                        <ResponsiveContainer width="100%" height={60}>
                                          <LineChart data={row.months.map(m => ({ label: m.label, consumo: m.consumption }))}>
                                            <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                                            <YAxis hide />
                                            <Tooltip formatter={(v: any) => [`${v} m³`, '']} />
                                            <Line type="monotone" dataKey="consumo" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer print */}
          <div className="hidden print:block text-xs text-gray-400 text-center mt-4">
            AcquaX Control — Levantamento de Consumo — {complexDisplayName} — Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VISTA DE UNIDADE SELECIONADA: filipetas + gráfico + média
          ═══════════════════════════════════════════════════════════════════════ */}
      {allLoaded && !isMorador && selectedUnitRow && (
        <>
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">{complexDisplayName}</h2>
            <p className="text-sm text-gray-600">
              Bl. {selectedUnitRow.blockName} — Ap. {selectedUnitRow.aptName} — {selectedMonths[0]?.labelFull} a {selectedMonths[selectedMonths.length - 1]?.labelFull}
            </p>
            <p className="text-xs text-gray-400">Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>

          <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 print:hidden">
            <div className="bg-teal-600 rounded-lg p-2">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-teal-800 text-sm">
                {complexDisplayName} — Bl. {selectedUnitRow.blockName} / Ap. {selectedUnitRow.aptName}
              </p>
              <p className="text-xs text-teal-600">
                {selectedMonths.length} {selectedMonths.length === 1 ? 'mês selecionado' : 'meses selecionados'} · Média {selectedUnitRow.avgConsumption.toFixed(2)} m³/mês
              </p>
            </div>
          </div>

          {/* "Filipeta" da unidade para os meses selecionados */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 print:text-base">
              <Camera className="w-4 h-4 text-teal-500 print:hidden" />
              Filipeta da Unidade por Mês
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 morador-cards-grid">
              {selectedUnitRow.months.map((m, mi) => (
                <MeterPhotoCard
                  key={mi}
                  photoUrl={m.photoUrl}
                  label={m.label}
                  currReading={m.currReading}
                  prevReading={m.prevReading}
                  consumption={m.consumption}
                  totalUnit={m.totalUnit}
                  partial={m.partial}
                  waterSewage={m.waterSewage}
                />
              ))}
            </div>
          </div>

          {/* Gráfico de consumo da unidade */}
          <div className="bg-white border rounded-xl p-4 print:border-gray-400">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              Evolução do Consumo — {complexDisplayName} Bl.{selectedUnitRow.blockName} Ap.{selectedUnitRow.aptName}
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={selectedUnitRow.months.map((m) => ({ label: m.label, consumo: m.consumption ?? 0 }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" m³" width={60} />
                <Tooltip formatter={(val: any) => [`${val} m³`, 'Consumo']} labelStyle={{ fontWeight: 'bold' }} />
                <ReferenceLine
                  y={selectedUnitRow.avgConsumption}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: 'Média', position: 'right', fontSize: 10, fill: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="consumo" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela de média e resumo da unidade */}
          <div className="bg-white border rounded-xl overflow-hidden print:border-gray-400">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                Média e Consumo da Unidade
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700 whitespace-nowrap">Unidade</th>
                    {monthsData.map((m) => (
                      <th key={m.label} className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap min-w-[110px] border-l">
                        {m.label}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap min-w-[90px] border-l bg-teal-50 text-teal-700">
                      Média m³
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-white">
                    <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      Bl.{selectedUnitRow.blockName} Ap.{selectedUnitRow.aptName}
                    </td>
                    {selectedUnitRow.months.map((m, mi) => (
                      <td key={mi} className="px-3 py-2.5 text-center border-l">
                        <span className={`font-semibold ${m.consumption != null ? 'text-gray-800' : 'text-gray-300'}`}>
                          {fmt(m.consumption)}
                        </span>
                        <div className="text-gray-400 text-[10px]">m³</div>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center border-l bg-teal-50">
                      <span className="font-bold text-teal-700">{selectedUnitRow.avgConsumption.toFixed(2)}</span>
                      <div className="text-[10px] text-teal-400">m³/mês</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
