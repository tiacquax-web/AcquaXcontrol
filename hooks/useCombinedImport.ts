"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { 
  CombinedReadingAndReportImport, 
  CombinedImportValidationResult,
  CombinedImportResult 
} from "@/types/combined-import";
import { CombinedImportService } from "@/lib/services/combined-import-service";

/**
 * Gera um link CDN a partir do padrão configurado no condomínio.
 * Variáveis suportadas: {{mes}}, {{bloco}}, {{apartamento}}, {{fase}}
 *
 * Exemplo de padrão:
 *   https://cdn.acquaxcontrol.com.br/Contemporâneo/{{mes}}/Fotos/Fase l/{{bloco}}/{{apartamento}}.jpg
 */
export function buildCdnPhotoUrl(
  pattern: string,
  vars: { mes?: string; bloco?: string; apartamento?: string | number; fase?: string }
): string {
  return pattern
    .replace(/\{\{mes\}\}/gi, vars.mes || "")
    .replace(/\{\{bloco\}\}/gi, vars.bloco || "")
    .replace(/\{\{apartamento\}\}/gi, String(vars.apartamento ?? ""))
    .replace(/\{\{fase\}\}/gi, vars.fase || "");
}

/** Map numeric month to Portuguese label used in CDN paths (e.g. "11 - Novembro") */
const MONTH_CDN_LABELS: Record<string, string> = {
  "01": "01 - Janeiro", "1": "01 - Janeiro",
  "02": "02 - Fevereiro", "2": "02 - Fevereiro",
  "03": "03 - Março", "3": "03 - Março",
  "04": "04 - Abril", "4": "04 - Abril",
  "05": "05 - Maio", "5": "05 - Maio",
  "06": "06 - Junho", "6": "06 - Junho",
  "07": "07 - Julho", "7": "07 - Julho",
  "08": "08 - Agosto", "8": "08 - Agosto",
  "09": "09 - Setembro", "9": "09 - Setembro",
  "10": "10 - Outubro",
  "11": "11 - Novembro",
  "12": "12 - Dezembro",
  // Accept month names too
  "janeiro": "01 - Janeiro", "fevereiro": "02 - Fevereiro", "março": "03 - Março",
  "abril": "04 - Abril", "maio": "05 - Maio", "junho": "06 - Junho",
  "julho": "07 - Julho", "agosto": "08 - Agosto", "setembro": "09 - Setembro",
  "outubro": "10 - Outubro", "novembro": "11 - Novembro", "dezembro": "12 - Dezembro",
};

export function monthRefToCdnLabel(monthRef: string): string {
  const key = String(monthRef ?? "").toLowerCase().trim();
  return MONTH_CDN_LABELS[key] || monthRef;
}

interface UseCombinedImportResult {
  // File handling
  file: File | null;
  setFile: (file: File | null) => void;
  
  // Validation state
  isValidating: boolean;
  validationResult: CombinedImportValidationResult | null;
  importedData: CombinedReadingAndReportImport[];
  cdnAutoFillCount: number; // how many rows had foto auto-filled via CDN pattern
  
  // Import state
  isImporting: boolean;
  importResult: CombinedImportResult | null;
  
  // Actions
  validateFile: (
    file: File, 
    monthRef: string, 
    yearRef: string, 
    complexes: any[],
    cdnPhotoPattern?: string
  ) => Promise<void>;
  importData: (
    dealershipReadingId: string
  ) => Promise<CombinedImportResult>;
  importDataWithPolicy: (
    dealershipReadingId: string,
    conflictPolicy: 'skip' | 'link' | 'replace'
  ) => Promise<CombinedImportResult>;
  clearData: () => void;
  
  // Progress tracking
  importProgress: {
    total: number;
    processed: number;
    step: 'validating' | 'importing-readings' | 'importing-reports' | 'linking' | 'completed';
  };
}

