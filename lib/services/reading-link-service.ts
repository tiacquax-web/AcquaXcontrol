import prisma from '@/lib/prisma';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { PermissionableEntity } from '@prisma/client';

export interface UnlinkedReading {
  id: string;
  deviceId: string;
  readAt: Date;
  readAtDate: string;
  reading: number | null;
  device: {
    id: string;
    deviceId: string;
    name: string | null;
  };
}

export interface LinkPeriod {
  meterId: string | null;
  startDate: Date;
  endDate?: Date;
}

export class ReadingLinkService {

  /**
   * Executa uma operação com retry automático em caso de deadlock/write conflict
   */
  private static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        const isWriteConflict = error?.code === 'P2034' || 
          error?.message?.includes('Transaction failed due to a write conflict') ||
          error?.message?.includes('deadlock');
        
        if (isWriteConflict && retryCount < maxRetries) {
          retryCount++;
          const delayMs = Math.pow(2, retryCount) * 100; // Exponential backoff: 200ms, 400ms, 800ms
          console.warn(`⚠️ [${operationName}] Write conflict/deadlock detectado. Retry ${retryCount}/${maxRetries} em ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Falha após ${maxRetries} tentativas em: ${operationName}`);
  }

  /**
   * MÉTODO LEGADO - DESCONTINUADO
   * Reprocessamento lento com skip quadrático e write amplification
   * Mantido apenas para referência histórica - NÃO USAR
   * 
   * @deprecated Use reprocessDeviceReadings que agora utiliza FastReadingReprocessService
   */
  private static async reprocessDeviceReadingsLEGACY_SLOW(
    userId: string,
    deviceId: string
  ): Promise<{ success: boolean; updatedCount: number; error?: string; details?: string }> {
    // Código legado comentado para evitar uso acidental
    throw new Error('Método descontinuado. Use reprocessDeviceReadings() que utiliza FastReadingReprocessService.');
    
    /*
    const executionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`🔄 [${executionId}] INICIANDO reprocessamento para dispositivo: ${deviceId}`);
    
    try {
      // ... código antigo com skip e write amplification ...
      // Removido para forçar migração para versão otimizada
      
    } catch (error) {
      console.error('❌ Erro ao reprocessar leituras do dispositivo:', error);
      return {
        success: false,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
    */
  }

  /**
   * Atualiza leituras em lotes pequenos para evitar deadlocks
   * MANTIDO para compatibilidade com outros métodos que ainda podem usar
   */
  private static async updateReadingsInBatches(
    deviceId: string,
    whereConditions: any,
    updateData: any,
    executionId: string,
    batchSize: number = 100
  ): Promise<{ count: number }> {
    // Primeiro, contar quantas leituras serão afetadas
    console.log(`🔍 [${executionId}] DEBUG: Condições WHERE para count:`, JSON.stringify(whereConditions, null, 2));
    
    const totalReadings = await prisma.reading.count({
      where: whereConditions
    });

    console.log(`📊 [${executionId}] ${totalReadings} leituras a serem atualizadas em lotes de ${batchSize}`);

    if (totalReadings === 0) {
      return { count: 0 };
    }

    // Debug: buscar algumas leituras de exemplo para verificar
    const sampleReadings = await prisma.reading.findMany({
      where: whereConditions,
      select: { id: true, deviceId: true, readAt: true, meterId: true, deletedAt: true },
      take: 3
    });
    
    console.log(`🔍 [${executionId}] DEBUG: Primeiras 3 leituras encontradas:`, sampleReadings);

    let totalUpdated = 0;
    const totalBatches = Math.ceil(totalReadings / batchSize);

    // Processar em lotes usando offset/limit
    for (let batch = 0; batch < totalBatches; batch++) {
      const skip = batch * batchSize;
      
      console.log(`🔄 [${executionId}] Processando lote ${batch + 1}/${totalBatches} (${skip + 1}-${Math.min(skip + batchSize, totalReadings)} de ${totalReadings})`);

      // Buscar IDs do lote atual
      const batchReadings = await prisma.reading.findMany({
        where: whereConditions,
        select: { id: true },
        skip: skip,
        take: batchSize,
        orderBy: { readAt: 'asc' } // Ordenação consistente
      });

      console.log(`🔍 [${executionId}] DEBUG: Lote ${batch + 1} encontrou ${batchReadings.length} leituras para atualizar`);

      if (batchReadings.length === 0) {
        console.log(`⚠️ [${executionId}] AVISO: Lote ${batch + 1} não encontrou leituras, interrompendo`);
        break;
      }

      // Debug: log dos IDs que serão atualizados
      console.log(`🔍 [${executionId}] DEBUG: Atualizando IDs:`, batchReadings.slice(0, 3).map(r => r.id));
      console.log(`🔍 [${executionId}] DEBUG: Dados para update:`, JSON.stringify(updateData, null, 2));

      // Atualizar apenas este lote com retry
      const batchResult = await this.executeWithRetry(async () => {
        return await prisma.reading.updateMany({
          where: {
            id: { in: batchReadings.map(r => r.id) }
          },
          data: updateData
        });
      }, `Lote ${batch + 1}/${totalBatches} (${batchReadings.length} leituras)`);

      console.log(`🔍 [${executionId}] DEBUG: Lote ${batch + 1} resultado:`, { expected: batchReadings.length, actual: batchResult.count });

      totalUpdated += batchResult.count;
      
      // Pequena pausa entre lotes para dar "respiro" ao banco
      if (batch < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms entre lotes
      }
    }

    console.log(`✅ [${executionId}] Processamento em lotes concluído: ${totalUpdated} leituras atualizadas`);
    return { count: totalUpdated };
  }

