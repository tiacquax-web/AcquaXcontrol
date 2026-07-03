"use client";

/**
 * app/(main)/alerts/page.tsx
 *
 * Central Consolidada de Alertas de Consumo.
 *
 * Exibe, para o contexto selecionado (empresa → condomínio → bloco → apto),
 * todos os medidores com anomalias no período informado:
 *   - NEGATIVE_CONSUMPTION : leitura regressiva
 *   - OUTLIER_HIGH         : consumo muito acima da média
 *   - OUTLIER_LOW          : consumo muito abaixo da média
 *   - ZERO_CONSUMPTION     : dias consecutivos sem consumo
 *   - HAS_ALERT            : alerta nativo do dispositivo
 *
 * Acessível para qualquer usuário com permissão de leitura
 * (síndico, administradora, admin, programador).
 */

import React, { useState, useCallback, useEffect } from "react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertTriangle, AlertCircle, TrendingUp, TrendingDown,
  Minus, Bell, Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight,
  Loader2,
} from "lucide-react";
import ComboboxCompany from "@/components/ComboboxCompany";
import ComboboxComplex from "@/components/ComboboxComplex";
import ComboboxBlock from "@/components/ComboboxBlock";
import ComboboxApartment from "@/components/ComboboxApartment";
import { useUserContext } from "@/hooks/useUserContext";
import { DateRange } from "react-day-picker";

// ─── tipos ─────────────────────────────────────────────────────────────────────

interface Anomaly {
  readingId: string;
  date: string;
  readAt: string;
  delta: number;
  types: string[];
  isManual: boolean;
  zeroDaysCount?: number;
  zeroStart?: string;
}

interface MeterAlerts {
  meterId: string;
  register: string;
  glId: string | null;
  location: string;
  totalReadings: number;
  totalAnomalies: number;
  avgDailyDelta: number | null;
  stdDev: number | null;
  anomalies: Anomaly[];
}

interface AlertsResponse {
  fromDate: string;
  toDate: string;
  metersAnalyzed: number;
  metersWithAlerts: number;
  totalAnomalies: number;
  sigma: number;
  alerts: MeterAlerts[];
}

// ─── helpers ───────────────────────────────────────────────────────────────────

