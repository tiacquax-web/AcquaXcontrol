"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ObservabilityData {
  counters: {
    importedReadings: number;
    importedAnomalies: number;
    linkedDevices: number;
    unlinkedDevices: number;
    importErrors: number;
    importSuccess: number;
    avgIngestionDurationSec: number;
  };
  latestFiles: Array<{
    id: string;
    companyId: string;
    bucket: string;
    objectKey: string;
    status: string;
    processedAt?: string | null;
    errorMessage?: string | null;
  }>;
}

export default function GrouplinkAdminPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [objectKey, setObjectKey] = useState("");
  const [observability, setObservability] = useState<ObservabilityData | null>(null);

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

  useEffect(() => {
    loadObservability();
  }, [loadObservability]);

  const runAction = async (label: string, request: () => Promise<Response>) => {
    setLoading(true);
    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || `Falha em ${label}`);
      toast({
        title: `${label} executado`,
        description: data.message || "Operação concluída com sucesso.",
      });
      await loadObservability();
    } catch (error) {
      toast({
        variant: "destructive",
        title: `Erro em ${label}`,
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Painel Operacional Grouplink (Piloto)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              disabled={loading}
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
            <Button
              disabled={loading}
              variant="outline"
              onClick={() =>
                runAction("Reset Piloto", () =>
                  fetch("/api/admin/grouplink/pilot/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clearPilotFlags: true }),
                  }),
                )
              }
            >
              Resetar piloto
            </Button>
            <Button
              disabled={loading}
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
              disabled={loading || !objectKey.trim()}
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
            <Button
              disabled={loading}
              variant="secondary"
              onClick={() => window.open("/api/admin/grouplink/links/export", "_blank")}
            >
              Exportar relatório de vínculos
            </Button>
          </div>
        </CardContent>
      </Card>

      {observability && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard title="Leituras importadas" value={observability.counters.importedReadings} />
            <MetricCard title="Anomalias importadas" value={observability.counters.importedAnomalies} />
            <MetricCard title="Devices vinculados" value={observability.counters.linkedDevices} />
            <MetricCard title="Devices desvinculados" value={observability.counters.unlinkedDevices} />
            <MetricCard title="Arquivos sucesso" value={observability.counters.importSuccess} />
            <MetricCard title="Erros de importação" value={observability.counters.importErrors} />
            <MetricCard title="Tempo médio ingestão (s)" value={observability.counters.avgIngestionDurationSec} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Últimos arquivos processados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-2 py-1">Status</th>
                      <th className="text-left px-2 py-1">Bucket</th>
                      <th className="text-left px-2 py-1">Object Key</th>
                      <th className="text-left px-2 py-1">Empresa</th>
                      <th className="text-left px-2 py-1">Processado em</th>
                      <th className="text-left px-2 py-1">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observability.latestFiles.map((file) => (
                      <tr key={file.id} className="border-b">
                        <td className="px-2 py-1">{file.status}</td>
                        <td className="px-2 py-1">{file.bucket}</td>
                        <td className="px-2 py-1">{file.objectKey}</td>
                        <td className="px-2 py-1">{file.companyId}</td>
                        <td className="px-2 py-1">{file.processedAt || "-"}</td>
                        <td className="px-2 py-1 text-red-600">{file.errorMessage || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
