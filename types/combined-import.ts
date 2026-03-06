export interface CombinedReadingAndReportImport {
  // Identificação (obrigatórios)
  condominio: string;
  ano_ref: number | string;
  mes_ref: string;
  bloco: number | string;
  apartamento: number | string;
  
  // Dados de leitura (opcionais)
  chassi?: string;
  leitura_atual?: number;
  data_leitura?: string;
  leitura_anterior?: number;
  data_leitura_anterior?: string;
  prox_leitura?: string; // Data da próxima leitura
  foto?: string; // URL da foto
  pre_leitura?: string | boolean; // Indica se é pré-leitura ('Sim'/'Não' ou boolean)
  
  // Dados de relatório (opcionais)
  consumo_agua_m3?: number;
  valor_consumo_agua?: number;
  valor_esgoto?: number;
  consumo_pipa_m3?: number;
  custo_pipa?: number;
  rateio_agua?: number;
  consumo_total_agua_m3?: number;
  valor_total_agua_unidade?: number;
  consumo_gas_m3?: number;
  valor_consumo_gas?: number;
}

export interface ProcessedCombinedData {
  apartmentId: string;
  readings: ProcessedReading[];
  apartmentReport: Partial<ApartmentConsumptionReport>;
  hasReadingData: boolean;
  hasReportData: boolean;
}

export interface ProcessedReading {
  reading: number;
  readAt: Date;
  readAtDate: string;
  monthRef: string;
  yearRef: string;
  meterId?: string;
  apartmentId: string;
  isManualReading: boolean;
  isPreReading: boolean;
  registerName?: string;
  nextReadingDate?: string | null;
  urlCover?: string | null;
}

export interface CombinedImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validRows: CombinedReadingAndReportImport[];
  invalidRows: CombinedReadingAndReportImport[];
  complexExists: boolean;
  complexName?: string;
  summary: {
    totalRows: number;
    validRows: number;
    rowsWithReadings: number;
    rowsWithReports: number;
    rowsWithBoth: number;
  };
}

export interface CombinedImportResult {
  success: boolean;
  readingsCreated: number;
  reportsCreated: number;
  reportsUpdated: number;
  linkedReports: number; // Reports linked to readings via lastReadingId
  errors: Array<{
    row: number;
    type: 'reading' | 'report' | 'validation';
    message: string;
  }>;
  warnings: Array<{
    row: number;
    type: 'reading' | 'report' | 'linking';
    message: string;
  }>;
}

export interface ApartmentConsumptionReport {
  id?: string;
  monthRef: string;
  yearRef: string;
  consumption: number;
  totalConsumption?: number;
  consumptionCost: number;
  sewageCost: number;
  partial: number;
  totalUnit: number;
  kiteCarConsumption?: number;
  kiteCarCost?: number;
  consumptionGasValue?: number;
  totalGasValue?: number;
  dealershipReadingId: string;
  apartmentId: string;
  lastReadingId?: string;
}

// Mapeamento dos nomes de meses para números
export const MONTH_NAMES_MAP: Record<string, string> = {
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
