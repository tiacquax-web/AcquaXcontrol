"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, FileSpreadsheet, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImportDeviceChassiTabProps {
  onImport: (payload: {
    rows: Array<{ device_id: string; chassi: string; pilotMode?: boolean }>;
    pilotMode?: boolean;
    pilotComplexId?: string;
  }) => Promise<any>;
  onImported?: () => void;
}

export function ImportDeviceChassiTab({ onImport, onImported }: ImportDeviceChassiTabProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Array<{ device_id: string; chassi: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pilotMode, setPilotMode] = useState(false);
  const [pilotComplexId, setPilotComplexId] = useState("");
  const [summary, setSummary] = useState<any>(null);

  const resetState = () => {
    setRows([]);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const parseFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

    const parsedRows = json
      .map((row) => {
        const device_id = String(
          row.device_id ?? row.DEVICE_ID ?? row["device id"] ?? row["Device ID"] ?? "",
        ).trim();
        const chassi = String(row.chassi ?? row.CHASSI ?? row.codigo ?? row.CODIGO ?? "").trim();
        return { device_id, chassi };
      })
      .filter((row) => row.device_id || row.chassi);

    if (!parsedRows.length) {
      throw new Error("Nenhuma linha válida encontrada. Use colunas: device_id e chassi.");
    }

    setRows(parsedRows);
    toast({
      title: "Planilha carregada",
      description: `${parsedRows.length} linhas prontas para importação.`,
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await parseFile(file);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao processar planilha",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
      resetState();
    }
  };

  const runImport = async () => {
    if (!rows.length) {
      toast({ variant: "destructive", title: "Sem dados", description: "Carregue uma planilha primeiro." });
      return;
    }
    setIsLoading(true);
    try {
      const result = await onImport({
        rows,
        pilotMode,
        pilotComplexId: pilotComplexId.trim() || undefined,
      });
      setSummary(result);
      toast({
        title: "Importação concluída",
        description: `Sucesso: ${result?.resumo?.sucesso ?? result?.summary?.success ?? 0} | Ignorados: ${result?.resumo?.ignorados ?? result?.summary?.ignored ?? 0} | Erros: ${result?.resumo?.erros ?? result?.summary?.errors ?? 0}`,
      });
      onImported?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: error?.response?.data?.error || error?.message || "Erro desconhecido",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Device x Chassi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Planilha (CSV/XLSX)</Label>
          <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} />
          <p className="text-xs text-muted-foreground">
            Formato mínimo: <strong>device_id</strong>, <strong>chassi</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Condomínio piloto (opcional: ID)</Label>
            <Input
              placeholder="complexId piloto"
              value={pilotComplexId}
              onChange={(e) => setPilotComplexId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Marcar devices como piloto</Label>
            <div className="flex gap-2">
              <Button
                variant={pilotMode ? "default" : "outline"}
                onClick={() => setPilotMode(true)}
                type="button"
              >
                Sim
              </Button>
              <Button
                variant={!pilotMode ? "default" : "outline"}
                onClick={() => setPilotMode(false)}
                type="button"
              >
                Não
              </Button>
            </div>
          </div>
        </div>

        {!!rows.length && (
          <Alert>
            <AlertDescription>
              {rows.length} linhas carregadas para importação.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button onClick={runImport} disabled={isLoading || rows.length === 0}>
            <Upload className="h-4 w-4 mr-1" />
            {isLoading ? "Importando..." : "Importar"}
          </Button>
          <Button variant="outline" onClick={resetState} disabled={isLoading}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        </div>

        {summary && (
          <Alert className="border-green-500/30 bg-green-500/10">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-1">
              <p>
                Sucesso: <strong>{summary?.resumo?.sucesso ?? summary?.summary?.success ?? 0}</strong> | Ignorados:{" "}
                <strong>{summary?.resumo?.ignorados ?? summary?.summary?.ignored ?? 0}</strong> | Erros:{" "}
                <strong>{summary?.resumo?.erros ?? summary?.summary?.errors ?? 0}</strong>
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
