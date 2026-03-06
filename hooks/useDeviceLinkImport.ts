"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";

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

interface ImportResult {
  createdLinks: number;
  createdLinkIds: string[];  // 🆕 IDs dos vínculos criados
  devicesForReprocessing: string[];
  metersForReprocessing: string[];
  details: string;
}

interface UseDeviceLinkImportResult {
  // File handling
  file: File | null;
  setFile: (file: File | null) => void;
  
  // Validation state
  isValidating: boolean;
  validationResult: ImportValidationResult | null;
  importedData: ImportRow[];
  
  // Import state
  isImporting: boolean;
  importResult: ImportResult | null;
  
  // Import flow state
  step: 'idle' | 'validated' | 'links-created' | 'completed';
  
  // Actions
  validateFile: (file: File) => Promise<void>;
  processImport: () => Promise<void>;
  reprocessByLinks: () => Promise<any>;  // 🆕 Reprocessamento super rápido por link IDs
  clearData: () => void;
  removeRow: (index: number) => void;
  removeRowsWithErrors: () => void;
}

export const useDeviceLinkImport = (): UseDeviceLinkImportResult => {
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [importedData, setImportedData] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'idle' | 'validated' | 'links-created' | 'completed'>('idle');

  const validateFile = async (file: File): Promise<void> => {
    setIsValidating(true);
    
    try {
      // Parse do arquivo Excel
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { 
        type: "array",
        cellDates: true,
        dateNF: 'yyyy-mm-dd'
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        defval: "",
        raw: false // Para obter strings das datas
      }) as ImportRow[];

      if (jsonData.length === 0) {
        throw new Error("A planilha está vazia ou não contém dados válidos.");
      }

      // Validar estrutura da planilha
      const requiredColumns = ['DEVICE_ID', 'BLOCO', 'UNIDADE', 'CONDOMINIO', 'INICIO'];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        throw new Error(`Colunas obrigatórias faltando na planilha: ${missingColumns.join(', ')}`);
      }

      console.log(`📊 Arquivo processado: ${jsonData.length} linhas encontradas`);
      
      setImportedData(jsonData);

      // Enviar dados para validação no backend
      const response = await fetch('/api/user/devices/import-links/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: jsonData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao validar dados');
      }

      const result: ImportValidationResult = await response.json();
      setValidationResult(result);

      // Toast baseado no resultado da validação
      if (result.isValid) {
        toast({
          title: "Validação concluída",
          description: `${result.validRows} linhas válidas de ${result.processedRows} processadas.`,
        });
        setStep('validated');
      } else {
        toast({
          title: "Erros encontrados na validação",
          description: `${result.errors.length} erro(s) encontrado(s) em ${result.processedRows} linhas.`,
          variant: "destructive",
        });
        setStep('idle');
      }

    } catch (error) {
      console.error("Erro ao validar arquivo:", error);
      setValidationResult(null);
      setImportedData([]);
      setStep('idle');
      
      toast({
        title: "Erro ao validar arquivo",
        description: error instanceof Error ? error.message : "Erro desconhecido ao processar arquivo.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const processImport = async (): Promise<void> => {
    if (!validationResult?.isValid || !importedData.length) {
      throw new Error("Nenhum dado válido para importar");
    }

    setIsImporting(true);
    
    try {
      console.log(`🚀 Iniciando importação de ${importedData.length} vínculos...`);
      
      const response = await fetch('/api/user/devices/import-links/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: importedData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar importação');
      }

      const result = await response.json();
      
      setImportResult({
        createdLinks: result.createdLinks,
        createdLinkIds: result.createdLinkIds,  // 🆕 Armazenar IDs dos vínculos
        devicesForReprocessing: result.devicesForReprocessing,
        metersForReprocessing: result.metersForReprocessing,
        details: result.details
      });
      
      setStep('links-created');
      
      toast({
        title: "Vínculos criados com sucesso",
        description: `${result.createdLinks} vínculos criados. Use o botão "Reprocessar" para atualizar as leituras.`,
      });

      // Não limpar dados mais - manter para permitir reprocessamento
      console.log('✅ Vínculos criados:', result);

    } catch (error) {
      console.error("Erro ao processar importação:", error);
      
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido ao importar dados.",
        variant: "destructive",
      });
      
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
    setStep('idle');
  };

  const removeRow = (index: number) => {
    const newData = importedData.filter((_, i) => i !== index);
    setImportedData(newData);
    
    // Recalcular validação após remoção
    if (validationResult) {
      const newErrors = validationResult.errors.filter(error => error.row !== index + 2);
      const newWarnings = validationResult.warnings.filter(warning => warning.row !== index + 2);
      
      // Ajustar números de linha dos erros/avisos restantes
      const adjustedErrors = newErrors.map(error => ({
        ...error,
        row: error.row > index + 2 ? error.row - 1 : error.row
      }));
      const adjustedWarnings = newWarnings.map(warning => ({
        ...warning,
        row: warning.row > index + 2 ? warning.row - 1 : warning.row
      }));
      
      const newValidationResult: ImportValidationResult = {
        ...validationResult,
        errors: adjustedErrors,
        warnings: adjustedWarnings,
        processedRows: newData.length,
        validRows: newData.length - adjustedErrors.length,
        isValid: adjustedErrors.length === 0
      };
      
      setValidationResult(newValidationResult);
      
      // Atualizar step se necessário
      if (newValidationResult.isValid && newData.length > 0) {
        setStep('validated');
      } else if (newData.length === 0) {
        setStep('idle');
      }
    }
  };

  const removeRowsWithErrors = () => {
    if (!validationResult) return;
    
    // Coletar índices das linhas com erro (ajustar para índice do array)
    const errorRowIndices = new Set(
      validationResult.errors.map(error => error.row - 2) // -2 porque row começa em 2 (header + index 0)
    );
    
    // Filtrar dados removendo linhas com erro
    const newData = importedData.filter((_, index) => !errorRowIndices.has(index));
    setImportedData(newData);
    
    // Recalcular validação mantendo apenas warnings das linhas remanescentes
    const remainingWarnings = validationResult.warnings.filter(warning => {
      const dataIndex = warning.row - 2;
      return !errorRowIndices.has(dataIndex);
    });
    
    // Ajustar números de linha dos warnings
    const adjustedWarnings = remainingWarnings.map(warning => {
      const originalIndex = warning.row - 2;
      const removedBeforeThis = Array.from(errorRowIndices).filter(idx => idx < originalIndex).length;
      return {
        ...warning,
        row: warning.row - removedBeforeThis
      };
    });
    
    const newValidationResult: ImportValidationResult = {
      isValid: true, // Sem erros após remoção
      errors: [],
      warnings: adjustedWarnings,
      processedRows: newData.length,
      validRows: newData.length
    };
    
    setValidationResult(newValidationResult);
    
    if (newData.length > 0) {
      setStep('validated');
      toast({
        title: "Linhas com erro removidas",
        description: `${errorRowIndices.size} linha(s) removida(s). ${newData.length} linha(s) válida(s) restante(s).`,
      });
    } else {
      setStep('idle');
      toast({
        title: "Todos os dados removidos",
        description: "Nenhuma linha válida restou após a remoção.",
        variant: "destructive",
      });
    }
  };

  // Reprocessamento desabilitado
  const reprocessByLinks = async (): Promise<any> => {
    setIsImporting(true);
    
    // Simular processamento
    setTimeout(() => {
      toast({
        variant: "destructive",
        title: "Reprocessamento indisponível",
        description: "Esta funcionalidade está temporariamente desabilitada"
      });
      setIsImporting(false);
    }, 1000);
    
    return null;
  };

  return {
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
    reprocessByLinks,  // 🆕 Função super rápida
    clearData,
    removeRow,
    removeRowsWithErrors,
  };
};
