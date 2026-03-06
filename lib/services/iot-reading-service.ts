import { PermissionableEntity } from '@prisma/client';
import { ReadingReportImport, DailyReadingImport } from '@/types/reading';
import { bulkCreateEntity } from '@/lib/userData';
import prisma from '@/lib/prisma';
import { parseIotReadingDate, formatReadingDate, parseReadingValue } from '@/lib/utils';

/**
 * Parse específico para valores de leituras do formato diário (Excel)
 * Preserva decimais exatos do Excel sem alterações
 */
function parseDailyReadingValue(value: any): number {
  if (value === null || value === undefined || value === '') {
    throw new Error('Valor de leitura não informado');
  }
  
  // Se já é número (vem do Excel), usa diretamente
  if (typeof value === 'number') {
    console.log(`📊 VALOR NUMÉRICO DIRETO DO EXCEL: ${value}`);
    return value;
  }
  
  // Se é string, tenta converter preservando formato
  if (typeof value === 'string') {
    // Remove espaços
    const cleanValue = value.trim();
    
    // Se contém vírgula (formato brasileiro), substitui por ponto
    const normalizedValue = cleanValue.replace(',', '.');
    
    const numValue = Number(normalizedValue);
    if (isNaN(numValue)) {
      throw new Error(`Valor de leitura inválido: ${value}`);
    }
    
    console.log(`📊 VALOR STRING CONVERTIDO: "${value}" -> ${numValue}`);
    return numValue;
  }
  
  // Fallback: tenta converter diretamente
  const numValue = Number(value);
  if (isNaN(numValue)) {
    throw new Error(`Valor de leitura inválido: ${value}`);
  }
  
  console.log(`📊 VALOR FALLBACK: ${value} -> ${numValue}`);
  return numValue;
}

/**
 * Converte Excel Serial Number para Date
 * Excel armazena datas como números onde 1 = 01/01/1900
 * Referência: https://docs.microsoft.com/en-us/office/troubleshoot/excel/1900-and-1904-date-system
 */
function excelSerialToDate(serial: number): Date {
  // Excel epoch: 1 de janeiro de 1900 = serial 1
  // Mas existe um bug histórico onde Excel considera 1900 como ano bissexto
  // Para datas >= 60 (após 28/02/1900), devemos subtrair 1 dia
  
  // Calcular dias desde 1 de janeiro de 1900
  let days = serial - 1; // Serial 1 = 1 de janeiro de 1900
  
  // Corrigir o bug do ano 1900
  if (serial >= 60) {
    days = days - 1;
  }
  
  // Criar a data base: 1 de janeiro de 1900
  const baseDate = new Date(1900, 0, 1); // 1 de janeiro de 1900
  
  // Adicionar os dias
  const resultDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  // Garantir que seja meio-dia para evitar problemas de timezone
  return new Date(resultDate.getFullYear(), resultDate.getMonth(), resultDate.getDate(), 12, 0, 0, 0);
}

/**
 * Detecta se uma string é um Excel Serial Number e converte para data
 */
function parseColumnNameAsDate(columnName: string): Date {
  // Primeiro, tenta limpar a string removendo espaços
  const cleanColumnName = String(columnName).trim();
  
  // Verifica se é um número (Excel Serial)
  const numericValue = Number(cleanColumnName);
  if (!isNaN(numericValue) && numericValue > 1 && numericValue < 200000) {
    // Parece ser um Excel Serial Number (entre 1 e 200000 seria aproximadamente 1900-2450)
    console.log(`🔢 Detectado Excel Serial Number: ${cleanColumnName}`);
    const convertedDate = excelSerialToDate(numericValue);
    console.log(`📅 Data convertida: ${convertedDate.toISOString()} (${convertedDate.toLocaleDateString('pt-BR')}) - Ano: ${convertedDate.getFullYear()}, Mês: ${convertedDate.getMonth() + 1}, Dia: ${convertedDate.getDate()}`);
    return convertedDate;
  }
  
  // Tenta parse normal da data
  try {
    const normalDate = parseIotReadingDate(cleanColumnName);
    normalDate.setHours(12, 0, 0, 0); // Define para meio-dia para evitar problemas de timezone
    console.log(`📅 Data normal parseada: ${normalDate.toISOString()} (${normalDate.toLocaleDateString('pt-BR')})`);
    return normalDate;
  } catch (error) {
    console.warn(`⚠️ Erro ao converter '${cleanColumnName}' para data:`, error);
    throw error;
  }
}

