import { CombinedImportService } from '@/lib/services/combined-import-service';
import { CombinedReadingAndReportImport } from '@/types/combined-import';

// Dados de exemplo para teste
const sampleData: CombinedReadingAndReportImport[] = [
  {
    condominio: "Condomínio ABC",
    ano_ref: "2025",
    mes_ref: "01",
    bloco: "A",
    apartamento: "101",
    chassi: "12345",
    leitura_atual: 150.5,
    data_leitura: "31/01/2025",
    prox_leitura: "28/02/2025",
    foto: "https://example.com/foto1.jpg",
    pre_leitura: "Não",
    leitura_anterior: 148.2,
    data_leitura_anterior: "31/12/2024",
    consumo_agua_m3: 2.3,
    valor_consumo_agua: 15.50,
    valor_esgoto: 8.75,
    consumo_pipa_m3: 0,
    custo_pipa: 0,
    rateio_agua: 0.25,
    consumo_total_agua_m3: 2.3,
    valor_total_agua_unidade: 24.25,
    consumo_gas_m3: 0,
    valor_consumo_gas: 0
  },
  {
    condominio: "Condomínio ABC",
    ano_ref: "2025", 
    mes_ref: "01",
    bloco: "A",
    apartamento: "102",
    chassi: "12346",
    leitura_atual: 75.8,
    data_leitura: "31/01/2025",
    prox_leitura: "28/02/2025",
    foto: "",
    pre_leitura: false,
    // Sem leitura anterior
    consumo_agua_m3: 1.8,
    valor_consumo_agua: 12.20,
    valor_esgoto: 6.90,
    consumo_pipa_m3: 0,
    custo_pipa: 0,
    rateio_agua: 0.18,
    consumo_total_agua_m3: 1.8,
    valor_total_agua_unidade: 19.10,
    consumo_gas_m3: 0,
    valor_consumo_gas: 0
  },
  {
    condominio: "Condomínio ABC",
    ano_ref: "2025",
    mes_ref: "01", 
    bloco: "B",
    apartamento: "201",
    // Sem dados de leitura, apenas relatório
    consumo_agua_m3: 3.1,
    valor_consumo_agua: 18.60,
    valor_esgoto: 10.50,
    consumo_pipa_m3: 0.5,
    custo_pipa: 25.00,
    rateio_agua: 0.31,
    consumo_total_agua_m3: 3.6,
    valor_total_agua_unidade: 54.10,
    consumo_gas_m3: 0,
    valor_consumo_gas: 0
  }
];

// Mock de complexes para teste
const mockComplexes = [
  {
    id: "complex-1",
    socialName: "Condomínio ABC",
    companyId: "company-1"
  }
];

/**
 * Função de teste para validar o serviço de importação combinada
 */
export function testCombinedImportService() {
  console.log("🧪 Testando Combined Import Service...");
  
  // Teste 1: Validação
  console.log("\n📋 Teste 1: Validação de dados");
  const validation = CombinedImportService.validateCombinedImport(
    sampleData, 
    "01", // monthRef
    "2025", // yearRef  
    mockComplexes
  );
  
  console.log("Resultado da validação:", validation);
  console.log("✅ Válido:", validation.isValid);
  console.log("📊 Resumo:", validation.summary);
  
  if (validation.errors.length > 0) {
    console.log("❌ Erros:", validation.errors);
  }
  
  if (validation.warnings.length > 0) {
    console.log("⚠️ Avisos:", validation.warnings);
  }
  
  // Teste 2: Processamento de linhas individuais
  console.log("\n🔄 Teste 2: Processamento de linha individual");
  const processedData = CombinedImportService.processImportRow(
    sampleData[0], // Primeira linha (com leitura e relatório)
    "apartment-101-id",
    "dealership-reading-id"
  );
  
  console.log("Dados processados:", processedData);
  console.log("🔗 Tem leituras:", processedData.hasReadingData);
  console.log("📊 Tem relatório:", processedData.hasReportData);
  console.log("📖 Leituras geradas:", processedData.readings.length);
  
  // Teste 3: Verificação de tipos de dados
  console.log("\n🔍 Teste 3: Verificação de tipos");
  sampleData.forEach((row, index) => {
    const hasReadings = CombinedImportService.hasReadingData(row);
    const hasReports = CombinedImportService.hasReportData(row);
    
    console.log(`Linha ${index + 1} (${row.bloco}/${row.apartamento}):`);
    console.log(`  - Leituras: ${hasReadings ? '✅' : '❌'}`);
    console.log(`  - Relatórios: ${hasReports ? '✅' : '❌'}`);
  });
  
  console.log("\n🎉 Todos os testes concluídos!");
}

/**
 * Dados de exemplo para uso no template CSV
 */
export const templateData = [
  ["condominio", "ano_ref", "mes_ref", "bloco", "apartamento", "chassi", "leitura_atual", "data_leitura", "leitura_anterior", "data_leitura_anterior", "consumo_agua_m3", "valor_consumo_agua", "valor_esgoto", "consumo_pipa_m3", "custo_pipa", "rateio_agua", "consumo_total_agua_m3", "valor_total_agua_unidade", "consumo_gas_m3", "valor_consumo_gas"],
  ["Condomínio Exemplo", "2025", "01", "A", "101", "12345", "150.5", "31/01/2025", "148.2", "31/12/2024", "2.3", "15.50", "8.75", "0", "0", "0.25", "2.3", "24.25", "0", "0"],
  ["Condomínio Exemplo", "2025", "01", "A", "102", "12346", "75.8", "31/01/2025", "", "", "1.8", "12.20", "6.90", "0", "0", "0.18", "1.8", "19.10", "0", "0"],
  ["Condomínio Exemplo", "2025", "01", "B", "201", "", "", "", "", "", "3.1", "18.60", "10.50", "0.5", "25.00", "0.31", "3.6", "54.10", "0", "0"]
];

export default { testCombinedImportService, templateData };
