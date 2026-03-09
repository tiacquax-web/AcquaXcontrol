"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCombinedImport } from "@/hooks/useCombinedImport";
import { useComplexes } from "@/hooks/useComplexes";
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  BarChart3,
  FileText,
  Link,
  Image,
  Info
} from "lucide-react";
import { CombinedImportResult } from "@/types/combined-import";

interface ImportCombinedDialogProps {
  monthRef: string;
  yearRef: string;
  complexId: string;
  dealershipReadingId: string;
  onImportSuccess: (result: CombinedImportResult) => void;
}

export function ImportCombinedDialog({ 
  monthRef, 
  yearRef, 
  complexId, 
  dealershipReadingId,
  onImportSuccess 
}: ImportCombinedDialogProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const {
    file,
    setFile,
    isValidating,
    validationResult,
    isImporting,
    importResult,
    cdnAutoFillCount,
    validateFile,
    importDataWithPolicy,
    clearData,
    importProgress
  } = useCombinedImport();

  const { complexes, loading: complexesLoading } = useComplexes({ id: complexId });

  // Get the CDN pattern from the loaded complex
  const complex = complexes?.[0] as any;
  const cdnPhotoPattern: string = complex?.cdnPhotoPattern || "";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
  };

  const handleValidate = async () => {
    if (!file) {
      toast({
        title: "Erro",
        description: "Selecione um arquivo para validar.",
        variant: "destructive",
      });
      return;
    }

    try {
      await validateFile(file, monthRef, yearRef, complexes, cdnPhotoPattern || undefined);
    } catch (error) {
      console.error("Erro inesperado na validação:", error);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado durante a validação. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const [showErrorsPanel, setShowErrorsPanel] = useState(false);
  const [replaceReadings, setReplaceReadings] = useState(true);
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false);

  const handleImport = async () => {
    if (!validationResult?.isValid) {
      toast({
        title: "Erro",
        description: "Execute a validação primeiro.",
        variant: "destructive",
      });
      return;
    }

    if (replaceReadings && !replaceAcknowledged) {
      toast({
        title: "Confirme a substituição",
        description: "Marque a confirmação para substituir as leituras existentes antes de importar.",
        variant: "destructive",
      });
      return;
    }

    try {
      const policy = replaceReadings ? 'replace' : 'skip';
      const result = await importDataWithPolicy(dealershipReadingId, policy);

      toast({
        title: "Importação concluída",
        description: `${result.readingsCreated} leituras e ${result.reportsCreated + result.reportsUpdated} relatórios processados.`,
      });

      if ((result.readingsCreated + result.reportsCreated + result.reportsUpdated) === 0) {
        setShowErrorsPanel(true);
        return;
      }

      onImportSuccess(result);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      [
        "condominio", "ano_ref", "mes_ref", "bloco", "apartamento",
        "chassi_medidor", "leitura_atual", "data_leitura", "prox_leitura", "foto", "pre_leitura", "leitura_anterior", "data_leitura_anterior",
        "consumo_agua_m3", "valor_consumo_agua", "valor_esgoto", "consumo_pipa_m3", "custo_pipa",
        "rateio_agua", "consumo_total_agua_m3", "valor_total_agua_unidade", "consumo_gas_m3", "valor_consumo_gas"
      ],
      [
        "Condomínio Exemplo", yearRef, monthRef, "A", "101",
        "12345", 150.5, "31/12/2024", "31/01/2025", "https://exemplo.com/foto1.jpg", "Não", 148.2, "30/11/2024",
        2.3, 15.50, 8.75, 0, 0,
        0.25, 2.3, 24.25, 0, 0
      ],
      [
        "Condomínio Exemplo", yearRef, monthRef, "A", "102",
        "12346", 75.8, "31/12/2024", "31/01/2025", "", "Sim", "", "",
        "", 18.20, 10.30, 0.5, 25.00,
        0.30, "", 28.50, 0, 0
      ]
    ];

    const csvContent = templateData.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `template_importacao_combinada_${monthRef}_${yearRef}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetDialog = () => {
    clearData();
    setReplaceReadings(true);
    setReplaceAcknowledged(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetDialog();
    }
  };

  const getProgressPercentage = () => {
    if (importProgress.total === 0) return 0;
    return Math.round((importProgress.processed / importProgress.total) * 100);
  };

  const getStepText = () => {
    switch (importProgress.step) {
      case 'validating': return 'Validando dados...';
      case 'importing-readings': return 'Importando leituras...';
      case 'importing-reports': return 'Importando relatórios...';
      case 'linking': return 'Vinculando dados...';
      case 'completed': return 'Concluído!';
      default: return 'Processando...';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Importar Leituras + Relatórios
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Importar Leituras e Relatórios Combinados
          </DialogTitle>
          <DialogDescription>
            Importe leituras de medidores e relatórios de apartamentos em uma única planilha 
            para o período {monthRef}/{yearRef}. Os dados serão automaticamente vinculados quando possível.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* CDN Pattern Info */}
          {cdnPhotoPattern ? (
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <Image className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-900">Link CDN automático ativo</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Linhas sem foto terão o link gerado automaticamente com o padrão configurado no condomínio.
                </p>
                <code className="text-xs text-green-800 bg-green-100 px-1 rounded break-all block mt-1">
                  {cdnPhotoPattern}
                </code>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Padrão CDN não configurado</p>
                <p className="text-xs mt-0.5">
                  Configure o <strong>Padrão de URL das Fotos (CDN)</strong> na aba <em>Faturamento</em> do condomínio
                  para gerar links de foto automaticamente nas linhas sem foto.
                </p>
              </div>
            </div>
          )}

          {/* Template Download */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-blue-900">Template Recomendado</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Baixe o template para ver o formato correto da planilha.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadTemplate}
                  className="mt-2"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.ods"
                onChange={handleFileSelect}
                className="flex-1"
                disabled={isValidating || isImporting}
              />
              <Button
                onClick={handleValidate}
                disabled={!file || isValidating || complexesLoading || isImporting}
                variant="outline"
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Validar
              </Button>
            </div>

            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span>{file.name}</span>
              </div>
            )}
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4">
              {validationResult.isValid ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">Validação concluída com sucesso!</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {validationResult.summary.validRows}
                          </div>
                          <div className="text-xs text-muted-foreground">Linhas válidas</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {validationResult.summary.rowsWithReadings}
                          </div>
                          <div className="text-xs text-muted-foreground">Com leituras</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {validationResult.summary.rowsWithReports}
                          </div>
                          <div className="text-xs text-muted-foreground">Com relatórios</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {validationResult.summary.rowsWithBoth}
                          </div>
                          <div className="text-xs text-muted-foreground">Com ambos</div>
                        </div>
                      </div>

                      {/* CDN auto-fill count */}
                      {cdnAutoFillCount > 0 && (
                        <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                          <Image className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="text-sm text-green-800">
                            <strong>{cdnAutoFillCount}</strong> link(s) de foto gerado(s) automaticamente via padrão CDN.
                          </span>
                        </div>
                      )}

                      {validationResult.warnings.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-orange-600">
                            {validationResult.warnings.length} aviso(s):
                          </p>
                          <ul className="text-sm text-orange-600 list-disc list-inside">
                            {validationResult.warnings.slice(0, 3).map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                            {validationResult.warnings.length > 3 && (
                              <li>... e mais {validationResult.warnings.length - 3} avisos</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p className="font-medium">
                        {validationResult.errors.length === 1 ? 
                          "Erro encontrado na validação:" : 
                          `${validationResult.errors.length} erros encontrados:`
                        }
                      </p>
                      
                      <div className="max-h-48 overflow-y-auto">
                        <ul className="text-sm space-y-1">
                          {validationResult.errors.map((error, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-red-500 mt-0.5">•</span>
                              <span>{error}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {validationResult.summary.totalRows > 0 && (
                        <div className="mt-3 p-3 bg-red-50 rounded-md">
                          <p className="text-sm font-medium text-red-800">Estatísticas do arquivo:</p>
                          <div className="grid grid-cols-2 gap-2 mt-1 text-sm text-red-700">
                            <div>Total de linhas: {validationResult.summary.totalRows}</div>
                            <div>Linhas válidas: {validationResult.summary.validRows}</div>
                            <div>Com leituras: {validationResult.summary.rowsWithReadings}</div>
                            <div>Com relatórios: {validationResult.summary.rowsWithReports}</div>
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground mt-2 space-y-1">
                        <p>💡 <strong>Dicas para corrigir erros comuns:</strong></p>
                        <p>• Datas: Use formato DD/MM/AAAA (ex: 31/01/2025)</p>
                        <p>• Valores numéricos: Use ponto para decimais (ex: 150.5)</p>
                        <p>• Pré-leitura: Use "Sim", "Não", true ou false</p>
                        <p>• Pelo menos um de: leitura OU relatório deve estar preenchido</p>
                        <p>• Baixe o template para ver o formato correto</p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Conflict policy */}
          <div className="rounded-lg border border-muted bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Substituir leituras existentes</p>
                <p className="text-sm text-muted-foreground">
                  Quando ativado, todas as leituras desta planilha substituem as leituras atuais do mesmo tipo para cada medidor.
                </p>
              </div>
              <Switch
                checked={replaceReadings}
                onCheckedChange={(checked) => {
                  const value = Boolean(checked);
                  setReplaceReadings(value);
                  setReplaceAcknowledged(false);
                }}
                aria-label="Substituir leituras existentes"
              />
            </div>
            {replaceReadings ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-900">
                  As leituras atuais serão marcadas como substituídas e novas leituras serão criadas com base na planilha.
                  Relatórios existentes serão atualizados automaticamente.
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="confirm-replace"
                    checked={replaceAcknowledged}
                    onCheckedChange={(checked) => setReplaceAcknowledged(Boolean(checked))}
                  />
                  <Label htmlFor="confirm-replace" className="text-sm text-amber-900">
                    Entendo e desejo substituir as leituras atuais.
                  </Label>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Leituras existentes serão mantidas; somente relatórios serão criados ou atualizados quando possível.
              </p>
            )}
          </div>

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{getStepText()}</span>
                <span className="text-sm text-muted-foreground">
                  {importProgress.processed}/{importProgress.total} ({getProgressPercentage()}%)
                </span>
              </div>
              <Progress value={getProgressPercentage()} className="w-full" />
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Importação concluída!</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {importResult.readingsCreated}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        Leituras criadas
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {importResult.reportsCreated}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <FileText className="h-3 w-3" />
                        Relatórios criados
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {importResult.reportsUpdated}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <FileText className="h-3 w-3" />
                        Relatórios atualizados
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {importResult.linkedReports}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Link className="h-3 w-3" />
                        Vinculações criadas
                      </div>
                    </div>
                  </div>

                  {(importResult.errors.length > 0 || importResult.warnings.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {importResult.errors.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-red-600">
                            {importResult.errors.length} erro(s):
                          </p>
                          <ul className="text-sm text-red-600 list-disc list-inside">
                            {importResult.errors.slice(0, 3).map((error, index) => (
                              <li key={index}>Linha {error.row}: {error.message}</li>
                            ))}
                            {importResult.errors.length > 3 && (
                              <li>... e mais {importResult.errors.length - 3} erros</li>
                            )}
                          </ul>
                        </div>
                      )}
                      
                      {importResult.warnings.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-orange-600">
                            {importResult.warnings.length} aviso(s):
                          </p>
                          <ul className="text-sm text-orange-600 list-disc list-inside">
                            {importResult.warnings.slice(0, 3).map((warning, index) => (
                              <li key={index}>Linha {warning.row}: {warning.message}</li>
                            ))}
                            {importResult.warnings.length > 3 && (
                              <li>... e mais {importResult.warnings.length - 3} avisos</li>
                            )}
                          </ul>
                        </div>
                      )}
                      {importResult.errors.length > 0 && (
                        <div className="mt-2">
                          <Button variant="ghost" size="sm" onClick={() => setShowErrorsPanel(true)}>
                            Ver todos os erros
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isImporting}>
              Cancelar
            </Button>

            {validationResult?.isValid && !importResult && (
              <Button
                onClick={handleImport}
                disabled={isImporting || (replaceReadings && !replaceAcknowledged)}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar Dados
              </Button>
            )}

            {importResult && (
              <div className="flex items-center gap-2">
                <Button onClick={() => setOpen(false)}>
                  Concluir
                </Button>
                {importResult.errors.length > 0 && (
                  <Button variant="outline" onClick={() => setShowErrorsPanel(true)}>
                    Ver erros ({importResult.errors.length})
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Erros detalhados */}
      {showErrorsPanel && importResult && importResult.errors.length > 0 && (
        <DialogContent className="max-w-4xl max-h-[60vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Erros da importação</DialogTitle>
            <DialogDescription>Confira as linhas com erro e corrija a planilha.</DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <ul className="list-disc list-inside space-y-2 text-sm text-red-700">
              {importResult.errors.map((err, idx) => (
                <li key={idx}>Linha {err.row}: {err.message}</li>
              ))}
            </ul>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowErrorsPanel(false)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