export interface ProcessedReading {
  reading: number;
  readAt: Date;
  readAtDate: string;
  deviceId: string;
  remoteId: string;
  deviceName?: string;
  isManualReading: boolean;
  isPreReading: boolean;
  meterId?: string;
}

export interface ProcessedDevice {
  deviceId: string;
  remoteId: string;
  name?: string;
}

export class IotReadingService {
  
  /**
   * Converte uma linha de DailyReadingImport em múltiplas leituras
   */
  static convertDailyImportRowToReadings(row: DailyReadingImport): ProcessedReading[] {
    const deviceId = String(row.device_id);
    const deviceName = row.device_name;
    const multiplier = row.multiplier || 1;
    
    if (!deviceId) {
      throw new Error('device_id é obrigatório');
    }
    
    const readings: ProcessedReading[] = [];
    
    // Processa todas as colunas que não são as fixas (device_id, device_name, multiplier)
    const fixedColumns = ['device_id', 'device_name', 'multiplier'];
    
    for (const [columnName, value] of Object.entries(row)) {
      // Pula colunas fixas
      if (fixedColumns.includes(columnName)) {
        continue;
      }
      
      // Pula valores vazios ou undefined
      if (value === undefined || value === null || value === '') {
        continue;
      }
      
      try {
        // Assume que o nome da coluna é uma data
        const readAt = parseColumnNameAsDate(columnName);
        
        // Log detalhado do valor antes e depois do parse (apenas para formato diário)
        console.log(`🔢 VALOR ORIGINAL (diário): "${value}" (tipo: ${typeof value})`);
        const reading = parseDailyReadingValue(value); // Usa valor direto, SEM multiplicador
        console.log(`🔢 VALOR FINAL (sem multiplicador): ${reading}`);
        console.log(`🔢 MULTIPLICADOR IGNORADO: ${multiplier} (valores do Excel já estão corretos)`);
        
        readings.push({
          reading,
          readAt,
          readAtDate: formatReadingDate(readAt),
          deviceId,
          remoteId: deviceId, // Para leituras diárias, usamos deviceId como remoteId também
          deviceName,
          isManualReading: false,
          isPreReading: false,
        });
      } catch (error) {
        console.warn(`Erro ao processar coluna "${columnName}" com valor "${value}" para device_id: ${deviceId}:`, error);
        // Continue processando outras colunas
      }
    }
    
    if (readings.length === 0) {
      throw new Error(`Nenhuma leitura válida encontrada para device_id: ${deviceId}`);
    }
    
    return readings;
  }
  
  /**
   * Converte múltiplas linhas de importação diária em array de leituras
   */
  static convertDailyImportRowsToReadings(rows: DailyReadingImport[]): ProcessedReading[] {
    const allReadings: ProcessedReading[] = [];
    
    for (const row of rows) {
      try {
        const readings = this.convertDailyImportRowToReadings(row);
        allReadings.push(...readings);
      } catch (error) {
        console.warn('Erro ao processar linha de importação diária:', error);
        // Continue processando outras linhas
      }
    }
    
    return allReadings;
  }
  
