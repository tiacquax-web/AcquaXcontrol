"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

interface ImportedRow {
  condominio: string;
  ano_ref: number | string;
  mes_ref: string;
  bloco: number | string;
  apartamento: number | string;
  consumo_agua_m3?: number | null;
  valor_consumo_agua?: number | null;
  valor_esgoto?: number | null;
  consumo_pipa_m3?: number | null;
  custo_pipa?: number | null;
  rateio_agua?: number | null;
  consumo_total_agua_m3?: number | null;
  valor_total_agua_unidade?: number | null;
  consumo_gas_m3?: number | null;
  valor_consumo_gas?: number | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validRows: ImportedRow[];
  complexExists: boolean;
  complexName?: string;
}

interface UseImportApartmentReportsResult {
  // File handling
  file: File | null;
  setFile: (file: File | null) => void;
  
  // Validation state
  isValidating: boolean;
  validationResult: ValidationResult | null;
  importedData: ImportedRow[];
  
  // Import state
  isImporting: boolean;
  
  // Actions
  validateFile: (file: File, monthRef: string, yearRef: string, complexes: any[]) => Promise<void>;
  importData: (onSuccess: (data: any[]) => void) => Promise<void>;
  clearData: () => void;
}

const MONTH_NAMES_MAP: Record<string, string> = {
  "janeiro": "01",
  "fevereiro": "02",
  "março": "03",
  "abril": "04",
  "maio": "05",
  "junho": "06",
  "julho": "07",
  "agosto": "08",
  "setembro": "09",
  "outubro": "10",
  "novembro": "11",
  "dezembro": "12"
};

export const useImportApartmentReports = (): UseImportApartmentReportsResult => {
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importedData, setImportedData] = useState<ImportedRow[]>([]);

  const validateFile = async (
    file: File,
    monthRef: string,
    yearRef: string,
    complexes: any[]
  ): Promise<void> => {
    setIsValidating(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as ImportedRow[];

      const result = validateImportedData(jsonData, monthRef, yearRef, complexes);
      setValidationResult(result);
      setImportedData(jsonData);
    } catch (error) {
      console.error("Error validating file:", error);
      throw new Error("Não foi possível processar o arquivo. Verifique se é uma planilha Excel válida.");
    } finally {
      setIsValidating(false);
    }
  };

  const validateImportedData = (
    data: ImportedRow[],
    monthRef: string,
    yearRef: string,
    complexes: any[]
  ): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validRows: ImportedRow[] = [];

    if (data.length === 0) {
      errors.push("A planilha está vazia.");
      return { isValid: false, errors, warnings, validRows, complexExists: false };
    }

    // Check if all rows have the same condominio
    const condominiums = [...new Set(data.map(row => row.condominio?.toString().trim()).filter(Boolean))];
    if (condominiums.length > 1) {
      errors.push(`A planilha contém mais de um condomínio: ${condominiums.join(", ")}. Apenas um condomínio é permitido por importação.`);
    }

    if (condominiums.length === 0) {
      errors.push("Nenhum condomínio válido encontrado na planilha.");
      return { isValid: false, errors, warnings, validRows, complexExists: false };
    }

    // Check if the condominium exists
    const condominiumName = condominiums[0];
    const complex = complexes.find(c => 
      c.socialName?.toLowerCase().trim() === condominiumName.toLowerCase().trim()
    );

    if (!complex) {
      errors.push(`O condomínio "${condominiumName}" não foi encontrado no sistema.`);
    }

    // Validate each row
    data.forEach((row, index) => {
      const rowErrors: string[] = [];
      const lineNumber = index + 2; // Excel line number (header is line 1)

      // Convert year and month to strings for comparison
      const rowYear = row.ano_ref?.toString();
      const rowMonth = row.mes_ref?.toString().toLowerCase().trim();
      const normalizedMonth = MONTH_NAMES_MAP[rowMonth] || rowMonth;

      // Check if row belongs to the target month/year
      if (rowYear !== yearRef || normalizedMonth !== monthRef) {
        return; // Skip this row - it's not for the target month/year
      }

      // Check if row has at least water or gas consumption
      const hasWaterConsumption = (row.consumo_agua_m3 !== null && row.consumo_agua_m3 !== undefined) || 
                                 (row.valor_consumo_agua !== null && row.valor_consumo_agua !== undefined);
      const hasGasConsumption = (row.consumo_gas_m3 !== null && row.consumo_gas_m3 !== undefined) || 
                               (row.valor_consumo_gas !== null && row.valor_consumo_gas !== undefined);

      if (!hasWaterConsumption && !hasGasConsumption) {
        rowErrors.push(`Linha ${lineNumber}: Deve ter pelo menos consumo de água ou gás.`);
      }

      // Validate required fields
      if (!row.condominio?.toString().trim()) {
        rowErrors.push(`Linha ${lineNumber}: Condomínio é obrigatório.`);
      }
      if (!row.bloco?.toString().trim()) {
        rowErrors.push(`Linha ${lineNumber}: Bloco é obrigatório.`);
      }
      if (!row.apartamento?.toString().trim()) {
        rowErrors.push(`Linha ${lineNumber}: Apartamento é obrigatório.`);
      }

      if (rowErrors.length === 0) {
        validRows.push({
          ...row,
          ano_ref: rowYear || "",
          mes_ref: normalizedMonth,
          bloco: row.bloco?.toString() || "",
          apartamento: row.apartamento?.toString() || ""
        });
      } else {
        errors.push(...rowErrors);
      }
    });

    if (validRows.length === 0 && errors.length === 0) {
      warnings.push(`Nenhuma linha encontrada para o período ${monthRef}/${yearRef}.`);
    }

    const isValid = errors.length === 0 && (validRows.length > 0 || warnings.length > 0);

    return {
      isValid,
      errors,
      warnings,
      validRows,
      complexExists: !!complex,
      complexName: condominiumName
    };
  };

  const importData = async (onSuccess: (data: any[]) => void): Promise<void> => {
    if (!validationResult?.isValid || !validationResult.validRows.length) {
      throw new Error("Nenhum dado válido para importar");
    }

    setIsImporting(true);
    
    try {
      // Convert imported data to ApartmentWithConsumptionReport format
      const convertedData = validationResult.validRows.map(row => ({
        // Water consumption data
        consumption: row.consumo_agua_m3 || 0,
        totalConsumption: row.consumo_total_agua_m3 || row.consumo_agua_m3 || 0,
        consumptionCost: row.valor_consumo_agua || 0,
        sewageCost: row.valor_esgoto || 0,
        partial: row.rateio_agua || 0,
        totalUnit: row.valor_total_agua_unidade || 0,
        // Kite car data
        kiteCarConsumption: row.consumo_pipa_m3 || 0,
        kiteCarCost: row.custo_pipa || 0,
        // Gas data
        consumptionGasValue: row.consumo_gas_m3 || 0,
        totalGasValue: row.valor_consumo_gas || 0,
        // Apartment identification
        apartment: {
          name: row.apartamento.toString(),
          block: {
            name: row.bloco.toString()
          }
        }
      }));

      onSuccess(convertedData);
      clearData();
    } catch (error) {
      console.error("Error importing data:", error);
      throw new Error("Ocorreu um erro ao importar os dados. Tente novamente.");
    } finally {
      setIsImporting(false);
    }
  };

  const clearData = () => {
    setFile(null);
    setValidationResult(null);
    setImportedData([]);
  };

  return {
    file,
    setFile,
    isValidating,
    validationResult,
    importedData,
    isImporting,
    validateFile,
    importData,
    clearData,
  };
};
