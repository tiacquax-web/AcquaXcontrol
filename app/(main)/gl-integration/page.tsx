"use client";

/**
 * app/(main)/gl-integration/page.tsx
 *
 * Página de administração da integração GroupLink (GL).
 *
 * Abas:
 *  1. Diagnóstico — env vars, medidores com glId, teste S3, últimos logs
 *  2. Vincular glIds — via JSON
 *  3. Importação Retroativa — range de datas
 *  4. Histórico de Execuções (GlImportLog)
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle, CheckCircle2, Clock, DatabaseZap, FileDown,
  Link2, Loader2, RefreshCw, Upload, Stethoscope, Wrench, Trash2, Search,
} from "lucide-react";
import SelectComplex from "@/components/ComboboxComplex";
import type { Complex } from "@prisma/client";

// ─── tipos ─────────────────────────────────────────────────────────────────────

interface ComplexPreview {
  complex: { id: string; name: string };
  blocks: Array<{ id: string; name: string }>;
  meters: { withGlId: number; withoutGlId: number; total: number };
}

interface SetMeterIdsResult {
  success: boolean;
  updated: number;
  alreadySet: number;
  notFound: Array<{ unidade: string | number; bloco: number; reason: string }>;
  errors: number;
  total: number;
}

interface GlImportLog {
  id: string;
  executedAt: string;
  filesFound: number;
  filesProcessed: number;
  rowsTotal: number;
  imported: number;
  skipped: number;
  errors: number;
  errorMessage?: string;
}

interface RetroactiveResult {
  success: boolean;
  daysRequested: number;
  daysProcessed: number;
  totalFilesFound: number;
  totalFilesProcessed: number;
  totalRowsTotal: number;
  totalImported: number;
  totalSkipped: number;
  totalErrors: number;
  byDay: Array<{
    date: string;
    filesFound: number;
    imported: number;
    skipped: number;
    errors: number;
    success: boolean;
    error?: string;
  }>;
}

interface DiagnosticsResult {
  ok: boolean;
  testedDate: string;
  envVars: Record<string, string>;
  readingsGL?: {
    total: number;
    maisRecente?: { readAt: string; reading: number | null } | null;
    maisAntiga?: { readAt: string; reading: number | null } | null;
    alerta: string;
  };
  medidores: {
    total: number;
    comGlId: number;
    semGlId: number;
    alerta: string;
    amostra: Array<{ id: string; register: string; glId: string | null; apartmentId: string | null }>;
  };
  s3: {
    status: string;
    prefix?: string;
    arquivosEncontrados?: number;
    keys?: string[];
    isTruncated?: boolean;
    message?: string;
    code?: string;
  };
  ultimosLogs: GlImportLog[];
}

// ─── componente principal ──────────────────────────────────────────────────────

export default function GlIntegrationPage() {
  const { toast } = useToast();

  // ── estado: condomínio selecionado ─────────────────────────────────────────
  const [selectedComplexId, setSelectedComplexId] = useState<string>("");
  const [preview, setPreview] = useState<ComplexPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── estado: vinculação em massa ────────────────────────────────────────────
  const [mappingJson, setMappingJson] = useState(`[
  { "unidade": 101, "bloco": 1, "glId": "3617386427" },
  { "unidade": 102, "bloco": 1, "glId": "3617624909" }
]`);
  const [overwrite, setOverwrite] = useState(false);
  const [loadingSet, setLoadingSet] = useState(false);
  const [setResult, setSetResult] = useState<SetMeterIdsResult | null>(null);

  // ── estado: importação retroativa ──────────────────────────────────────────
  const [fromDate, setFromDate] = useState("2026-05-12");
  const [toDate, setToDate]   = useState(new Date().toISOString().slice(0, 10));
  const [loadingRetro, setLoadingRetro] = useState(false);
  const [retroResult, setRetroResult]   = useState<RetroactiveResult | null>(null);

  // ── estado: histórico ──────────────────────────────────────────────────────
  const [logs, setLogs] = useState<GlImportLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ── estado: diagnóstico ────────────────────────────────────────────────────
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [diagDate, setDiagDate] = useState(new Date().toISOString().slice(0, 10));

  // ── estado: deep diagnostics ──────────────────────────────────────────────
  const [deepDiag, setDeepDiag] = useState<any | null>(null);
  const [loadingDeepDiag, setLoadingDeepDiag] = useState(false);

  // ── estado: device cleanup ────────────────────────────────────────────────
  const [cleanupPreview, setCleanupPreview] = useState<any | null>(null);
  const [loadingCleanup, setLoadingCleanup] = useState(false);
  const [cleanupExecuted, setCleanupExecuted] = useState(false);

  // ── buscar preview do condomínio ───────────────────────────────────────────
  const fetchPreview = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/gl/set-meter-ids?complexId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar preview");
      setPreview(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedComplexId) fetchPreview(selectedComplexId);
  }, [selectedComplexId, fetchPreview]);

  // ── buscar histórico de logs ───────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/admin/gl/retroactive-import?limit=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setLogs(data.logs ?? []);
    } catch (e: any) {
      toast({ title: "Erro ao buscar logs", description: e.message, variant: "destructive" });
    } finally {
      setLoadingLogs(false);
    }
  }, [toast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── diagnóstico ────────────────────────────────────────────────────────────
  const fetchDiagnostics = useCallback(async (date?: string) => {
    setLoadingDiag(true);
    setDiagnostics(null);
    try {
      const d = date ?? diagDate;
      const res = await fetch(`/api/admin/gl/diagnostics?date=${d}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar diagnóstico");
      setDiagnostics(data);
    } catch (e: any) {
      toast({ title: "Erro no diagnóstico", description: e.message, variant: "destructive" });
    } finally {
      setLoadingDiag(false);
    }
  }, [diagDate, toast]);

  // ── deep diagnostics ───────────────────────────────────────────────────────
  const fetchDeepDiagnostics = useCallback(async () => {
    setLoadingDeepDiag(true);
    setDeepDiag(null);
    try {
      const res = await fetch("/api/admin/gl/deep-diagnostics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setDeepDiag(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoadingDeepDiag(false);
    }
  }, [toast]);

  // ── device cleanup ─────────────────────────────────────────────────────────
  const fetchCleanupPreview = useCallback(async () => {
    setLoadingCleanup(true);
    setCleanupPreview(null);
    setCleanupExecuted(false);
    try {
      const res = await fetch("/api/admin/devices/cleanup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setCleanupPreview(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoadingCleanup(false);
    }
  }, [toast]);

  const executeCleanup = useCallback(async () => {
    if (!confirm(`Confirma a exclusão de ${cleanupPreview?.deletar ?? 0} dispositivos IoT não-East-Sider? Esta ação não pode ser desfeita facilmente.`)) return;
    setLoadingCleanup(true);
    try {
      const res = await fetch("/api/admin/devices/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setCleanupPreview(data);
      setCleanupExecuted(true);
      toast({
        title: `✅ ${data.deletados} dispositivos removidos`,
        description: `${data.mantidos} dispositivos East Sider mantidos.`,
      });
    } catch (e: any) {
      toast({ title: "Erro na limpeza", description: e.message, variant: "destructive" });
    } finally {
      setLoadingCleanup(false);
    }
  }, [cleanupPreview, toast]);

  // ── vincular glIds em massa ────────────────────────────────────────────────
  const handleSetMeterIds = async () => {
    if (!selectedComplexId) {
      toast({ title: "Selecione um condomínio", variant: "destructive" });
      return;
    }

    let mappings: any[];
    try {
      mappings = JSON.parse(mappingJson);
      if (!Array.isArray(mappings)) throw new Error("Deve ser um array JSON");
    } catch (e: any) {
      toast({ title: "JSON inválido", description: e.message, variant: "destructive" });
      return;
    }

    setLoadingSet(true);
    setSetResult(null);

    try {
      const res = await fetch("/api/admin/gl/set-meter-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId: selectedComplexId, mappings, overwrite }),
      });
      const data: SetMeterIdsResult = await res.json();
      if (!res.ok) throw new Error((data as any).error || "Erro");
      setSetResult(data);
      toast({
        title: `✅ ${data.updated} medidores vinculados`,
        description: `${data.alreadySet} já tinham glId | ${data.notFound.length} não encontrados`,
      });
      fetchPreview(selectedComplexId);
    } catch (e: any) {
      toast({ title: "Erro na vinculação", description: e.message, variant: "destructive" });
    } finally {
      setLoadingSet(false);
    }
  };

  // ── importação retroativa ──────────────────────────────────────────────────
  const handleRetroactive = async () => {
    if (!fromDate || !toDate) {
      toast({ title: "Informe fromDate e toDate", variant: "destructive" });
      return;
    }

    setLoadingRetro(true);
    setRetroResult(null);

    try {
      const res = await fetch("/api/admin/gl/retroactive-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      });
      const data: RetroactiveResult = await res.json();
      if (!res.ok) throw new Error((data as any).error || "Erro");
      setRetroResult(data);
      toast({
        title: `✅ Importação retroativa concluída`,
        description: `${data.daysProcessed} dias | ${data.totalImported} leituras importadas`,
      });
      fetchLogs();
    } catch (e: any) {
      toast({ title: "Erro na importação retroativa", description: e.message, variant: "destructive" });
    } finally {
      setLoadingRetro(false);
    }
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DatabaseZap className="h-7 w-7 text-blue-600" />
          Integração GroupLink (GL)
        </h1>
        <p className="text-muted-foreground mt-1">
          Vincule os IDs GroupLink aos medidores e gerencie a importação automática de leituras.
        </p>
      </div>

      {/* Seleção de condomínio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Selecionar Condomínio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Label>Condomínio</Label>
            <SelectComplex
              setSelectedComplex={(c: Complex | undefined) => setSelectedComplexId(c?.id ?? "")}
              complex={selectedComplexId ? { id: selectedComplexId } as Partial<Complex> : undefined}
            />
          </div>

          {loadingPreview && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          )}

          {preview && (
            <div className="flex flex-wrap gap-4 mt-2">
              <div className="bg-muted rounded-lg p-3 text-center min-w-[100px]">
                <div className="text-2xl font-bold text-green-600">{preview.meters.withGlId}</div>
                <div className="text-xs text-muted-foreground">Com glId</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center min-w-[100px]">
                <div className="text-2xl font-bold text-orange-500">{preview.meters.withoutGlId}</div>
                <div className="text-xs text-muted-foreground">Sem glId</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center min-w-[100px]">
                <div className="text-2xl font-bold">{preview.meters.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center min-w-[100px]">
                <div className="text-2xl font-bold text-blue-600">{preview.blocks.length}</div>
                <div className="text-xs text-muted-foreground">Blocos</div>
              </div>
            </div>
          )}

          {preview && preview.blocks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {preview.blocks.map((b) => (
                <Badge key={b.id} variant="outline">{b.name}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="diagnostico">
        <TabsList>
          <TabsTrigger value="diagnostico">
            <Stethoscope className="h-4 w-4 mr-1" />
            Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="vincular">
            <Link2 className="h-4 w-4 mr-1" />
            Vincular glIds
          </TabsTrigger>
          <TabsTrigger value="retroativo">
            <Upload className="h-4 w-4 mr-1" />
            Importação Retroativa
          </TabsTrigger>
          <TabsTrigger value="historico">
            <Clock className="h-4 w-4 mr-1" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="manutencao">
            <Wrench className="h-4 w-4 mr-1" />
            Manutenção
          </TabsTrigger>
        </TabsList>

        {/* ── ABA 0: Diagnóstico ────────────────────────────────────────────── */}
        <TabsContent value="diagnostico" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Diagnóstico da Integração GL</CardTitle>
              <CardDescription>
                Verifica env vars, credenciais S3, medidores com glId e conectividade ao bucket.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="diagDate">Data para testar no S3</Label>
                  <Input
                    id="diagDate"
                    type="date"
                    value={diagDate}
                    onChange={(e) => setDiagDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button onClick={() => fetchDiagnostics(diagDate)} disabled={loadingDiag}>
                  {loadingDiag
                    ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    : <Stethoscope className="h-4 w-4 mr-1" />}
                  Executar Diagnóstico
                </Button>
              </div>

              {diagnostics && (
                <div className="space-y-5">

                  {/* Env Vars */}
                  <div>
                    <p className="font-semibold text-sm mb-2">Variáveis de Ambiente</p>
                    <div className="rounded-md border divide-y">
                      {Object.entries(diagnostics.envVars).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground">{key}</span>
                          <span className={val.startsWith("❌") ? "text-red-600" : "text-green-700"}>
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Medidores */}
                  <div>
                    <p className="font-semibold text-sm mb-2">Medidores com glId</p>
                    <div className={`rounded-md p-3 text-sm border ${
                      diagnostics.medidores.comGlId === 0
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-green-300 bg-green-50 text-green-800"
                    }`}>
                      {diagnostics.medidores.alerta}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <div className="bg-muted rounded p-2 text-center min-w-[80px]">
                        <div className="text-xl font-bold text-green-600">{diagnostics.medidores.comGlId}</div>
                        <div className="text-xs text-muted-foreground">Com glId</div>
                      </div>
                      <div className="bg-muted rounded p-2 text-center min-w-[80px]">
                        <div className="text-xl font-bold text-orange-500">{diagnostics.medidores.semGlId}</div>
                        <div className="text-xs text-muted-foreground">Sem glId</div>
                      </div>
                      <div className="bg-muted rounded p-2 text-center min-w-[80px]">
                        <div className="text-xl font-bold">{diagnostics.medidores.total}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                    </div>
                    {diagnostics.medidores.amostra.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Amostra (primeiros 10 com glId):</p>
                        <div className="max-h-40 overflow-y-auto border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Chassi</TableHead>
                                <TableHead>glId</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {diagnostics.medidores.amostra.map((m) => (
                                <TableRow key={m.id}>
                                  <TableCell className="font-mono text-xs">{m.register}</TableCell>
                                  <TableCell className="font-mono text-xs text-blue-700">{m.glId}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Readings GL no banco */}
                  {diagnostics.readingsGL && (
                    <div>
                      <p className="font-semibold text-sm mb-2">Leituras GL no Banco</p>
                      <div className={`rounded-md p-3 text-sm border ${
                        diagnostics.readingsGL.total > 0
                          ? "border-green-300 bg-green-50 text-green-800"
                          : "border-red-300 bg-red-50 text-red-800"
                      }`}>
                        <p className="font-medium">{diagnostics.readingsGL.alerta}</p>
                        {diagnostics.readingsGL.total > 0 && (
                          <div className="mt-2 space-y-1 text-xs">
                            {diagnostics.readingsGL.maisAntiga && (
                              <p>🗓️ Mais antiga: <strong>{new Date(diagnostics.readingsGL.maisAntiga.readAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</strong></p>
                            )}
                            {diagnostics.readingsGL.maisRecente && (
                              <p>🗓️ Mais recente: <strong>{new Date(diagnostics.readingsGL.maisRecente.readAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</strong></p>
                            )}
                          </div>
                        )}
                        {diagnostics.readingsGL.total === 0 && (
                          <p className="text-xs mt-2">⚠️ Execute a <strong>Importação Retroativa</strong> para popular o banco com as leituras históricas do S3.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* S3 */}
                  <div>
                    <p className="font-semibold text-sm mb-2">Teste S3 — {diagnostics.testedDate}</p>
                    <div className={`rounded-md p-3 text-sm border ${
                      diagnostics.s3.status.startsWith("✅")
                        ? "border-green-300 bg-green-50 text-green-800"
                        : "border-red-300 bg-red-50 text-red-800"
                    }`}>
                      <p className="font-medium">{diagnostics.s3.status}</p>
                      {diagnostics.s3.prefix && (
                        <p className="text-xs mt-1 font-mono">Prefixo: {diagnostics.s3.prefix}</p>
                      )}
                      {diagnostics.s3.arquivosEncontrados !== undefined && (
                        <p className="text-xs mt-1">
                          Arquivos encontrados: <strong>{diagnostics.s3.arquivosEncontrados}</strong>
                          {diagnostics.s3.isTruncated && " (truncado — há mais)"}
                        </p>
                      )}
                      {diagnostics.s3.message && (
                        <p className="text-xs mt-1 font-mono break-all">Erro: {diagnostics.s3.message}</p>
                      )}
                      {diagnostics.s3.code && (
                        <p className="text-xs mt-1">Código: {diagnostics.s3.code}</p>
                      )}
                    </div>
                    {diagnostics.s3.keys && diagnostics.s3.keys.length > 0 && (
                      <div className="mt-2 border rounded-md p-2 max-h-32 overflow-y-auto bg-muted">
                        {diagnostics.s3.keys.map((k) => (
                          <p key={k} className="font-mono text-xs text-muted-foreground">{k}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Últimos logs */}
                  {diagnostics.ultimosLogs.length > 0 && (
                    <div>
                      <p className="font-semibold text-sm mb-2">Últimas 5 Execuções</p>
                      <div className="border rounded-md overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Arquivos</TableHead>
                              <TableHead>Linhas</TableHead>
                              <TableHead>Import.</TableHead>
                              <TableHead>Descart.</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {diagnostics.ultimosLogs.map((log: any) => (
                              <TableRow key={log.id ?? log.error}>
                                <TableCell className="font-mono text-xs">
                                  {log.executedAt
                                    ? new Date(log.executedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                                    : "—"}
                                </TableCell>
                                <TableCell>{log.filesFound ?? "—"}</TableCell>
                                <TableCell>{log.rowsTotal ?? "—"}</TableCell>
                                <TableCell className="text-green-700">{log.imported ?? "—"}</TableCell>
                                <TableCell className="text-orange-600">{log.skipped ?? "—"}</TableCell>
                                <TableCell>
                                  {log.error
                                    ? <Badge variant="destructive" className="text-xs">{log.error}</Badge>
                                    : log.errorMessage
                                    ? <Badge variant="destructive" className="text-xs" title={log.errorMessage}>FALHA</Badge>
                                    : <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">OK</Badge>
                                  }
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 1: Vincular glIds ─────────────────────────────────────────── */}
        <TabsContent value="vincular" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Mapear glIds → Medidores</CardTitle>
              <CardDescription>
                Cole o array JSON com os mapeamentos da planilha GL.
                Cada item deve ter: <code>unidade</code> (ex: 101), <code>bloco</code> (ex: 1) e <code>glId</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mapeamentos (JSON)</Label>
                <textarea
                  className="w-full h-64 p-2 text-xs font-mono border rounded-md bg-muted resize-y"
                  value={mappingJson}
                  onChange={(e) => setMappingJson(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Formato: <code>{`[{"unidade": 101, "bloco": 1, "glId": "3617386427"}, ...]`}</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="overwrite"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="overwrite" className="cursor-pointer">
                  Sobrescrever glIds já preenchidos
                </Label>
              </div>

              <Button
                onClick={handleSetMeterIds}
                disabled={loadingSet || !selectedComplexId}
                className="flex items-center gap-2"
              >
                {loadingSet ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {loadingSet ? "Vinculando..." : "Vincular glIds"}
              </Button>

              {setResult && (
                <div className="space-y-3 mt-2">
                  <div className="flex flex-wrap gap-3">
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {setResult.updated} atualizados
                    </Badge>
                    <Badge variant="outline">
                      {setResult.alreadySet} já tinham glId
                    </Badge>
                    {setResult.notFound.length > 0 && (
                      <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {setResult.notFound.length} não encontrados
                      </Badge>
                    )}
                    {setResult.errors > 0 && (
                      <Badge variant="destructive">{setResult.errors} erros</Badge>
                    )}
                  </div>

                  {setResult.notFound.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-orange-700 mb-1">Não encontrados:</p>
                      <div className="max-h-48 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Bloco</TableHead>
                              <TableHead>Unidade</TableHead>
                              <TableHead>Motivo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {setResult.notFound.map((nf, i) => (
                              <TableRow key={i}>
                                <TableCell>{nf.bloco}</TableCell>
                                <TableCell>{nf.unidade}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{nf.reason}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 2: Importação Retroativa ─────────────────────────────────── */}
        <TabsContent value="retroativo" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importar Leituras Históricas do S3</CardTitle>
              <CardDescription>
                Processa arquivos GL no S3 para um range de datas. Os medidores devem ter <code>glId</code> preenchido primeiro — use a aba <strong>Diagnóstico</strong> para confirmar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <Label htmlFor="fromDate">Data Inicial</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="toDate">Data Final</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-44"
                  />
                </div>
              </div>

              {fromDate && toDate && (
                <p className="text-sm text-muted-foreground">
                  {Math.max(0, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1)} dias no range
                </p>
              )}

              <Button
                onClick={handleRetroactive}
                disabled={loadingRetro}
                variant="default"
                className="flex items-center gap-2"
              >
                {loadingRetro ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                {loadingRetro ? "Importando... (pode demorar)" : "Iniciar Importação Retroativa"}
              </Button>

              {loadingRetro && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando arquivos S3... Isso pode levar alguns minutos.
                </div>
              )}

              {retroResult && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {retroResult.totalImported} leituras importadas
                    </Badge>
                    <Badge variant="outline">{retroResult.daysProcessed}/{retroResult.daysRequested} dias</Badge>
                    <Badge variant="outline">{retroResult.totalFilesFound} arquivos S3</Badge>
                    <Badge variant="outline">{retroResult.totalRowsTotal} linhas CSV</Badge>
                    {retroResult.totalSkipped > 0 && (
                      <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                        {retroResult.totalSkipped} descartadas (sem glId no banco)
                      </Badge>
                    )}
                    {retroResult.totalErrors > 0 && (
                      <Badge variant="destructive">{retroResult.totalErrors} erros</Badge>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Arquivos</TableHead>
                          <TableHead>Linhas</TableHead>
                          <TableHead>Importadas</TableHead>
                          <TableHead>Descartadas</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {retroResult.byDay.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-mono text-xs">{day.date}</TableCell>
                            <TableCell>{day.filesFound}</TableCell>
                            <TableCell>{day.imported + day.skipped}</TableCell>
                            <TableCell className="text-green-700 font-medium">{day.imported}</TableCell>
                            <TableCell className="text-orange-600">{day.skipped}</TableCell>
                            <TableCell>
                              {day.success ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">OK</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs" title={day.error}>
                                  {day.error ? day.error.slice(0, 40) : "ERRO"}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 4: Manutenção ────────────────────────────────────────────── */}
        <TabsContent value="manutencao" className="space-y-4 mt-4">

          {/* Deep Diagnostics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Diagnóstico Profundo do Banco</CardTitle>
              <CardDescription>
                Verifica exatamente o que está no banco: medidores com glId, leituras GL, devices IoT e MeterDeviceLinks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={fetchDeepDiagnostics} disabled={loadingDeepDiag}>
                {loadingDeepDiag
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Search className="h-4 w-4 mr-1" />}
                Executar Diagnóstico Profundo
              </Button>

              {deepDiag && (
                <div className="space-y-5">
                  {/* Condomínios */}
                  <div>
                    <p className="font-semibold text-sm mb-1">Condomínios no banco:</p>
                    <div className="flex flex-wrap gap-1">
                      {deepDiag.condomínios.map((c: any) => (
                        <Badge key={c.id} variant="outline">{c.name}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* East Sider meters */}
                  <div className={`rounded-md p-3 text-sm border ${
                    deepDiag.eastSiderMeters.total > 0
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-red-300 bg-red-50 text-red-800"
                  }`}>
                    <p className="font-medium">Medidores East Sider com glId: <strong>{deepDiag.eastSiderMeters.total}</strong></p>
                    {deepDiag.eastSiderMeters.total === 0 && (
                      <p className="text-xs mt-1">❌ Nenhum medidor East Sider com glId — use a aba Vincular glIds para mapear.</p>
                    )}
                  </div>

                  {/* Readings GL */}
                  <div className={`rounded-md p-3 text-sm border ${
                    deepDiag.readingsGL.total > 0
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-red-300 bg-red-50 text-red-800"
                  }`}>
                    <p className="font-medium">{deepDiag.readingsGL.alerta}</p>
                    {deepDiag.readingsGL.maisRecentes?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">Últimas 5 leituras GL:</p>
                        <div className="space-y-1">
                          {deepDiag.readingsGL.maisRecentes.slice(0, 5).map((r: any) => (
                            <p key={r.id} className="text-xs font-mono">
                              {new Date(r.readAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} | meter: {r.meterId?.slice(-8)} | {r.reading} m³ | reg: {r.registerName}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Todas as readings */}
                  <div className="rounded-md p-3 text-sm border">
                    <p className="font-medium">Total de leituras no banco (qualquer tipo): <strong>{deepDiag.todasReadings.total}</strong></p>
                    {deepDiag.todasReadings.maisRecentes?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">Últimas 5 leituras (qualquer):</p>
                        <div className="space-y-1">
                          {deepDiag.todasReadings.maisRecentes.slice(0, 5).map((r: any) => (
                            <p key={r.id} className="text-xs font-mono">
                              {new Date(r.readAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} | meterId: {r.meterId ? r.meterId.slice(-8) : "null"} | deviceId: {r.deviceId ?? "null"} | reg: {r.registerName ?? "null"}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* IoT Devices */}
                  <div className="rounded-md p-3 text-sm border">
                    <p className="font-medium">Dispositivos IoT ativos: <strong>{deepDiag.iotDevices.total}</strong></p>
                    {deepDiag.iotDevices.amostra?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {deepDiag.iotDevices.amostra.map((d: any) => (
                          <p key={d.id} className="text-xs font-mono">
                            {d.deviceId} | {d.name ?? "sem nome"} | último: {d.lastSeenDate ?? "nunca"}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* MeterDeviceLinks */}
                  <div className="rounded-md p-3 text-sm border">
                    <p className="font-medium">MeterDeviceLinks ativos: <strong>{deepDiag.meterDeviceLinks.total}</strong></p>
                    {deepDiag.meterDeviceLinks.amostra?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {deepDiag.meterDeviceLinks.amostra.slice(0, 5).map((l: any) => (
                          <p key={l.id} className="text-xs font-mono">
                            device: {l.deviceId} → meter: {l.meter?.register ?? l.meterId?.slice(-8)} (glId: {l.meter?.glId ?? "sem glId"})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device Cleanup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                Limpeza de Dispositivos IoT
              </CardTitle>
              <CardDescription>
                Remove dispositivos IoT não vinculados ao East Side Méier.
                <strong className="text-red-700"> Irreversível!</strong> Mantenha apenas os dispositivos do condomínio ativo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" onClick={fetchCleanupPreview} disabled={loadingCleanup}>
                {loadingCleanup
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Search className="h-4 w-4 mr-1" />}
                Preview — O que seria removido?
              </Button>

              {cleanupPreview && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {cleanupPreview.manter} manter (East Sider)
                    </Badge>
                    <Badge className={cleanupPreview.deletar > 0 ? "bg-red-100 text-red-800 border-red-200" : "bg-muted text-muted-foreground"}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      {cleanupPreview.deletar} remover
                    </Badge>
                    <Badge variant="outline">{cleanupPreview.orphans} sem vínculo</Badge>
                  </div>

                  {cleanupPreview.dispositivosParaDeletar?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-1">Dispositivos que serão removidos:</p>
                      <div className="max-h-48 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>deviceId</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Complexo(s)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cleanupPreview.dispositivosParaDeletar.map((d: any) => (
                              <TableRow key={d.deviceId}>
                                <TableCell className="font-mono text-xs">{d.deviceId}</TableCell>
                                <TableCell className="text-xs">{d.name ?? "—"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{d.complexos.join(", ") || "sem vínculo"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {cleanupPreview.dispositivosParaManter?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-1">Dispositivos East Sider mantidos:</p>
                      <div className="flex flex-wrap gap-1">
                        {cleanupPreview.dispositivosParaManter.map((d: any) => (
                          <Badge key={d.deviceId} variant="outline" className="text-xs font-mono">{d.deviceId}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {!cleanupExecuted && cleanupPreview.deletar > 0 && (
                    <Button
                      variant="destructive"
                      onClick={executeCleanup}
                      disabled={loadingCleanup}
                    >
                      {loadingCleanup
                        ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        : <Trash2 className="h-4 w-4 mr-1" />}
                      Confirmar Exclusão de {cleanupPreview.deletar} Dispositivos
                    </Button>
                  )}

                  {cleanupExecuted && (
                    <div className="rounded-md p-3 text-sm border border-green-300 bg-green-50 text-green-800">
                      ✅ Limpeza concluída. {cleanupPreview.deletados} dispositivos removidos.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 3: Histórico ─────────────────────────────────────────────── */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Histórico de Execuções do Cron</CardTitle>
                  <CardDescription>
                    Registro de cada execução do cron automático (07:00 e 19:00 BRT) e das importações manuais.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loadingLogs ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma execução registrada ainda.
                  <br />
                  <span className="text-xs">Os logs aparecerão após a primeira execução do cron ou importação retroativa.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Executado em</TableHead>
                        <TableHead>Arquivos</TableHead>
                        <TableHead>Linhas</TableHead>
                        <TableHead>Importadas</TableHead>
                        <TableHead>Descartadas</TableHead>
                        <TableHead>Erros</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            {new Date(log.executedAt).toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                            })}
                          </TableCell>
                          <TableCell>{log.filesFound}</TableCell>
                          <TableCell>{log.rowsTotal}</TableCell>
                          <TableCell className="text-green-700 font-medium">{log.imported}</TableCell>
                          <TableCell className="text-orange-600">{log.skipped}</TableCell>
                          <TableCell className={log.errors > 0 ? "text-red-600" : ""}>{log.errors}</TableCell>
                          <TableCell>
                            {log.errorMessage ? (
                              <Badge variant="destructive" className="text-xs" title={log.errorMessage}>
                                FALHA
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