const ANOMALY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  NEGATIVE_CONSUMPTION: {
    label: "Consumo negativo",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  OUTLIER_HIGH: {
    label: "Pico de consumo",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  OUTLIER_LOW: {
    label: "Consumo muito baixo",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  ZERO_CONSUMPTION: {
    label: "Sem consumo",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    icon: <Minus className="h-3 w-3" />,
  },
  HAS_ALERT: {
    label: "Alerta do dispositivo",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icon: <Bell className="h-3 w-3" />,
  },
};

function AnomalyBadge({ type }: { type: string }) {
  const cfg = ANOMALY_CONFIG[type] ?? {
    label: type,
    color: "bg-gray-100 text-gray-800 border-gray-200",
    icon: <AlertCircle className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export default function AlertsPage() {
  const { context: userContext, loading: ctxLoading } = useUserContext();

  const [companyObj, setCompanyObj] = useState<any>();
  const [complexObj, setComplexObj] = useState<any>();
  const [blockObj, setBlockObj]     = useState<any>();
  const [apartmentObj, setApartmentObj] = useState<any>();
  const [autoSelected, setAutoSelected] = useState(false);

  // Auto-selecionar contexto baseado no perfil do usuário
  useEffect(() => {
    if (ctxLoading || autoSelected || !userContext) return;
    setAutoSelected(true);

    // Morador: seleciona diretamente seu apartamento (se tiver só 1)
    if (!userContext.isSystem && userContext.apartments.length > 0 && userContext.complexes.length === 0) {
      if (userContext.apartments.length === 1) {
        const apt = userContext.apartments[0];
        setComplexObj(apt.block?.complex ?? null);
        setBlockObj(apt.block ?? null);
        setApartmentObj(apt);
      }
    }

    // Síndico/administradora: seleciona o condomínio (se tiver só 1)
    if (!userContext.isSystem && userContext.complexes.length > 0) {
      if (userContext.complexes.length === 1) {
        setComplexObj(userContext.complexes[0]);
      }
    }
  }, [ctxLoading, userContext, autoSelected]);

  // Verificar se tem GL: morador sem GL não deveria ver a página
  const hasGLAccess = (() => {
    if (!userContext) return false;
    if (userContext.isSystem) return true;
    // Síndico/administradora: tem condomínios
    return userContext.complexes.length > 0;
  })();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });

  const [sigma, setSigma] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedMeters, setExpandedMeters] = useState<Set<string>>(new Set());

  const toggleMeter = (id: string) => {
    setExpandedMeters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rangeLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`
    : "Selecione um período";

  const fetchAlerts = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedMeters(new Set());

    try {
      const body: any = {
        fromDate: dateRange.from.toISOString(),
        toDate:   dateRange.to.toISOString(),
        sigma,
      };
      if (apartmentObj?.id) body.apartmentId = apartmentObj.id;
      else if (blockObj?.id) body.blockId = blockObj.id;
      else if (complexObj?.id) body.complexId = complexObj.id;
      else if (companyObj?.id) body.companyId = companyObj.id;

      const res = await fetch("/api/monitoring/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar alertas");
      setResult(data);

      // Auto-expand medidores com poucos alertas (≤3)
      const autoExpand = new Set<string>();
      (data.alerts as MeterAlerts[]).forEach((m) => {
        if (m.totalAnomalies <= 3) autoExpand.add(m.meterId);
      });
      setExpandedMeters(autoExpand);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange, sigma, apartmentObj, blockObj, complexObj, companyObj]);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-orange-500" />
          Central de Alertas de Consumo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Anomalias detectadas automaticamente: consumo negativo, picos, falta de consumo e alertas do dispositivo.
        </p>
      </div>

      {/* Aviso para usuários sem acesso GL */}
      {!ctxLoading && !hasGLAccess && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-amber-800">Central de Alertas indisponível</p>
            <p className="text-xs text-amber-700 mt-1">
              Esta funcionalidade está disponível apenas para condomínios com medidores integrados ao GroupLink.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Contexto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <ComboboxCompany
              company={companyObj}
              setSelectedCompany={(c: any) => {
                setCompanyObj(c);
                setComplexObj(undefined);
                setBlockObj(undefined);
                setApartmentObj(undefined);
              }}
            />
            <ComboboxComplex
              companyId={companyObj?.id}
              complex={complexObj}
              setSelectedComplex={(c: any) => {
                setComplexObj(c);
                setBlockObj(undefined);
                setApartmentObj(undefined);
              }}
            />
            <ComboboxBlock
              complexId={complexObj?.id}
              block={blockObj}
              setSelectedBlock={(b: any) => {
                setBlockObj(b);
                setApartmentObj(undefined);
              }}
            />
            <ComboboxApartment
              blockId={blockObj?.id}
              apartment={apartmentObj}
              setSelectedApartment={(a: any) => setApartmentObj(a)}
            />
          </div>

          {/* Período + sigma */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Período</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 text-sm gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {rangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={dateRange}
                    onSelect={setDateRange}
                    locale={ptBR}
                    defaultMonth={dateRange?.from}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Sensibilidade (sigma)</p>
              <div className="flex gap-1">
                {[1, 2, 3].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={sigma === s ? "default" : "outline"}
                    className="h-9 w-9 text-xs"
                    onClick={() => setSigma(s)}
                  >
                    {s}σ
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={fetchAlerts} disabled={loading} className="h-9 gap-2">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {loading ? "Analisando..." : "Buscar Alertas"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estado de carregamento */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Erro */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {result && !loading && (
        <>
          {/* Resumo geral */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">{result.metersAnalyzed}</div>
                <div className="text-xs text-muted-foreground mt-1">Medidores analisados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className={`text-2xl font-bold ${result.metersWithAlerts > 0 ? "text-orange-600" : "text-green-600"}`}>
                  {result.metersWithAlerts}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Com alertas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className={`text-2xl font-bold ${result.totalAnomalies > 0 ? "text-red-600" : "text-green-600"}`}>
                  {result.totalAnomalies}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Total de anomalias</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{result.sigma}σ</div>
                <div className="text-xs text-muted-foreground mt-1">Sensibilidade</div>
              </CardContent>
            </Card>
          </div>

          {result.alerts.length === 0 ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 text-center text-sm text-green-800">
                ✅ Nenhuma anomalia detectada no período selecionado.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <CardDescription className="text-xs">
                Medidores ordenados por número de anomalias. Clique para expandir os detalhes.
              </CardDescription>

              {result.alerts.map((meter) => {
                const expanded = expandedMeters.has(meter.meterId);
                const severity = meter.totalAnomalies >= 5 ? "high" : meter.totalAnomalies >= 2 ? "medium" : "low";
                const borderColor = severity === "high" ? "border-red-300" : severity === "medium" ? "border-orange-300" : "border-yellow-200";
                const headerColor = severity === "high" ? "bg-red-50" : severity === "medium" ? "bg-orange-50" : "bg-yellow-50";

                return (
                  <Card key={meter.meterId} className={`border ${borderColor}`}>
                    {/* Cabeçalho do medidor */}
                    <button
                      className={`w-full text-left px-4 py-3 ${headerColor} rounded-t-lg flex items-center justify-between hover:brightness-95 transition-all`}
                      onClick={() => toggleMeter(meter.meterId)}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          severity === "high" ? "text-red-600" : severity === "medium" ? "text-orange-500" : "text-yellow-500"
                        }`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm font-mono">{meter.register}</span>
                            {meter.glId && (
                              <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                GL: {meter.glId}
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                severity === "high"
                                  ? "border-red-400 text-red-700"
                                  : severity === "medium"
                                  ? "border-orange-400 text-orange-700"
                                  : "border-yellow-400 text-yellow-700"
                              }`}
                            >
                              {meter.totalAnomalies} anomalia{meter.totalAnomalies !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{meter.location || "—"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        {meter.avgDailyDelta !== null && (
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            Média: {meter.avgDailyDelta.toFixed(3)} m³/dia
                          </span>
                        )}
                        {expanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Tabela de anomalias */}
                    {expanded && (
                      <CardContent className="pt-0 pb-3 px-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[11px]">
                                <TableHead className="pl-4">Data</TableHead>
                                <TableHead>Δ (m³)</TableHead>
                                <TableHead>Tipo(s)</TableHead>
                                <TableHead>Origem</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {meter.anomalies.map((a) => (
                                <TableRow key={a.readingId} className="text-[11px]">
                                  <TableCell className="pl-4 font-mono whitespace-nowrap">
                                    {format(new Date(a.readAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                  </TableCell>
                                  <TableCell className={`font-mono ${a.delta < 0 ? "text-red-600" : a.delta === 0 ? "text-slate-400" : "text-green-700"}`}>
                                    {a.delta > 0 ? "+" : ""}{a.delta.toFixed(3)}
                                    {a.zeroDaysCount !== undefined && (
                                      <span className="ml-1 text-slate-500">({a.zeroDaysCount}d)</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {a.types
                                        .filter((t) => t !== "HAS_ALERT" || a.types.length === 1)
                                        .slice(0, 4)
                                        .map((t) => (
                                          <AnomalyBadge key={t} type={t} />
                                        ))}
                                      {a.types.length > 4 && (
                                        <span className="text-[10px] text-muted-foreground">+{a.types.length - 4}</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {a.isManual ? "Manual" : "Auto"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Estado inicial */}
      {!result && !loading && !error && (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            Selecione um contexto e clique em <strong>Buscar Alertas</strong> para iniciar a análise.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
