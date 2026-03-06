"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Trash2 } from "lucide-react";

interface ValidationError {
  row: number;
  field: string;
  message: string;
  type: 'error' | 'warning';
}

interface ImportValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  processedRows: number;
  validRows: number;
}

interface ImportRow {
  DEVICE_ID: string;
  BLOCO: string;
  UNIDADE: string;
  CONDOMINIO: string;
  INICIO: string;
  FIM?: string;
  CHASSI?: string;
}

interface LinkImportPreviewProps {
  data: ImportRow[];
  validationResult: ImportValidationResult | null;
  onRemoveRow?: (index: number) => void;
}

export function LinkImportPreview({ data, validationResult, onRemoveRow }: LinkImportPreviewProps) {
  if (!data.length) {
    return null;
  }

  // Criar mapa de erros por linha
  const errorsByRow = new Map<number, ValidationError[]>();
  
  if (validationResult) {
    [...validationResult.errors, ...validationResult.warnings].forEach(error => {
      if (!errorsByRow.has(error.row)) {
        errorsByRow.set(error.row, []);
      }
      errorsByRow.get(error.row)!.push(error);
    });
  }

  // Função para obter status da linha
  const getRowStatus = (index: number) => {
    const rowNum = index + 2; // +2 para ajustar número da linha (cabeçalho + índice 0)
    const rowErrors = errorsByRow.get(rowNum) || [];
    const hasErrors = rowErrors.some(e => e.type === 'error');
    const hasWarnings = rowErrors.some(e => e.type === 'warning');
    
    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'success';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="text-yellow-700 bg-yellow-50">Aviso</Badge>;
      default:
        return <Badge variant="default" className="text-green-700 bg-green-50">Válido</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Resumo da Validação */}
      {validationResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {validationResult.isValid ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            <span className="font-medium">
              {validationResult.isValid ? "Validação aprovada" : "Validação reprovada"}
            </span>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Linhas processadas:</span> {validationResult.processedRows}
            </div>
            <div>
              <span className="font-medium">Linhas válidas:</span> {validationResult.validRows}
            </div>
            <div>
              <span className="font-medium">Erros:</span> {validationResult.errors.length}
            </div>
          </div>

          {/* Alertas de Erro */}
          {validationResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Erros encontrados:</div>
                    {onRemoveRow && (
                      <div className="text-xs text-muted-foreground">
                        💡 Use os botões 🗑️ nas linhas ou "Remover Erros" para excluir e prosseguir
                      </div>
                    )}
                  </div>
                  <div className="text-sm max-h-32 overflow-y-auto space-y-1">
                    {validationResult.errors.slice(0, 10).map((error, index) => (
                      <div key={index}>
                        <strong>Linha {error.row}:</strong> {error.message}
                      </div>
                    ))}
                    {validationResult.errors.length > 10 && (
                      <div className="italic">
                        ... e mais {validationResult.errors.length - 10} erros
                      </div>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Alertas de Aviso */}
          {validationResult.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-medium">Avisos encontrados:</div>
                  <div className="text-sm max-h-32 overflow-y-auto space-y-1">
                    {validationResult.warnings.slice(0, 5).map((warning, index) => (
                      <div key={index}>
                        <strong>Linha {warning.row}:</strong> {warning.message}
                      </div>
                    ))}
                    {validationResult.warnings.length > 5 && (
                      <div className="italic">
                        ... e mais {validationResult.warnings.length - 5} avisos
                      </div>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Preview da Planilha */}
      <div className="border rounded-md overflow-auto" style={{ maxHeight: '400px' }}>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              {validationResult && (
                <TableHead className="w-20 text-center">Status</TableHead>
              )}
              <TableHead className="min-w-[120px]">DEVICE_ID</TableHead>
              <TableHead className="min-w-[100px]">CONDOMINIO</TableHead>
              <TableHead className="min-w-[80px]">BLOCO</TableHead>
              <TableHead className="min-w-[80px]">UNIDADE</TableHead>
              <TableHead className="min-w-[100px]">INICIO</TableHead>
              <TableHead className="min-w-[100px]">FIM</TableHead>
              <TableHead className="min-w-[80px]">CHASSI</TableHead>
              {validationResult && (
                <TableHead className="min-w-[200px]">Erros/Avisos</TableHead>
              )}
              {onRemoveRow && (
                <TableHead className="w-16 text-center">Ações</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => {
              const rowStatus = validationResult ? getRowStatus(index) : 'success';
              const rowNum = index + 2;
              const rowErrors = errorsByRow.get(rowNum) || [];
              
              return (
                <TableRow
                  key={index}
                  className={
                    rowStatus === 'error'
                      ? 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50'
                      : rowStatus === 'warning'
                        ? 'bg-yellow-50 dark:bg-yellow-950/40 hover:bg-yellow-100 dark:hover:bg-yellow-900/50'
                        : 'bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-900/50'
                  }
                >
                  {validationResult && (
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getStatusIcon(rowStatus)}
                        {getStatusBadge(rowStatus)}
                      </div>
                    </TableCell>
                  )}
                  
                  <TableCell className="font-mono">
                    {row.DEVICE_ID || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell>
                    {row.CONDOMINIO || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell>
                    {row.BLOCO || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell>
                    {row.UNIDADE || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell className="font-mono">
                    {row.INICIO || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell className="font-mono">
                    {row.FIM || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  <TableCell className="font-mono">
                    {row.CHASSI || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  
                  {validationResult && (
                    <TableCell>
                      {rowErrors.length > 0 && (
                        <div className="space-y-1">
                          {rowErrors.map((error, errorIndex) => (
                            <div
                              key={errorIndex}
                              className={`text-xs p-1 rounded border ${
                                error.type === 'error'
                                  ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
                                  : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
                              }`}
                            >
                              <strong>{error.field}:</strong> {error.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  )}
                  
                  {onRemoveRow && (
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onRemoveRow(index)}
                        title="Remover linha"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
