import { 
  CombinedReadingAndReportImport, 
  ProcessedCombinedData, 
  CombinedImportValidationResult,
  CombinedImportResult,
  ProcessedReading,
  ApartmentConsumptionReport,
  MONTH_NAMES_MAP 
} from '@/types/combined-import';
import { parseIotReadingDate, formatReadingDate, formatSimpleDate, smartParseDate } from '@/lib/utils';

export class CombinedImportService {
  private static monthNumberToName = (value: string | number | null | undefined): string => {
    const raw = (value ?? '').toString().trim().toLowerCase();
    if (!raw) return raw;
    const numeric = MONTH_NAMES_MAP[raw] || (/^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : raw);
    const monthMap: Record<string, string> = {
      '01': 'Janeiro',
      '02': 'Fevereiro',
      '03': 'Março',
      '04': 'Abril',
      '05': 'Maio',
      '06': 'Junho',
      '07': 'Julho',
      '08': 'Agosto',
      '09': 'Setembro',
      '10': 'Outubro',
      '11': 'Novembro',
      '12': 'Dezembro'
    };
    if (monthMap[numeric]) return monthMap[numeric];
    // Fallback: capitalize first letter if already a name
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };
  /**
   * Valida os dados importados da planilha combinada
   */
  static validateCombinedImport(
    rows: CombinedReadingAndReportImport[],
    monthRef: string,
    yearRef: string,
    complexes: any[]
  ): CombinedImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validRows: CombinedReadingAndReportImport[] = [];
    const invalidRows: CombinedReadingAndReportImport[] = [];

    if (rows.length === 0) {
      errors.push("A planilha está vazia.");
      return {
        isValid: false,
        errors,
        warnings,
        validRows,
        invalidRows,
        complexExists: false,
        summary: {
          totalRows: 0,
          validRows: 0,
          rowsWithReadings: 0,
          rowsWithReports: 0,
          rowsWithBoth: 0
        }
      };
    }

    // Verificar se todos os condomínios são o mesmo
    const condominiums = [...new Set(rows.map(row => row.condominio?.toString().trim()).filter(Boolean))];
    if (condominiums.length > 1) {
      errors.push(`❌ A planilha contém mais de um condomínio: ${condominiums.join(", ")}. Apenas um condomínio é permitido por importação.`);
    }

    if (condominiums.length === 0) {
      errors.push("❌ Nenhum condomínio válido encontrado na planilha. Verifique se a coluna 'condominio' está preenchida.");
      return {
        isValid: false,
        errors,
        warnings,
        validRows,
        invalidRows,
        complexExists: false,
        summary: {
          totalRows: rows.length,
          validRows: 0,
          rowsWithReadings: 0,
          rowsWithReports: 0,
          rowsWithBoth: 0
        }
      };
    }

    // Verificar se o condomínio existe
    const condominiumName = condominiums[0];
    const complex = complexes.find(c => 
      c.socialName?.toLowerCase().trim() === condominiumName.toLowerCase().trim()
    );

    if (!complex) {
      errors.push(`❌ O condomínio "${condominiumName}" não foi encontrado no sistema. Condomínios disponíveis: ${complexes.map(c => c.socialName).slice(0, 5).join(", ")}${complexes.length > 5 ? "..." : ""}`);
    }

    let rowsWithReadings = 0;
    let rowsWithReports = 0;
    let rowsWithBoth = 0;