  /**
   * Processo completo de importação para leituras diárias
   */
  static async processDailyReadingImport(
    userId: string, 
    importRows: DailyReadingImport[]
  ): Promise<{
    success: boolean;
    readingsCreated: number;
    devicesCreated: number;
    readingsWithMeter: number;
    readingsWithoutMeter: number;
    error?: string;
  }> {
    try {
      console.log(`Iniciando processamento de ${importRows.length} linhas de leituras diárias...`);
      
      // 1. Converter linhas em leituras
      const readings = this.convertDailyImportRowsToReadings(importRows);
      
      if (readings.length === 0) {
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated: 0,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: 'Nenhuma leitura válida encontrada nos dados de importação'
        };
      }
      
      // 2. Extrair devices únicos
      const devices = this.extractUniqueDevices(readings);
      console.log(`🔧 DEVICES ÚNICOS EXTRAÍDOS (leituras diárias): ${devices.length}`, devices.map(d => ({ deviceId: d.deviceId, remoteId: d.remoteId, name: d.name })));
      
      // 3. Criar devices que não existem
      const deviceCreationResult = await this.createMissingDevices(userId, devices);
      
      if (!deviceCreationResult.success) {
        console.log(`🔧 ❌ FALHA NA CRIAÇÃO DE DEVICES - ABORTANDO IMPORTAÇÃO:`, deviceCreationResult.error);
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated: 0,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: `Falha na criação de dispositivos IoT necessários: ${deviceCreationResult.error}`
        };
      }
      
      const devicesCreated = deviceCreationResult.devicesCreated;
      console.log(`🔧 DEVICES CRIADOS NESTA IMPORTAÇÃO (leituras diárias): ${devicesCreated}`);
      
      // 4. Buscar links meter-device para vincular leituras
      const meterLinksMap = await this.findMeterLinksForReadings(readings);
      
      // 5. Adicionar meterIds às leituras
      const readingsWithMeterIds = this.addMeterIdsToReadings(readings, meterLinksMap);
      
      const readingsWithMeter = readingsWithMeterIds.filter(r => r.meterId).length;
      const readingsWithoutMeter = readingsWithMeterIds.filter(r => !r.meterId).length;
      
      // 6. Salvar leituras
      const result = await this.saveReadings(userId, readingsWithMeterIds);
      
