"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { 
  CombinedReadingAndReportImport, 
  CombinedImportValidationResult,
  CombinedImportResult 
} from "@/types/combined-import";
import { CombinedImportService } from "@/lib/services/combined-import-service";

interface UseCombinedImportResult {
  // File handling
  file: File | null;
  setFile: (file: File | null) => void;
  
  // Validation state
  isValidating: boolean;
  validationResult: CombinedImportValidationResult | null;
  importedData: CombinedReadingAndReportImport[];
  
  // Import state
  isImporting: boolean;
  importResult: CombinedImportResult | null;
  
  // Actions
  validateFile: (
    file: File, 
    monthRef: string, 
    yearRef: string, 
    complexes: any[]
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
    complexes: any[]
  ): Promise<void> => {
    setIsValidating(true);
    setImportProgress({ total: 0, processed: 0, step: 'validating' });
    setValidationResult(null); // Limpar resultado anterior
    
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
      
      // Verificar se tem planilhas
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("Arquivo não contém planilhas válidas");
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Verificar se a planilha tem dados
      if (!worksheet || !worksheet['A1']) {
        throw new Error("Planilha está vazia ou não contém dados na primeira linha");
      }

      // Converter para JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Primeiro vamos pegar como array para verificar headers
        defval: null // Valores vazios como null
      }) as any[][];

      // Verificar se tem pelo menos cabeçalho + 1 linha de dados
      if (jsonData.length < 2) {
        throw new Error("Planilha deve ter pelo menos um cabeçalho e uma linha de dados");
      }

      // Verificar cabeçalhos obrigatórios
      const headers = jsonData[0];
      const requiredHeaders = ['condominio', 'ano_ref', 'mes_ref', 'bloco', 'apartamento'];
      const missingHeaders = requiredHeaders.filter(header => 
        !headers.some(h => h?.toString().toLowerCase().trim() === header.toLowerCase())
      );

      if (missingHeaders.length > 0) {
        throw new Error(`Cabeçalhos obrigatórios ausentes: ${missingHeaders.join(', ')}`);
      }

      // Converter para objeto usando os cabeçalhos
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null });

        // Normalize headers / fields: map common column names to canonical import keys
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
                // keep original key (as camel/trimmed) for other columns like condominio, bloco, apartamento, chassi
                normalized[key.replace(/\s+/g, '_')] = v;
            }
          }
          return normalized as CombinedReadingAndReportImport;
        };

        const objectData = rawData.map(normalizeRow);

      // Verificar se conseguiu converter dados
      if (objectData.length === 0) {
        throw new Error("Não foi possível extrair dados da planilha");
      }

      // Executar validação do serviço
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
      
      // Criar resultado de erro mais detalhado
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

      // Chamar a API de importação combinada
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

      // Do NOT clearData here: keep importResult/errors for the UI to show.
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
    setImportProgress({ total: 0, processed: 0, step: 'validating' });
  };

  return {
    file,
    setFile,
    isValidating,
    validationResult,
    importedData,
    isImporting,
    importResult,
    validateFile,
    importData,
  importDataWithPolicy,
    clearData,
    importProgress
  };
};