    // Validar cada linha
    rows.forEach((row, index) => {
      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];
      const lineNumber = index + 2; // Excel line number

      // Converter ano e mês para strings para comparação
      const rowYear = row.ano_ref?.toString();
      const rowMonth = row.mes_ref?.toString().toLowerCase().trim();
      const normalizedMonth = MONTH_NAMES_MAP[rowMonth] || rowMonth;

      // Verificar se a linha pertence ao mês/ano desejado
      if (rowYear !== yearRef || normalizedMonth !== monthRef) {
        return; // Pular esta linha
      }

      // Verificar campos obrigatórios básicos
      const basicFields = {
        condominio: !!(row.condominio?.toString().trim()),
        bloco: !!(row.bloco?.toString().trim()),
        apartamento: !!(row.apartamento?.toString().trim())
      };

      // Adicionar erros para campos básicos ausentes
      if (!basicFields.condominio) {
        rowErrors.push(`🏢 Linha ${lineNumber}: Condomínio é obrigatório.`);
      }
      if (!basicFields.bloco) {
        rowErrors.push(`🏗️ Linha ${lineNumber}: Bloco é obrigatório.`);
      }
      if (!basicFields.apartamento) {
        rowErrors.push(`🏠 Linha ${lineNumber}: Apartamento é obrigatório.`);
      }

      // Verificar TODOS os campos necessários para uma leitura completa
      // Agora incluímos `prox_leitura` entre os campos que definem uma leitura completa
      const allReadingFields = {
        // Campos básicos obrigatórios
        condominio: basicFields.condominio,
        bloco: basicFields.bloco,
        apartamento: basicFields.apartamento,
        // Campos específicos de leitura
        chassi: !!(row.chassi?.toString().trim()),
        leitura_atual: (row.leitura_atual !== null && row.leitura_atual !== undefined),
        data_leitura: !!(row.data_leitura?.toString().trim()),
        prox_leitura: !!(row.prox_leitura?.toString().trim())
      };

      // Indicadores de intenção de registrar leitura: se a planilha trouxe qualquer campo
      // relacionado a leitura (inclui prox_leitura, foto, pre_leitura, leitura_anterior)
      const readingIntentIndicators = {
        chassi: allReadingFields.chassi,
        leitura_atual: allReadingFields.leitura_atual,
        data_leitura: allReadingFields.data_leitura,
        prox_leitura: allReadingFields.prox_leitura,
        foto: !!(row.foto?.toString().trim()),
        pre_leitura: row.pre_leitura !== null && row.pre_leitura !== undefined,
        leitura_anterior: row.leitura_anterior !== null && row.leitura_anterior !== undefined
      };

      const intentCount = Object.values(readingIntentIndicators).filter(Boolean).length;
      const allReadingFieldsPresent = Object.values(allReadingFields).filter(Boolean).length;

      // Considera leitura completa quando TODOS os campos necessários (agora 7) estão presentes
      const hasCompleteReadingData = allReadingFieldsPresent === Object.keys(allReadingFields).length;
      // Leitura parcial quando existe qualquer indicador de intenção, mas não está completa
      const hasPartialReadingData = intentCount > 0 && !hasCompleteReadingData;

      // Verificar se tem dados de relatório
      const hasReportData = !!(
        (row.consumo_agua_m3 !== null && row.consumo_agua_m3 !== undefined) ||
        (row.valor_consumo_agua !== null && row.valor_consumo_agua !== undefined) ||
        (row.valor_esgoto !== null && row.valor_esgoto !== undefined) ||
        (row.consumo_gas_m3 !== null && row.consumo_gas_m3 !== undefined) ||
        (row.valor_consumo_gas !== null && row.valor_consumo_gas !== undefined)
      );

      // Validar dados de leitura parciais (quando há intenção de registrar leitura mas faltam campos)
      if (hasPartialReadingData) {
        const missingFields = Object.entries(allReadingFields)
          .filter(([field, present]) => !present)
          .map(([field]) => field);

        const presentFields = Object.entries(allReadingFields)
          .filter(([field, present]) => present)
          .map(([field]) => field);
        
        // Traduzir nomes dos campos para português
        const fieldTranslations: { [key: string]: string } = {
          condominio: 'condomínio',
          bloco: 'bloco',
          apartamento: 'apartamento',
          chassi: 'chassi do medidor',
          leitura_atual: 'leitura atual',
          data_leitura: 'data da leitura'
        };

        const presentFieldsTranslated = presentFields.map(field => fieldTranslations[field] || field);
        const missingFieldsTranslated = missingFields.map(field => fieldTranslations[field] || field);
        
        rowErrors.push(`🔧 Linha ${lineNumber}: Tentativa de registrar leitura detectada, mas dados incompletos. Encontrados: ${presentFieldsTranslated.join(', ')}. Faltam: ${missingFieldsTranslated.join(', ')}. Para registrar leituras, todos os campos são obrigatórios: condomínio, bloco, apartamento, chassi do medidor, leitura atual e data da leitura.`);
      }

      // Deve ter pelo menos dados de leitura completos OU relatório
      if (!hasCompleteReadingData && !hasReportData) {
        if (hasPartialReadingData) {
          // Já foi tratado acima
        } else {
          rowErrors.push(`⚠️ Linha ${lineNumber}: Deve ter pelo menos dados de leitura completos (chassi + leitura_atual + data_leitura) OU dados de relatório (consumo_agua_m3, valor_consumo_agua, etc.).`);
        }
      }

      // Validações específicas de leitura (apenas se tem dados completos)
      if (hasCompleteReadingData) {
        if (!row.chassi?.toString().trim()) {
          rowErrors.push(`🔢 Linha ${lineNumber}: Chassi do medidor é obrigatório quando há dados de leitura.`);
        }
        if (row.leitura_atual === null || row.leitura_atual === undefined || row.leitura_atual < 0) {
          rowErrors.push(`📊 Linha ${lineNumber}: Leitura atual deve ser um valor válido >= 0.`);
        }
        if (!row.data_leitura?.toString().trim()) {
          rowErrors.push(`📅 Linha ${lineNumber}: Data da leitura é obrigatória quando há dados de leitura.`);
        } else {
          // Validar formato da data
          try {
            parseIotReadingDate(row.data_leitura.toString());
          } catch (error) {
            rowErrors.push(`📅 Linha ${lineNumber}: Data da leitura em formato inválido. Use DD/MM/AAAA (ex: 31/01/2025).`);
          }
        }

        // Validar leitura anterior se fornecida
        if (row.leitura_anterior !== null && row.leitura_anterior !== undefined) {
          if (row.leitura_anterior < 0) {
            rowErrors.push(`📊 Linha ${lineNumber}: Leitura anterior deve ser >= 0 se fornecida.`);
          }
          if (row.data_leitura_anterior) {
            try {
              parseIotReadingDate(row.data_leitura_anterior.toString());
            } catch (error) {
              rowErrors.push(`📅 Linha ${lineNumber}: Data da leitura anterior em formato inválido. Use DD/MM/AAAA (ex: 31/12/2024).`);
            }
          } else {
            rowWarnings.push(`⚠️ Linha ${lineNumber}: Leitura anterior fornecida sem data. Recomenda-se incluir data_leitura_anterior.`);
          }
        }

        // Validar próxima leitura se fornecida
        if (row.prox_leitura) {
          try {
            parseIotReadingDate(row.prox_leitura.toString());
          } catch (error) {
            rowErrors.push(`📅 Linha ${lineNumber}: Próxima leitura em formato inválido (está "${row.prox_leitura}"). Use DD/MM/AAAA (ex: 28/02/2025).`);
          }
        }

        // Validar pré-leitura se fornecida
        if (row.pre_leitura !== null && row.pre_leitura !== undefined) {
          const preValue = row.pre_leitura.toString().toLowerCase().trim();
          if (!['sim', 'não', 'nao', 'true', 'false', '1', '0'].includes(preValue)) {
            rowErrors.push(`✅ Linha ${lineNumber}: Pre-leitura deve ser 'Sim', 'Não', true ou false.`);
          }
        }
      }

      // Validações específicas de relatório
      if (hasReportData) {
        // Validar valores numéricos
        const numericFields = [
          { field: 'consumo_agua_m3', label: 'Consumo água (m³)' },
          { field: 'valor_consumo_agua', label: 'Valor consumo água' },
          { field: 'valor_esgoto', label: 'Valor esgoto' },
          { field: 'consumo_pipa_m3', label: 'Consumo pipa (m³)' },
          { field: 'custo_pipa', label: 'Custo pipa' },
          { field: 'rateio_agua', label: 'Rateio água' },
          { field: 'consumo_total_agua_m3', label: 'Consumo total água (m³)' },
          { field: 'valor_total_agua_unidade', label: 'Valor total água unidade' },
          { field: 'consumo_gas_m3', label: 'Consumo gás (m³)' },
          { field: 'valor_consumo_gas', label: 'Valor consumo gás' }
        ];

        const allowNegative = [
          'consumo_agua_m3',
          'valor_consumo_agua', 
          'valor_esgoto',
          'consumo_pipa_m3',
          'custo_pipa',
          'rateio_agua',
          'consumo_total_agua_m3',
          'valor_total_agua_unidade',
          'consumo_gas_m3',
          'valor_consumo_gas'
        ];

        numericFields.forEach(({ field, label }) => {
          const value = (row as any)[field];
          if (value !== null && value !== undefined) {
            if (isNaN(Number(value))) {
              rowErrors.push(`💰 Linha ${lineNumber}: ${label} deve ser um valor numérico.`);
            } else if (Number(value) < 0 && !allowNegative.includes(field)) {
              rowErrors.push(`💰 Linha ${lineNumber}: ${label} deve ser >= 0.`);
            }
          }
        });
      }

      // Contabilizar tipos de dados (apenas dados completos)
      if (hasCompleteReadingData) rowsWithReadings++;
      if (hasReportData) rowsWithReports++;
      if (hasCompleteReadingData && hasReportData) rowsWithBoth++;

      // Adicionar à lista apropriada
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        invalidRows.push(row);
      } else {
        validRows.push(row);
        if (rowWarnings.length > 0) {
          warnings.push(...rowWarnings);
        }
      }
    });

    // Adicionar informações sobre linhas filtradas por período
    const filteredRows = rows.filter(row => {
      const rowYear = row.ano_ref?.toString();
      const rowMonth = row.mes_ref?.toString().toLowerCase().trim();
      const normalizedMonth = MONTH_NAMES_MAP[rowMonth] || rowMonth;
      return rowYear !== yearRef || normalizedMonth !== monthRef;
    });

    if (filteredRows.length > 0) {
      warnings.push(`📅 ${filteredRows.length} linha(s) ignorada(s) por não pertencer ao período ${monthRef}/${yearRef}.`);
    }

    // Verificar se não há dados válidos para o período
    if (validRows.length === 0 && filteredRows.length > 0) {
      errors.push(`❌ Nenhuma linha válida encontrada para o período ${monthRef}/${yearRef}. Verifique se ano_ref e mes_ref estão corretos. ${filteredRows.length} linha(s) foram ignorada(s) por pertencerem a outros períodos e ${invalidRows.length} linha(s) são inválidas. Período esperado: mês "${monthRef}", ano "${yearRef}". Meses encontrados na planilha: ${[...new Set(rows.map(r => r.mes_ref?.toString().trim()).filter(Boolean))].join(", ")}.`);
    }

    const isValid = errors.length === 0 && validRows.length > 0;

    return {
      isValid,
      errors,
      warnings,
      validRows,
      invalidRows,
      complexExists: !!complex,
      complexName: condominiumName,
      summary: {
        totalRows: rows.length,
        validRows: validRows.length,
        rowsWithReadings,
        rowsWithReports,
        rowsWithBoth
      }
    };
  }

  /**
   * Processa uma linha da importação combinada
   */
  static processImportRow(
    row: CombinedReadingAndReportImport,
    apartmentId: string,
    dealershipReadingId: string
  ): ProcessedCombinedData {
    const readings: ProcessedReading[] = [];
    let apartmentReport: Partial<ApartmentConsumptionReport> = {};

    const hasReadingData = !!(
      row.chassi?.toString().trim() && 
      (row.leitura_atual !== null && row.leitura_atual !== undefined) &&
      row.data_leitura?.toString().trim()
    );

    const hasReportData = !!(
      (row.consumo_agua_m3 !== null && row.consumo_agua_m3 !== undefined) ||
      (row.valor_consumo_agua !== null && row.valor_consumo_agua !== undefined) ||
      (row.valor_esgoto !== null && row.valor_esgoto !== undefined) ||
      (row.consumo_gas_m3 !== null && row.consumo_gas_m3 !== undefined) ||
      (row.valor_consumo_gas !== null && row.valor_consumo_gas !== undefined)
    );

    // Processar dados de leitura
    if (hasReadingData) {
      const readAt = parseIotReadingDate(row.data_leitura!.toString());
      
      const reading: ProcessedReading = {
        reading: Number(row.leitura_atual),
        readAt,
        readAtDate: formatReadingDate(readAt),
        monthRef: CombinedImportService.monthNumberToName(row.mes_ref),
        yearRef: row.ano_ref.toString(),
        apartmentId,
        isManualReading: true,
        isPreReading: row.pre_leitura === 'Sim' || row.pre_leitura === true || row.pre_leitura === 'true',
        registerName: row.chassi?.toString().trim(),
        nextReadingDate: CombinedImportService.normalizeNextReadingDate(row.prox_leitura),
        urlCover: row.foto?.toString().trim() || null
      };

      readings.push(reading);

      // Processar leitura anterior se fornecida
      if (row.leitura_anterior !== null && row.leitura_anterior !== undefined && row.data_leitura_anterior) {
        const previousReadAt = parseIotReadingDate(row.data_leitura_anterior.toString());
        
        const previousReading: ProcessedReading = {
          reading: Number(row.leitura_anterior),
          readAt: previousReadAt,
          readAtDate: formatReadingDate(previousReadAt),
          monthRef: CombinedImportService.monthNumberToName(row.mes_ref),
          yearRef: row.ano_ref.toString(),
          apartmentId,
          isManualReading: true,
          isPreReading: false, // Leituras anteriores normalmente não são pré-leituras
          registerName: row.chassi?.toString().trim(),
          nextReadingDate: null, // Leituras anteriores não têm próxima leitura
          urlCover: null // Leituras anteriores normalmente não têm foto
        };

        readings.push(previousReading);
      }
    }

    // Processar dados de relatório
    if (hasReportData) {
      apartmentReport = {
        monthRef: row.mes_ref.toString(),
        yearRef: row.ano_ref.toString(),
        apartmentId,
        dealershipReadingId,
        consumption: row.consumo_agua_m3 || 0,
        totalConsumption: row.consumo_total_agua_m3 || row.consumo_agua_m3 || 0,
        consumptionCost: row.valor_consumo_agua || 0,
        sewageCost: row.valor_esgoto || 0,
        partial: row.rateio_agua || 0,
        totalUnit: row.valor_total_agua_unidade || 0,
        kiteCarConsumption: row.consumo_pipa_m3 || 0,
        kiteCarCost: row.custo_pipa || 0,
        consumptionGasValue: row.consumo_gas_m3 || 0,
        totalGasValue: row.valor_consumo_gas || 0
      };
    }

    return {
      apartmentId,
      readings,
      apartmentReport,
      hasReadingData,
      hasReportData
    };
  }

  /**
   * Determina se uma linha tem dados de leitura válidos
   */
  static hasReadingData(row: CombinedReadingAndReportImport): boolean {
    return !!(
      row.chassi?.toString().trim() && 
      (row.leitura_atual !== null && row.leitura_atual !== undefined) &&
      row.data_leitura?.toString().trim()
    );
  }

  /**
   * Determina se uma linha tem dados de relatório válidos
   */
  static hasReportData(row: CombinedReadingAndReportImport): boolean {
    return !!(
      (row.consumo_agua_m3 !== null && row.consumo_agua_m3 !== undefined) ||
      (row.valor_consumo_agua !== null && row.valor_consumo_agua !== undefined) ||
      (row.valor_esgoto !== null && row.valor_esgoto !== undefined) ||
      (row.consumo_gas_m3 !== null && row.consumo_gas_m3 !== undefined) ||
      (row.valor_consumo_gas !== null && row.valor_consumo_gas !== undefined)
    );
  }

  private static normalizeNextReadingDate(rawValue: unknown): string | null {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (typeof trimmed === 'string' && trimmed.length === 0) {
      return null;
    }

    try {
      const parsedDate = smartParseDate(rawValue as any);
      return formatSimpleDate(parsedDate);
    } catch (err) {
      const fallback = rawValue?.toString?.().trim();
      return fallback && fallback.length > 0 ? fallback : null;
    }
  }
}