      if (result.error) {
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: result.error
        };
      }
      
      return {
        success: true,
        readingsCreated: readingsWithMeterIds.length,
        devicesCreated,
        readingsWithMeter,
        readingsWithoutMeter
      };
      
    } catch (error) {
      console.error('Erro no processamento de importação de leituras diárias:', error);
      return {
        success: false,
        readingsCreated: 0,
        devicesCreated: 0,
        readingsWithMeter: 0,
        readingsWithoutMeter: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Converte uma linha de ReadingReportImport em duas leituras
   */
  static convertImportRowToReadings(row: ReadingReportImport): ProcessedReading[] {
    const readings: ProcessedReading[] = [];
    
    const deviceId = String(row.device_id);
    const remoteId = row.remote_id;
    const deviceName = row.device_name;
    
    if (!deviceId || !remoteId) {
      throw new Error('device_id e remote_id são obrigatórios');
    }
    
    // console.log(`Processando linha: device_id=${deviceId}, remote_id=${remoteId}`);
    
    // Primeira leitura
    if (row['data/hora 1'] && row['leitura (m3) 1'] !== undefined && row['leitura (m3) 1'] !== null) {
      try {
        const readAt = parseIotReadingDate(row['data/hora 1']);
        const reading = parseReadingValue(row['leitura (m3) 1']);
        
        readings.push({
          reading,
          readAt,
          readAtDate: formatReadingDate(readAt),
          deviceId,
          remoteId,
          deviceName,
          isManualReading: false,
          isPreReading: false,
        });
        
        // console.log(`Primeira leitura processada: ${reading} em ${readAt.toISOString()}`);
      } catch (error) {
        console.error(`Erro na primeira leitura (device_id: ${deviceId}):`, error);
        throw new Error(`Erro na primeira leitura: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
    
    // Segunda leitura
    if (row['data/hora 2'] && row['leitura (m3) 2'] !== undefined && row['leitura (m3) 2'] !== null) {
      try {
        const readAt = parseIotReadingDate(row['data/hora 2']);
        const reading = parseReadingValue(row['leitura (m3) 2']);
        
        readings.push({
          reading,
          readAt,
          readAtDate: formatReadingDate(readAt),
          deviceId,
          remoteId,
          deviceName,
          isManualReading: false,
          isPreReading: false,
        });
        
        // console.log(`Segunda leitura processada: ${reading} em ${readAt.toISOString()}`);
      } catch (error) {
        console.error(`Erro na segunda leitura (device_id: ${deviceId}):`, error);
        throw new Error(`Erro na segunda leitura: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
    
    if (readings.length === 0) {
      throw new Error(`Nenhuma leitura válida encontrada para device_id: ${deviceId}`);
    }
    
    return readings;
  }
  
  /**
   * Converte múltiplas linhas de importação em array de leituras
   */
  static convertImportRowsToReadings(rows: ReadingReportImport[]): ProcessedReading[] {
    const allReadings: ProcessedReading[] = [];
    
    for (const row of rows) {
      try {
        const readings = this.convertImportRowToReadings(row);
        allReadings.push(...readings);
      } catch (error) {
        console.warn('Erro ao processar linha de importação:', error);
        // Continue processando outras linhas
      }
    }
    
    return allReadings;
  }
  
  /**
   * Extrai devices únicos das leituras
   */
  static extractUniqueDevices(readings: ProcessedReading[]): ProcessedDevice[] {
    const deviceMap = new Map<string, ProcessedDevice>();
    
    for (const reading of readings) {
      if (!deviceMap.has(reading.deviceId)) {
        deviceMap.set(reading.deviceId, {
          deviceId: reading.deviceId,
          remoteId: reading.remoteId,
          name: reading.deviceName,
        });
      }
    }
    
    return Array.from(deviceMap.values());
  }
  
  /**
   * Cria devices que não existem
   */
  static async createMissingDevices(
    userId: string, 
    devices: ProcessedDevice[]
  ): Promise<{
    success: boolean;
    devicesCreated: number;
    error?: string;
  }> {
    if (devices.length === 0) {
      return { success: true, devicesCreated: 0 };
    }
    
    // Verifica quais devices já existem
    const existingDevices = await prisma.iotDevice.findMany({
      where: {
        deviceId: { in: devices.map(d => d.deviceId) },
        deletedAt: null
      },
      select: { deviceId: true }
    });
    
    const existingDeviceIds = new Set(existingDevices.map(d => d.deviceId));
    
    // Filtra devices que precisam ser criados
    const devicesToCreate = devices
      .filter(d => !existingDeviceIds.has(d.deviceId))
      .map(d => ({
        deviceId: d.deviceId,
        remoteId: d.remoteId,
        name: d.name,
        // Outros campos padrão podem ser adicionados aqui
      }));
    
    if (devicesToCreate.length > 0) {
      console.log(`🔧 CRIANDO ${devicesToCreate.length} DEVICES:`, devicesToCreate.map(d => d.deviceId));
      const bulkResult = await bulkCreateEntity(userId, PermissionableEntity.iotDevice, devicesToCreate);
      console.log(`🔧 RESULTADO BULK CREATE DEVICES:`, { 
        success: !bulkResult.error, 
        created: bulkResult.entity?.length || 0,
        error: bulkResult.error 
      });
      
      // Se houve erro na criação, retorna falha
      if (bulkResult.error) {
        return {
          success: false,
          devicesCreated: 0,
          error: bulkResult.error
        };
      }
      
      return {
        success: true,
        devicesCreated: devicesToCreate.length
      };
    } else {
      console.log(`🔧 NENHUM DEVICE NOVO PARA CRIAR`);
      return { success: true, devicesCreated: 0 };
    }
  }
  
  /**
   * Busca MeterDeviceLinks para vincular leituras a meters
   */
  static async findMeterLinksForReadings(
    readings: ProcessedReading[]
  ): Promise<Map<string, string>> {
    if (readings.length === 0) return new Map();
    
    const deviceIds = [...new Set(readings.map(r => r.deviceId))];
    
    // Encontra o período de datas das leituras
    const dates = readings.map(r => r.readAt);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Busca links ativos no período
    const meterLinks = await prisma.meterDeviceLink.findMany({
      where: {
        deviceId: { in: deviceIds },
        deletedAt: null,
        startDate: { lte: maxDate },
        OR: [
          { endDate: null },
          { endDate: { gte: minDate } }
        ]
      },
      select: {
        deviceId: true,
        meterId: true,
        startDate: true,
        endDate: true
      }
    });
    
    // Cria mapeamento device -> meter considerando período
    const deviceToMeterMap = new Map<string, string>();
    
    for (const reading of readings) {
      const applicableLink = meterLinks.find(link => 
        link.deviceId === reading.deviceId &&
        reading.readAt >= link.startDate &&
        (link.endDate === null || reading.readAt <= link.endDate)
      );
      
      if (applicableLink) {
        const key = `${reading.deviceId}_${reading.readAt.getTime()}`;
        deviceToMeterMap.set(key, applicableLink.meterId);
      }
    }
    
    return deviceToMeterMap;
  }
  
  /**
   * Adiciona meterIds às leituras baseado nos links encontrados
   */
  static addMeterIdsToReadings(
    readings: ProcessedReading[], 
    meterLinksMap: Map<string, string>
  ): ProcessedReading[] {
    return readings.map(reading => {
      const key = `${reading.deviceId}_${reading.readAt.getTime()}`;
      const meterId = meterLinksMap.get(key);
      
      return {
        ...reading,
        meterId
      };
    });
  }
  
  /**
   * Salva as leituras no banco de dados
   */
  static async saveReadings(
    userId: string, 
    readings: ProcessedReading[]
  ): Promise<any> {
    if (readings.length === 0) return { entity: [], error: null, status: 200 };
    
    const readingsData = readings.map(reading => ({
      reading: reading.reading,
      readAt: reading.readAt,
      readAtDate: reading.readAtDate,
      deviceId: reading.deviceId,
      remoteId: reading.remoteId,
      deviceName: reading.deviceName,
      isManualReading: reading.isManualReading,
      isPreReading: reading.isPreReading,
      meterId: reading.meterId,
      // Campos derivados para compatibilidade
      registerName: reading.remoteId,
    }));
    
    console.log(`Salvando ${readingsData.length} leituras...`);
    const saveResult = await bulkCreateEntity(userId, PermissionableEntity.reading, readingsData);
    console.log(`Resultado do salvamento das leituras:`, { 
      success: !saveResult.error, 
      saved: saveResult.entity?.length || 0,
      error: saveResult.error 
    });
    return saveResult;
  }
  
  /**
   * Processo completo de importação
   */
  static async processIotReadingImport(
    userId: string, 
    importRows: ReadingReportImport[]
  ): Promise<{
    success: boolean;
    readingsCreated: number;
    devicesCreated: number;
    readingsWithMeter: number;
    readingsWithoutMeter: number;
    error?: string;
  }> {
    try {
      console.log(`Iniciando processamento de ${importRows.length} linhas de importação...`);
      
      // 1. Converter linhas em leituras
      const readings = this.convertImportRowsToReadings(importRows);
      // console.log(`Convertidas ${readings.length} leituras de ${importRows.length} linhas`);
      
      if (readings.length === 0) {
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated: 0,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: 'Nenhuma leitura válida encontrada nos dados de importação'
        };
      }
      
      // 2. Extrair devices únicos
      const devices = this.extractUniqueDevices(readings);
      console.log(`🔧 DEVICES ÚNICOS EXTRAÍDOS: ${devices.length}`, devices.map(d => ({ deviceId: d.deviceId, remoteId: d.remoteId, name: d.name })));
      
      // 3. Criar devices que não existem
      const existingDevicesCount = await prisma.iotDevice.count({
        where: {
          deviceId: { in: devices.map(d => d.deviceId) },
          deletedAt: null
        }
      });
      console.log(`🔧 DEVICES EXISTENTES NO BANCO: ${existingDevicesCount}`);
      
      const deviceCreationResult = await this.createMissingDevices(userId, devices);
      
      // Se falhou na criação de devices necessários, para toda a importação
      if (!deviceCreationResult.success) {
        console.log(`🔧 ❌ FALHA NA CRIAÇÃO DE DEVICES - ABORTANDO IMPORTAÇÃO:`, deviceCreationResult.error);
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated: 0,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: `Falha na criação de dispositivos IoT necessários: ${deviceCreationResult.error}`
        };
      }
      
      const devicesCreated = deviceCreationResult.devicesCreated;
      console.log(`🔧 DEVICES CRIADOS NESTA IMPORTAÇÃO: ${devicesCreated}`);
      
      // 4. Buscar links meter-device para vincular leituras
      const meterLinksMap = await this.findMeterLinksForReadings(readings);
      // console.log(`Encontrados ${meterLinksMap.size} links meter-device`);
      
      // 5. Adicionar meterIds às leituras
      const readingsWithMeterIds = this.addMeterIdsToReadings(readings, meterLinksMap);
      
      const readingsWithMeter = readingsWithMeterIds.filter(r => r.meterId).length;
      const readingsWithoutMeter = readingsWithMeterIds.filter(r => !r.meterId).length;
      
      // console.log(`Leituras com meter: ${readingsWithMeter}, sem meter: ${readingsWithoutMeter}`);
      
      // 6. Salvar leituras
      const result = await this.saveReadings(userId, readingsWithMeterIds);
      
      if (result.error) {
        return {
          success: false,
          readingsCreated: 0,
          devicesCreated,
          readingsWithMeter: 0,
          readingsWithoutMeter: 0,
          error: result.error
        };
      }
      
      return {
        success: true,
        readingsCreated: readingsWithMeterIds.length,
        devicesCreated,
        readingsWithMeter,
        readingsWithoutMeter
      };
      
    } catch (error) {
      console.error('Erro no processamento de importação IoT:', error);
      return {
        success: false,
        readingsCreated: 0,
        devicesCreated: 0,
        readingsWithMeter: 0,
        readingsWithoutMeter: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * ETAPA 1 (Nova) - Prepara importação diária: converte linhas e identifica devices ausentes.
   * NÃO cria nada no banco (somente leitura de devices existentes).
   */
  static async prepareDailyReadingImport(
    userId: string,
    importRows: DailyReadingImport[]
  ): Promise<{
    success: boolean;
    readings: ProcessedReading[];
    missingDevices: { deviceId: string; name?: string }[];
    totalDevices: number;
    error?: string;
  }> {
    try {
      const readings = this.convertDailyImportRowsToReadings(importRows);
      if (readings.length === 0) {
        return { success: false, readings: [], missingDevices: [], totalDevices: 0, error: 'Nenhuma leitura válida encontrada' };
      }
      const devices = this.extractUniqueDevices(readings);
      const deviceIds = devices.map(d => d.deviceId);
      console.time('prepare.iotDevice.findMany');
      const existing = await prisma.iotDevice.findMany({ where: { deviceId: { in: deviceIds }, deletedAt: null }, select: { deviceId: true } });
      console.timeEnd('prepare.iotDevice.findMany');
      const existingSet = new Set(existing.map(e => e.deviceId));
      const missingDevices = devices.filter(d => !existingSet.has(d.deviceId)).map(d => ({ deviceId: d.deviceId, name: d.name }));
      return { success: true, readings, missingDevices, totalDevices: devices.length };
    } catch (e:any) {
      return { success: false, readings: [], missingDevices: [], totalDevices: 0, error: e.message || 'Erro desconhecido' };
    }
  }

  /**
   * ETAPA 3 (Nova) - Cria devices ausentes (se autorizado) e enriquece leituras com meterId.
   */
  static async createDevicesAndEnrichDailyImport(
    userId: string,
    readings: ProcessedReading[],
    createMissingDevices: boolean,
    providedMissingDevices?: { deviceId: string; name?: string }[]
  ): Promise<{
    success: boolean;
    readingsEnriched: ProcessedReading[];
    createdDevices: number;
    readingsWithMeter: number;
    readingsWithoutMeter: number;
    error?: string;
  }> {
    try {
      // Reidratar datas caso tenham vindo serializadas (strings) do frontend
      const hydratedReadings: ProcessedReading[] = readings.map(r => {
        const readAtObj = (r.readAt instanceof Date) ? r.readAt : new Date(r.readAt as any);
        return {
          ...r,
          readAt: readAtObj,
          readAtDate: r.readAtDate || formatReadingDate(readAtObj)
        };
      });

      let createdDevices = 0;
      if (createMissingDevices) {
        // Extrai devices novamente para segurança e filtra pelos fornecidos (caso frontend tenha editado)
        const devices = this.extractUniqueDevices(hydratedReadings);
        const allowedMissing = providedMissingDevices?.map(d => d.deviceId) || devices.map(d => d.deviceId);
        const filtered = devices.filter(d => allowedMissing.includes(d.deviceId));
        console.time('enrich.createMissingDevices');
        const createRes = await this.createMissingDevices(userId, filtered);
        console.timeEnd('enrich.createMissingDevices');
        if (!createRes.success) {
          return { success: false, readingsEnriched: [], createdDevices: 0, readingsWithMeter: 0, readingsWithoutMeter: 0, error: createRes.error || 'Falha ao criar devices' };
        }
        createdDevices = createRes.devicesCreated;
      }
  console.time('enrich.findMeterLinksForReadings');
  const meterLinksMap = await this.findMeterLinksForReadings(hydratedReadings);
      console.timeEnd('enrich.findMeterLinksForReadings');
  const readingsEnriched = this.addMeterIdsToReadings(hydratedReadings, meterLinksMap);
      const readingsWithMeter = readingsEnriched.filter(r => r.meterId).length;
      const readingsWithoutMeter = readingsEnriched.length - readingsWithMeter;
      return { success: true, readingsEnriched, createdDevices, readingsWithMeter, readingsWithoutMeter };
    } catch (e:any) {
      return { success: false, readingsEnriched: [], createdDevices: 0, readingsWithMeter: 0, readingsWithoutMeter: 0, error: e.message || 'Erro desconhecido' };
    }
  }

  /**
   * ETAPA 4 (Nova) - Persiste leituras enriquecidas.
   */
  static async persistDailyReadings(
    userId: string,
    readingsEnriched: ProcessedReading[]
  ): Promise<{
    success: boolean;
    saved: number;
    readingsWithMeter: number;
    readingsWithoutMeter: number;
    error?: string;
  }> {
    try {
      const readingsWithMeter = readingsEnriched.filter(r => r.meterId).length;
      const readingsWithoutMeter = readingsEnriched.length - readingsWithMeter;
      console.time('persist.saveReadings.bulkCreate');
      const result = await this.saveReadings(userId, readingsEnriched);
      console.timeEnd('persist.saveReadings.bulkCreate');
      if (result.error) {
        return { success: false, saved: 0, readingsWithMeter: 0, readingsWithoutMeter: 0, error: result.error };
      }
      return { success: true, saved: readingsEnriched.length, readingsWithMeter, readingsWithoutMeter };
    } catch (e:any) {
      return { success: false, saved: 0, readingsWithMeter: 0, readingsWithoutMeter: 0, error: e.message || 'Erro desconhecido' };
    }
  }
}