  /**
   * Vincula leituras de um dispositivo a medidores por períodos específicos
   */
  static async linkReadingsToPeriods(
    userId: string,
    periods: LinkPeriod[]
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    let updatedCount = 0;

    try {
      // Verificar permissões
      const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'update');

      for (const period of periods) {
        const whereConditions: any = {
          deviceId: period.meterId, // Assumindo que o deviceId está sendo passado como meterId
          deletedAt: null,
          readAt: {
            gte: period.startDate
          }
        };

        if (period.endDate) {
          whereConditions.readAt.lte = period.endDate;
        }

        // Buscar dados desnormalizados do meter antes de atualizar
        if (!period.meterId) {
          throw new Error('MeterId é obrigatório para linkagem');
        }

        const meterData = await prisma.meter.findFirst({
          where: { id: period.meterId },
          select: {
            id: true,
            apartmentId: true,
            blockId: true,
            complexId: true,
            companyId: true
          }
        });

        if (!meterData) {
          throw new Error(`Meter ${period.meterId} não encontrado`);
        }

        // Atualizar leituras no período com campos desnormalizados
        const result = await prisma.reading.updateMany({
          where: whereConditions,
          data: {
            meterId: period.meterId,
            apartmentId: meterData.apartmentId,
            blockId: meterData.blockId,
            complexId: meterData.complexId,
            companyId: meterData.companyId,
            updatedByUserId: userId,
            updatedAt: new Date()
          }
        });

        updatedCount += result.count;
      }

      return { success: true, updatedCount };
    } catch (error) {
      console.error('Erro ao atualizar leituras:', error);
      return {
        success: false,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Busca leituras desvinculadas (sem meterId) para um dispositivo específico
   * Usa apenas Prisma para consistência e simplicidade
   */
  static async getUnlinkedReadingsForDevice(
    userId: string,
    deviceId: string,
    options: {
      take?: number;
      skip?: number;
    } = {}
  ): Promise<{
    readings: UnlinkedReading[];
    totalCount: number;
    deviceInfo: { id: string; deviceId: string; name: string | null } | null;
  }> {
    const { take = 50, skip = 0 } = options;

    try {
      // Verificar permissões
      const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');

      // Buscar dispositivo primeiro
      const device = await prisma.iotDevice.findFirst({
        where: {
          deviceId: deviceId,
          deletedAt: null
        },
        select: {
          id: true,
          deviceId: true,
          name: true
        }
      });

      if (!device) {
        return { readings: [], totalCount: 0, deviceInfo: null };
      }

      // Condições de busca para leituras desvinculadas
      const whereConditions = {
        deviceId: deviceId,
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ],
        AND: [
          {
            OR: [
              { meterId: null },
              { meterId: { isSet: false } }
            ]
          }
        ]
      };

      // Buscar leituras e contar em paralelo
      const [readings, totalCount] = await Promise.all([
        prisma.reading.findMany({
          where: whereConditions,
          select: {
            id: true,
            deviceId: true,
            readAt: true,
            readAtDate: true,
            reading: true,
            meterId: true,
            registerName: true,
            remoteId: true,
          },
          orderBy: { readAt: 'desc' },
          take,
          skip
        }),
        prisma.reading.count({ where: whereConditions })
      ]);

      return {
        readings: readings.map(reading => ({
          id: reading.id,
          deviceId: reading.deviceId || '',
          readAt: reading.readAt,
          readAtDate: reading.readAtDate,
          reading: reading.reading,
          meterId: reading.meterId,
          registerName: reading.registerName,
          remoteId: reading.remoteId,
          device: device
        })),
        totalCount,
        deviceInfo: device
      };

    } catch (error) {
      console.error('Erro ao buscar leituras desvinculadas:', error);
      return { readings: [], totalCount: 0, deviceInfo: null };
    }
  }

  /**
   * Busca todas as leituras desvinculadas do sistema
   */
  static async getAllUnlinkedReadings(
    userId: string,
    options: {
      take?: number;
      skip?: number;
      deviceId?: string;
    } = {}
  ): Promise<{
    readings: UnlinkedReading[];
    totalCount: number;
    deviceGroups: Array<{
      deviceId: string;
      deviceName: string | null;
      unlinkedCount: number;
    }>;
  }> {
    const { take = 50, skip = 0, deviceId } = options;

    try {
      // Verificar permissões
      const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');

      const baseWhere: any = {
        deletedAt: null,
        OR: [
          { meterId: null },
          { meterId: { isSet: false } }
        ]
      };

      if (deviceId) {
        baseWhere.deviceId = deviceId;
      }

      const [readings, totalCount] = await Promise.all([
        prisma.reading.findMany({
          where: baseWhere,
          include: {
            device: {
              select: {
                id: true,
                deviceId: true,
                name: true
              }
            }
          },
          orderBy: { readAt: 'desc' },
          take,
          skip
        }),
        prisma.reading.count({ where: baseWhere })
      ]);

      // Buscar resumo por dispositivo usando consulta simplificada
      const baseGroupWhere = {
        deletedAt: null,
        deviceId: { not: null }
      };

      // Para groupBy, usar apenas condições simples (groupBy não suporta isSet: false)
      const readingsGrouped = await prisma.reading.groupBy({
        by: ['deviceId'],
        where: {
          ...baseGroupWhere,
          OR: [{ meterId: null }, { meterId: { isSet: false } }] // Nota: groupBy captura apenas null explícito, não campos ausentes
        },
        _count: {
          id: true
        }
      });

      // Buscar informações dos dispositivos
      const deviceIds = readingsGrouped.map(group => group.deviceId).filter(Boolean) as string[];
      const devices = await prisma.iotDevice.findMany({
        where: {
          deviceId: { in: deviceIds },
          deletedAt: null
        },
        select: {
          deviceId: true,
          name: true
        }
      });

      const deviceMap = new Map(devices.map(d => [d.deviceId, d]));

      const deviceGroups = readingsGrouped.map(group => ({
        deviceId: group.deviceId || '',
        deviceName: deviceMap.get(group.deviceId || '')?.name || null,
        unlinkedCount: Number(group._count.id)
      })).sort((a, b) => b.unlinkedCount - a.unlinkedCount);

      return {
        readings: readings.map(reading => ({
          id: reading.id,
          deviceId: reading.deviceId || '',
          readAt: reading.readAt,
          readAtDate: reading.readAtDate,
          reading: reading.reading,
          device: reading.device || {
            id: '',
            deviceId: reading.deviceId || '',
            name: null
          }
        })),
        totalCount,
        deviceGroups
      };

    } catch (error) {
      console.error('Erro ao buscar todas as leituras desvinculadas:', error);
      return {
        readings: [],
        totalCount: 0,
        deviceGroups: []
      };
    }
  }

  /**
   * Obtém dispositivos com leituras desvinculadas
   */
  static async getDevicesWithUnlinkedReadings(userId: string): Promise<Array<{
    deviceId: string;
    deviceName: string | null;
    unlinkedCount: number;
  }>> {
    try {
      // Verificar permissões
      const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');

      // Usar groupBy para eficiência
      const result = await prisma.reading.groupBy({
        by: ['deviceId'],
        where: {
          deletedAt: null,
          deviceId: { not: null },
          OR: [
            { meterId: null },
            { meterId: { isSet: false } }
          ]
        },
        _count: {
          id: true
        }
      });

      // Buscar nomes dos dispositivos
      const deviceIds = result.map(group => group.deviceId).filter(Boolean) as string[];
      const devices = await prisma.iotDevice.findMany({
        where: {
          deviceId: { in: deviceIds },
          deletedAt: null
        },
        select: {
          deviceId: true,
          name: true
        }
      });

      const deviceMap = new Map(devices.map(d => [d.deviceId, d]));

      return result.map(group => ({
        deviceId: group.deviceId || '',
        deviceName: deviceMap.get(group.deviceId || '')?.name || null,
        unlinkedCount: Number(group._count.id)
      })).sort((a, b) => b.unlinkedCount - a.unlinkedCount);

    } catch (error) {
      console.error('Erro ao buscar dispositivos com leituras desvinculadas:', error);
      return [];
    }
  }

  /**
   * Reprocessa todas as leituras de um dispositivo baseado nos períodos de vínculos
   * Atualiza meterId e registerName conforme os períodos de vigência dos MeterDeviceLinks
   * 
   * OTIMIZAÇÃO: Agora usa FastReadingReprocessService para melhor performance
   */
  static async reprocessDeviceReadings(
    userId: string,
    deviceId: string
  ): Promise<{ success: boolean; updatedCount: number; error?: string; details?: string }> {
    const executionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`[${executionId}] INICIANDO reprocessamento RÁPIDO para dispositivo: ${deviceId}`);
    
    try {
      // Importar e usar o serviço rápido
      const { FastReadingReprocessService } = await import('./reading-fast-reprocess-service');
      
      const fastResult = await FastReadingReprocessService.fastReprocessDevices(userId, [deviceId]);
      
      console.log(`🎉 [${executionId}] Reprocessamento rápido concluído:`, {
        success: fastResult.success,
        totalUpdated: fastResult.totalUpdated,
        linkCount: fastResult.linkCount,
        errors: fastResult.errors?.length || 0
      });

      // Mapear resultado do fast service para interface compatível
      return {
        success: fastResult.success,
        updatedCount: fastResult.totalUpdated,
        error: fastResult.errors?.length ? fastResult.errors[0] : undefined,
        details: fastResult.details
      };

    } catch (error) {
      console.error('❌ Erro ao reprocessar leituras do dispositivo (fast service):', error);
      return {
        success: false,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Atualiza leituras de um dispositivo com base em períodos de links meter-device
   */
  static async updateReadingsForMeterDeviceLinks(
    userId: string,
    deviceId: string,
    linkPeriods: Array<{
      meterId: string | null;
      startDate: Date;
      endDate: Date | null;
    }>
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    let totalUpdated = 0;

    try {
      // Verificar permissões
      const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'update');

      for (const period of linkPeriods) {
        const whereConditions: any = {
          deviceId: deviceId,
          deletedAt: null,
          readAt: {
            gte: period.startDate
          }
        };

        if (period.endDate) {
          whereConditions.readAt.lte = period.endDate;
        }

        let updateData: any = {
          updatedByUserId: userId,
          updatedAt: new Date()
        };

        if (period.meterId) {
          // Vincular ao medidor - buscar dados desnormalizados
          const meterData = await prisma.meter.findFirst({
            where: { id: period.meterId },
            select: {
              id: true,
              apartmentId: true,
              blockId: true,
              complexId: true,
              companyId: true
            }
          });

          if (!meterData) {
            console.warn(`Meter ${period.meterId} não encontrado, pulando período`);
            continue;
          }

          updateData = {
            ...updateData,
            meterId: period.meterId,
            apartmentId: meterData.apartmentId,
            blockId: meterData.blockId,
            complexId: meterData.complexId,
            companyId: meterData.companyId
          };
        } else {
          // Desvincular do medidor
          updateData = {
            ...updateData,
            meterId: null,
            apartmentId: null,
            blockId: null,
            complexId: null,
            companyId: null
          };
        }

        const result = await prisma.reading.updateMany({
          where: whereConditions,
          data: updateData
        });

        totalUpdated += result.count;
      }

      return { success: true, updatedCount: totalUpdated };
    } catch (error) {
      console.error('Erro ao atualizar leituras por períodos:', error);
      return {
        success: false,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
}
