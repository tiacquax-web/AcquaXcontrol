"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

interface ObservabilityData {
  counters: {
    importedReadings: number;
    importedAnomalies: number;
    linkedDevices: number;
    unlinkedDevices: number;
    importErrors: number;
    importSuccess: number;
    avgIngestionDurationSec: number;
    importedReadingsToday: number;
    importedAnomaliesToday: number;
    ingestionFailuresToday: number;
  };
  latestFiles: Array<{
    id: string;
    companyId: string;
    bucket: string;
    objectKey: string;
    trigger?: string | null;
    correlationId?: string | null;
    status: string;
    totalRows?: number | null;
    rowErrorsCount?: number | null;
    durationMs?: number | null;
    processedAt?: string | null;
    errorMessage?: string | null;
  }>;
  timeline: Array<{
    correlationId: string;
    trigger: string;
    startedAt: string;
    finishedAt: string;
    filesTotal: number;
    filesSuccess: number;
    filesError: number;
    totalRows: number;
    rowErrors: number;
    durationMs: number;
  }>;
  latestAudits: Array<{
    id: string;
    userId: string;
    action: string;
    target?: string | null;
    status: string;
    correlationId?: string | null;
    createdAt: string;
  }>;
}

interface IngestionListResponse {
  list: Array<{
    id: string;
    bucket: string;
    objectKey: string;
    status: string;
    trigger?: string | null;
    correlationId?: string | null;
    totalRows?: number | null;
    rowErrorsCount?: number | null;
    durationMs?: number | null;
    processedAt?: string | null;
    createdAt: string;
    errorMessage?: string | null;
    _count?: { errors: number };
  }>;
  total: number;
  pagination: { take: number; skip: number; hasMore: boolean };
}

interface IngestionDetailResponse {
  processing: any;
  pagination: { take: number; skip: number; total: number; hasMore: boolean };
}

