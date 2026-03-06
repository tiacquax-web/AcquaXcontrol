"use client";

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  Loader2, 
  Download,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeviceLinkImport } from "@/hooks/useDeviceLinkImport";
import { LinkImportPreview } from "./LinkImportPreview";

interface ImportLinksTabProps {
  onImportComplete?: () => void;
}

export function ImportLinksTab({ onImportComplete }: ImportLinksTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessed, setReprocessed] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<any>(null);
  
  const {
    file,
    setFile,
    isValidating,
    validationResult,
    importedData,
    isImporting,
    importResult,
    step,
    validateFile,
    processImport,
    reprocessByLinks,  // 🆕 Super reprocessamento
    clearData,
    removeRow,
    removeRowsWithErrors,
  } = useDeviceLinkImport();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      try {
        await validateFile(selectedFile);
      } catch (error) {
        console.error('Erro ao validar arquivo:', error);
      }
    }
  };

  const handleClearFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    clearData();
  };

  const handleImport = async () => {
    try {
      await processImport();
      // Não limpar mais - manter dados para reprocessamento
    } catch (error) {
      // Erro já tratado no hook
      console.error('Erro na importação:', error);
    }
  };

  const handleReprocess = async () => {
    // Simular início do reprocessamento
    setReprocessing(true);
    
    // Aguardar um tempo para simular processamento
    setTimeout(() => {
      toast({
        variant: "destructive",
        title: "Reprocessamento indisponível",
        description: "Esta funcionalidade está temporariamente desabilitada"
      });
      setReprocessing(false);
    }, 1000);
  };

  const handleComplete = () => {
    // Limpar todos os dados e estados
    clearData();
    setReprocessing(false);
    setReprocessed(false);
    setReprocessResult(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    if (onImportComplete) {
      onImportComplete();
    }
  };

  const downloadTemplate = () => {
    // Criar dados do template
    const templateData = [
      {
        'DEVICE_ID': 'exemplo123',
        'CONDOMINIO': 'NOME DO CONDOMINIO', 
        'BLOCO': '1',
        'UNIDADE': '101',
        'INICIO': '2024-01-01',
        'FIM': '2024-12-31',
        'CHASSI': 'ABC123'
      },
      {
        'DEVICE_ID': 'exemplo456',
        'CONDOMINIO': 'NOME DO CONDOMINIO',
        'BLOCO': '1', 
        'UNIDADE': '102',
        'INICIO': '2024-01-01',
        'FIM': '',
        'CHASSI': ''
      }
    ];

    // Usar XLSX para criar planilha
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vinculos');
    
    // Download
    XLSX.writeFile(workbook, 'template_vinculos_dispositivos.xlsx');
    
    toast({
      title: "Template baixado",
      description: "Arquivo template foi baixado com sucesso.",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Vínculos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[240px]">
                  <Label htmlFor="file" className="text-xs font-medium">Arquivo (.xlsx)</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id="file"
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.ods"
                      onChange={handleFileSelect}
                      className="flex-1"
                      disabled={isValidating || isImporting}
                    />
                    {file && (
                      <Button variant="ghost" size="icon" onClick={handleClearFile} className="shrink-0">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {file && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileSpreadsheet className="h-3 w-3" />
                      <span className="truncate max-w-[180px]" title={file.name}>{file.name}</span>
                      {!!importedData.length && <span className="text-primary">({importedData.length})</span>}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                  <Download className="h-4 w-4 mr-1" />Template
                </Button>
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Validando...
                </div>
              )}

              <Alert className="bg-muted/40 border-dashed p-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  <strong>Colunas:</strong> DEVICE_ID, CONDOMINIO, BLOCO, UNIDADE, INICIO (obrigatórias). FIM, CHASSI (opcionais). Datas: YYYY-MM-DD. CHASSI é obrigatório se houver múltiplos medidores.
                </AlertDescription>
              </Alert>

              {step !== 'idle' && (
                <div className="flex items-center text-[11px] gap-4 px-2 py-1 rounded-md bg-muted/50">
                  {['validado','vínculos','reprocesso'].map((label, idx) => {
                    const active = (idx===0 && (step==='validated'||step==='links-created'||step==='completed')) || (idx===1 && (step==='links-created'||step==='completed')) || (idx===2 && step==='completed');
                    const loading = (idx===1 && isImporting) || (idx===2 && isImporting);
                    return (
                      <div key={label} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${active? 'bg-green-500':'bg-border'} ${loading?'animate-pulse':''}`} />
                        <span className={active? 'text-foreground':'text-muted-foreground'}>{label}</span>
                        {idx<2 && <span className="mx-2 h-3 w-px bg-border" />}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end pt-1">
                {validationResult && !validationResult.isValid && validationResult.errors.length > 0 && (
                  <Button size="sm" variant="destructive" onClick={removeRowsWithErrors}>
                    <X className="h-4 w-4 mr-1"/>
                    Remover Erros ({validationResult.errors.length})
                  </Button>
                )}
                
                {step==='validated' && (
                  <Button size="sm" onClick={handleImport} disabled={!validationResult?.isValid || isImporting}>
                    {isImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <Upload className="h-4 w-4 mr-1"/>}
                    Criar ({validationResult?.validRows||0})
                  </Button>)}
                {step==='links-created' && (
                  <Button size="sm" variant="default" onClick={handleReprocess} disabled={reprocessing}>
                    {reprocessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <RefreshCw className="h-4 w-4 mr-1"/>}
                    Reprocessar
                  </Button>)}
                {step === 'completed' && (
                  <Button size="sm" variant="default" onClick={handleComplete}>
                    <Check className="h-4 w-4 mr-1"/>Concluir
                  </Button>)}
                {!!importedData.length && (
                  <Button size="sm" variant="ghost" onClick={handleClearFile}>
                    <X className="h-4 w-4 mr-1"/>Limpar
                  </Button>)}
              </div>
            </CardContent>
          </Card>

          {importedData.length>0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {validationResult?.isValid ? <CheckCircle className="h-4 w-4 text-green-500"/> : <AlertCircle className="h-4 w-4 text-destructive"/>}
                  Preview ({validationResult?.validRows}/{validationResult?.processedRows})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <LinkImportPreview 
                  data={importedData} 
                  validationResult={validationResult} 
                  onRemoveRow={removeRow}
                />
              </CardContent>
            </Card>
          )}

          {step==='links-created' && importResult && (
            <Alert className="border-green-600/30 bg-green-500/10">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="space-y-1 text-xs">
                <p><strong>{importResult.createdLinks}</strong> vínculos criados.</p>
                <p>{importResult.devicesForReprocessing.length} dispositivos para reprocessar.</p>
              </AlertDescription>
            </Alert>
          )}

          {reprocessResult && (
            <Alert className="border-green-600/30 bg-green-500/10">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="space-y-1 text-xs">
                <p>{reprocessResult.processedDevices} dispositivos processados.</p>
                <p>{reprocessResult.updatedReadings} leituras atualizadas.</p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

    </div>
  );
}