export const useCombinedImport = (): UseCombinedImportResult => {
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<CombinedImportValidationResult | null>(null);
  const [importedData, setImportedData] = useState<CombinedReadingAndReportImport[]>([]);
  const [importResult, setImportResult] = useState<CombinedImportResult | null>(null);
  const [cdnAutoFillCount, setCdnAutoFillCount] = useState(0);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    processed: number;
    step: 'validating' | 'importing-readings' | 'importing-reports' | 'linking' | 'completed';
  }>({
    total: 0,
    processed: 0,
    step: 'validating'
  });

  const validateFile = async (
    file: File,
    monthRef: string,
    yearRef: string,
    complexes: any[],
    cdnPhotoPattern?: string
  ): Promise<void> => {
    setIsValidating(true);
    setImportProgress({ total: 0, processed: 0, step: 'validating' });
    setValidationResult(null);
    setCdnAutoFillCount(0);
    
    try {
      // Verificar extensão do arquivo
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv') && !fileName.endsWith('.ods')) {
        throw new Error("Arquivo deve ser Excel (.xlsx, .xls, .ods) ou CSV (.csv)");
      }

      // Verificar tamanho do arquivo (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Arquivo muito grande. Máximo permitido: 10MB");
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("Arquivo não contém planilhas válidas");
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet || !worksheet['A1']) {
        throw new Error("Planilha está vazia ou não contém dados na primeira linha");
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null
      }) as any[][];

      if (jsonData.length < 2) {
        throw new Error("Planilha deve ter pelo menos um cabeçalho e uma linha de dados");
      }

      const headers = jsonData[0];
      const requiredHeaders = ['condominio', 'ano_ref', 'mes_ref', 'bloco', 'apartamento'];
      const missingHeaders = requiredHeaders.filter(header => 
        !headers.some((h: any) => h?.toString().toLowerCase().trim() === header.toLowerCase())
      );

      if (missingHeaders.length > 0) {
        throw new Error(`Cabeçalhos obrigatórios ausentes: ${missingHeaders.join(', ')}`);
      }

      const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null });

      const normalizeRow = (r: Record<string, any>) => {
        const normalized: any = {};
        for (const [k, v] of Object.entries(r)) {
          if (!k) continue;
          const key = k.toString().trim().toLowerCase();
          switch (key) {
            case 'leitura':
            case 'leitura_atual':
            case 'valor_leitura':
              normalized['leitura_atual'] = v;
              break;
            case 'leitura_anterior':
            case 'leitura_prev':
              normalized['leitura_anterior'] = v;
              break;
            case 'data_leitura':
            case 'data':
            case 'data_leit':
              normalized['data_leitura'] = v;
              break;
            case 'prox_leitura':
            case 'data_prox_leitura':
            case 'next_reading_date':
              normalized['prox_leitura'] = v;
              break;
            case 'foto':
            case 'url_cover':
            case 'imagem':
              normalized['foto'] = v;
              break;
            case 'pre_leitura':
            case 'is_pre_reading':
            case 'pre_reading':
              normalized['pre_leitura'] = v;
              break;
            default:
              normalized[key.replace(/\s+/g, '_')] = v;
          }
        }
        return normalized as CombinedReadingAndReportImport;
      };

      let objectData = rawData.map(normalizeRow);

      // ── CDN AUTO-FILL ────────────────────────────────────────────────
      // If the condomínio has a cdnPhotoPattern configured, auto-fill empty
      // foto fields with the generated CDN URL.
      let autoFillCount = 0;
      if (cdnPhotoPattern && cdnPhotoPattern.trim()) {
        objectData = objectData.map(row => {
          const hasPhoto = row.foto && String(row.foto).trim() !== "";
          if (!hasPhoto) {
            const mesRef = row.mes_ref ?? monthRef;
            const mesLabel = monthRefToCdnLabel(String(mesRef));
            const bloco = row.bloco ? String(row.bloco).trim() : "";
            // Capitalize block name for CDN path (e.g. "BOTERO" → "Botero")
            const blocoForCdn = bloco.charAt(0).toUpperCase() + bloco.slice(1).toLowerCase();
            const apt = row.apartamento ? String(row.apartamento).trim() : "";
            const generatedUrl = buildCdnPhotoUrl(cdnPhotoPattern, {
              mes: mesLabel,
              bloco: blocoForCdn,
              apartamento: apt,
            });
            autoFillCount++;
            return { ...row, foto: generatedUrl, _fotoCdnAutoFilled: true };
          }
          return row;
        });
        setCdnAutoFillCount(autoFillCount);
      }
      // ────────────────────────────────────────────────────────────────

      if (objectData.length === 0) {
        throw new Error("Não foi possível extrair dados da planilha");
      }

      const result = CombinedImportService.validateCombinedImport(
        objectData, 
        monthRef, 
        yearRef, 
        complexes
      );
      
      setValidationResult(result);
      setImportedData(objectData);
      setImportProgress(prev => ({ ...prev, total: result.validRows.length }));
      
    } catch (error) {
      console.error("Error validating file:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      setValidationResult({
        isValid: false,
        errors: [errorMessage],
        warnings: [],
        validRows: [],
        invalidRows: [],
        complexExists: false,
        summary: {
          totalRows: 0,
          validRows: 0,
          rowsWithReadings: 0,
          rowsWithReports: 0,
          rowsWithBoth: 0
        }
      });
    } finally {
      setIsValidating(false);
    }
  };

  const importData = async (
    dealershipReadingId: string
  ): Promise<CombinedImportResult> => {
    if (!validationResult?.isValid || !validationResult.validRows.length) {
      throw new Error("Nenhum dado válido para importar");
    }

    setIsImporting(true);
    setImportResult(null);
    
    try {
      setImportProgress({ 
        total: validationResult.validRows.length, 
        processed: 0, 
        step: 'importing-readings' 
      });

      const response = await fetch('/api/user/combined-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rows: validationResult.validRows,
          dealershipReadingId,
          monthRef: validationResult.validRows[0]?.mes_ref,
          yearRef: validationResult.validRows[0]?.ano_ref,
          conflictPolicy: 'replace'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erro ao importar dados');
      }

      const result: CombinedImportResult = await response.json();
      
      setImportResult(result);
      setImportProgress(prev => ({ 
        ...prev, 
        processed: prev.total,
        step: 'completed' 
      }));

      return result;
    } catch (error) {
      console.error("Error importing data:", error);
      throw error;
    } finally {
      setIsImporting(false);
    }
  };

  const importDataWithPolicy = async (
    dealershipReadingId: string,
    conflictPolicy: 'skip' | 'link' | 'replace'
  ): Promise<CombinedImportResult> => {
    if (!validationResult?.isValid || !validationResult.validRows.length) {
      throw new Error("Nenhum dado válido para importar");
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      setImportProgress({ total: validationResult.validRows.length, processed: 0, step: 'importing-readings' });
      const response = await fetch('/api/user/combined-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: validationResult.validRows,
          dealershipReadingId,
          monthRef: validationResult.validRows[0]?.mes_ref,
          yearRef: validationResult.validRows[0]?.ano_ref,
          conflictPolicy
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erro ao importar dados');
      }
      const result: CombinedImportResult = await response.json();
      setImportResult(result);
      setImportProgress(prev => ({ ...prev, processed: prev.total, step: 'completed' }));
      return result;
    } catch (error) {
      throw error;
    } finally {
      setIsImporting(false);
    }
  };

  const clearData = () => {
    setFile(null);
    setValidationResult(null);
    setImportedData([]);
    setImportResult(null);
    setCdnAutoFillCount(0);
    setImportProgress({ total: 0, processed: 0, step: 'validating' });
  };

  return {
    file,
    setFile,
    isValidating,
    validationResult,
    importedData,
    cdnAutoFillCount,
    isImporting,
    importResult,
    validateFile,
    importData,
    importDataWithPolicy,
    clearData,
    importProgress
  };
};