export default function GrouplinkAdminPage() {
  const { toast } = useToast();
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [objectKey, setObjectKey] = useState("");
  const [observability, setObservability] = useState<ObservabilityData | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [ingestions, setIngestions] = useState<IngestionListResponse["list"]>([]);
  const [ingestionPagination, setIngestionPagination] = useState({ take: 15, skip: 0, total: 0, hasMore: false });
  const [selectedProcessingId, setSelectedProcessingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IngestionDetailResponse | null>(null);
  const [detailPage, setDetailPage] = useState({ take: 25, skip: 0 });

  const loadObservability = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/grouplink/observability");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar observabilidade");
      setObservability(data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar painel",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }, [toast]);

  const loadIngestions = useCallback(
    async (skip = 0) => {
      setLoadingList(true);
      try {
        const params = new URLSearchParams({
          take: String(ingestionPagination.take),
          skip: String(skip),
        });
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
        const response = await fetch(`/api/admin/grouplink/ingestions?${params.toString()}`);
        const data = (await response.json()) as IngestionListResponse;
        if (!response.ok) throw new Error((data as any).error || "Falha ao carregar ingestões");
        setIngestions(data.list);
        setIngestionPagination({ take: data.pagination.take, skip: data.pagination.skip, total: data.total, hasMore: data.pagination.hasMore });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro ao carregar ingestões",
          description: error instanceof Error ? error.message : "Erro desconhecido",
        });
      } finally {
        setLoadingList(false);
      }
    },
    [debouncedSearch, ingestionPagination.take, toast],
  );

  const loadDetails = useCallback(
    async (processingId: string, skip = 0) => {
      setLoadingDetail(true);
      try {
        const params = new URLSearchParams({
          take: String(detailPage.take),
          skip: String(skip),
        });
        const response = await fetch(`/api/admin/grouplink/ingestions/${processingId}?${params.toString()}`);
        const data = (await response.json()) as IngestionDetailResponse;
        if (!response.ok) throw new Error((data as any).error || "Falha ao carregar detalhes");
        setDetail(data);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro ao carregar detalhes",
          description: error instanceof Error ? error.message : "Erro desconhecido",
        });
      } finally {
        setLoadingDetail(false);
      }
    },
    [detailPage.take, toast],
  );

  useEffect(() => {
    loadObservability();
  }, [loadObservability]);

  useEffect(() => {
    loadIngestions(0);
  }, [loadIngestions]);

  useEffect(() => {
    if (selectedProcessingId) {
      setDetailPage((prev) => ({ ...prev, skip: 0 }));
      loadDetails(selectedProcessingId, 0);
    }
  }, [selectedProcessingId, loadDetails]);

  const runAction = async (label: string, request: () => Promise<Response>) => {
    setLoadingAction(true);
    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || `Falha em ${label}`);
      toast({
        title: `${label} executado`,
        description: data.message || "Operação concluída com sucesso.",
      });
      await Promise.all([loadObservability(), loadIngestions(0)]);
      if (selectedProcessingId) {
        await loadDetails(selectedProcessingId, detailPage.skip);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: `Erro em ${label}`,
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResetPilot = async () => {
    const firstConfirm = window.confirm("Você tem certeza que deseja resetar o piloto?");
    if (!firstConfirm) return;
    const typed = window.prompt('Digite exatamente "RESETAR PILOTO" para confirmar.');
    if (!typed) return;
    await runAction("Reset Piloto", () =>
      fetch("/api/admin/grouplink/pilot/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearPilotFlags: true, confirmationText: typed }),
      }),
    );
  };

  const visibleTimeline = useMemo(() => observability?.timeline || [], [observability?.timeline]);

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Painel Operacional Grouplink (Piloto)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              disabled={loadingAction}
              onClick={() =>
                runAction("Ingestão Manual", () =>
                  fetch("/api/admin/grouplink-ingestion", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ trigger: "manual" }),
                  }),
                )
              }
            >
              Executar ingestão manual
            </Button>
            <Button disabled={loadingAction} variant="destructive" onClick={handleResetPilot}>
              Resetar piloto (protegido)
            </Button>
            <Button
              disabled={loadingAction}
              variant="outline"
              onClick={() =>
                runAction("Limpar desvinculados", () =>
                  fetch("/api/admin/grouplink/devices/cleanup-unlinked", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ onlyWithoutReadings: true }),
                  }),
                )
              }
            >
              Limpar dispositivos desvinculados
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label htmlFor="objectKey">Reprocessar arquivo específico (objectKey)</Label>
              <Input
                id="objectKey"
                placeholder="ex: grouplink/batch/arquivo.csv"
                value={objectKey}
                onChange={(e) => setObjectKey(e.target.value)}
              />
            </div>
            <Button
              disabled={loadingAction || !objectKey.trim()}
              onClick={() =>
                runAction("Reprocessar arquivo", () =>
                  fetch("/api/admin/grouplink/reprocess-file", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ objectKey: objectKey.trim() }),
                  }),
                )
              }
            >
              Reprocessar arquivo
            </Button>
            <Button disabled={loadingAction} variant="secondary" onClick={() => window.open("/api/admin/grouplink/links/export", "_blank")}>
              Exportar relatório de vínculos
            </Button>
          </div>
        </CardContent>
      </Card>

      {observability && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard title="Devices vinculados" value={observability.counters.linkedDevices} />
            <MetricCard title="Devices desvinculados" value={observability.counters.unlinkedDevices} />
            <MetricCard title="Leituras importadas hoje" value={observability.counters.importedReadingsToday} />
            <MetricCard title="Anomalias hoje" value={observability.counters.importedAnomaliesToday} />
            <MetricCard title="Falhas ingestão hoje" value={observability.counters.ingestionFailuresToday} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Timeline dos últimos processamentos (por correlationId)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum processamento recente encontrado.</p>
              ) : (
                visibleTimeline.map((item) => (
                  <div key={item.correlationId} className="border rounded p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.filesError > 0 ? "destructive" : "success"}>
                        {item.filesError > 0 ? "com falhas" : "ok"}
                      </Badge>
                      <span className="font-mono text-xs">correlationId: {item.correlationId}</span>
                      <span className="text-muted-foreground">trigger: {item.trigger}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <span>Arquivos: {item.filesTotal}</span>
                      <span>Erros de linha: {item.rowErrors}</span>
                      <span>Volume linhas: {item.totalRows}</span>
                      <span>Duração (ms): {item.durationMs}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes de ingestão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Input
                  placeholder="Buscar por objectKey, bucket, correlationId..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button variant="outline" onClick={() => loadIngestions(0)} disabled={loadingList}>
                  Atualizar lista
                </Button>
              </div>

              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-2 py-1">Status</th>
                      <th className="text-left px-2 py-1">Object Key</th>
                      <th className="text-left px-2 py-1">CorrelationId</th>
                      <th className="text-left px-2 py-1">Linhas</th>
                      <th className="text-left px-2 py-1">Erros</th>
                      <th className="text-left px-2 py-1">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingList ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                          Carregando ingestões...
                        </td>
                      </tr>
                    ) : ingestions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                          Nenhuma ingestão encontrada.
                        </td>
                      </tr>
                    ) : (
                      ingestions.map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b cursor-pointer ${selectedProcessingId === item.id ? "bg-muted" : ""}`}
                          onClick={() => setSelectedProcessingId(item.id)}
                        >
                          <td className="px-2 py-1">
                            <Badge variant={item.status === "success" ? "success" : item.status === "error" ? "destructive" : "secondary"}>
                              {item.status}
                            </Badge>
                          </td>
                          <td className="px-2 py-1">{item.objectKey}</td>
                          <td className="px-2 py-1 font-mono text-xs">{item.correlationId || "-"}</td>
                          <td className="px-2 py-1">{item.totalRows ?? 0}</td>
                          <td className="px-2 py-1">{item.rowErrorsCount ?? item._count?.errors ?? 0}</td>
                          <td className="px-2 py-1">{item.durationMs ?? 0}ms</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {Math.min(ingestionPagination.skip + 1, ingestionPagination.total)} -{" "}
                  {Math.min(ingestionPagination.skip + ingestionPagination.take, ingestionPagination.total)} de {ingestionPagination.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ingestionPagination.skip === 0 || loadingList}
                    onClick={() => loadIngestions(Math.max(ingestionPagination.skip - ingestionPagination.take, 0))}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ingestionPagination.hasMore || loadingList}
                    onClick={() => loadIngestions(ingestionPagination.skip + ingestionPagination.take)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>

              {selectedProcessingId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Erros por linha da ingestão selecionada</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          window.open(`/api/admin/grouplink/ingestions/${selectedProcessingId}/errors/export`, "_blank")
                        }
                      >
                        Exportar erros CSV
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          runAction("Reprocessar apenas falhas", () =>
                            fetch(`/api/admin/grouplink/ingestions/${selectedProcessingId}/reprocess-failures`, {
                              method: "POST",
                            }),
                          )
                        }
                        disabled={loadingAction}
                      >
                        Reprocessar apenas falhas
                      </Button>
                    </div>

                    {loadingDetail ? (
                      <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
                    ) : detail?.processing?.errors?.length ? (
                      <div className="overflow-x-auto border rounded">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left px-2 py-1">Linha</th>
                              <th className="text-left px-2 py-1">Motivo</th>
                              <th className="text-left px-2 py-1">Conteúdo bruto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.processing.errors.map((error: any) => (
                              <tr key={error.id} className="border-b">
                                <td className="px-2 py-1">{error.lineNumber}</td>
                                <td className="px-2 py-1 text-red-600">{error.errorMessage}</td>
                                <td className="px-2 py-1 font-mono text-xs">{error.rawLine || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem erros registrados para essa ingestão.</p>
                    )}

                    {detail && (
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {Math.min(detail.pagination.skip + 1, detail.pagination.total)} -{" "}
                          {Math.min(detail.pagination.skip + detail.pagination.take, detail.pagination.total)} de {detail.pagination.total}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={detail.pagination.skip === 0 || loadingDetail}
                            onClick={() => {
                              const newSkip = Math.max(detail.pagination.skip - detail.pagination.take, 0);
                              setDetailPage((prev) => ({ ...prev, skip: newSkip }));
                              loadDetails(selectedProcessingId, newSkip);
                            }}
                          >
                            Anterior
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!detail.pagination.hasMore || loadingDetail}
                            onClick={() => {
                              const newSkip = detail.pagination.skip + detail.pagination.take;
                              setDetailPage((prev) => ({ ...prev, skip: newSkip }));
                              loadDetails(selectedProcessingId, newSkip);
                            }}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auditoria básica (ações admin)</CardTitle>
            </CardHeader>
            <CardContent>
              {observability.latestAudits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem ações registradas.</p>
              ) : (
                <div className="space-y-2">
                  {observability.latestAudits.map((audit) => (
                    <div key={audit.id} className="border rounded p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={audit.status === "success" ? "success" : audit.status === "blocked" ? "secondary" : "destructive"}>
                          {audit.status}
                        </Badge>
                        <span>{audit.action}</span>
                        <span className="text-muted-foreground">user: {audit.userId}</span>
                        {audit.correlationId && <span className="font-mono text-xs">corr: {audit.correlationId}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
