import prisma from '@/lib/prisma';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { PermissionableEntity } from '@prisma/client';

/**
 * Serviço de reprocessamento rápido baseado diretamente nos vínculos atuais.
 * Estratégia:
 * 1. Recebe lista de deviceIds
 * 2. Busca TODOS os meterDeviceLinks dos devices em UMA consulta (com dados dos meters)
 * 3. Monta array flatten de vínculos com dados desnormalizados do meter
 * 4. Executa em paralelo (Promise.allSettled) um updateMany por vínculo (período)
 * 5. Retorna estatísticas agregadas
 *
 * Observação Importante:
 * - Este método NÃO "limpa" leituras fora dos períodos. Leituras previamente vinculadas que perderam vínculo permanecerão com dados antigos.
 * - Para comportamento equivalente ao reprocessamento completo (limpa + reaplica) seria necessário um passo adicional opcional de limpeza.
 */
export class FastReadingReprocessService {
  static async fastReprocessDevices(userId: string, deviceIds: string[]) {
    if (!deviceIds.length) {
      return { success: false, deviceCount: 0, linkCount: 0, totalUpdated: 0, details: 'Nenhum deviceId informado', perLink: [] as any[] };
    }

    // Permissão (update em readings)
    await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'update');

    const startedAt = Date.now();

    // 1 & 2. Buscar vínculos + dados de meter em uma única consulta
    const links = await prisma.meterDeviceLink.findMany({
      where: {
        deviceId: { in: deviceIds },
        OR: [ { deletedAt: null }, { deletedAt: { isSet: false } } ]
      },
      include: {
        meter: {
          select: {
            id: true,
            register: true,
            apartmentId: true,
            blockId: true,
            complexId: true,
            companyId: true
          }
        }
      },
      orderBy: [ { deviceId: 'asc' }, { startDate: 'asc' } ]
    });

    if (!links.length) {
      return { success: true, deviceCount: deviceIds.length, linkCount: 0, totalUpdated: 0, details: 'Nenhum vínculo encontrado para os dispositivos informados', perLink: [] };
    }

    // 3. Montar array flatten de períodos com dados desnormalizados prontos para update
    const periods = links.map(l => ({
      id: l.id,
      deviceId: l.deviceId,
      meterId: l.meterId,
      startDate: l.startDate,
      endDate: l.endDate as Date | null | undefined,
      meter: l.meter
    }));

    // 4. Executar updates em paralelo (um por período)
    const updateStarted = Date.now();
    const updatePromises = periods.map(p => {
      const dateFilter: any = { gte: p.startDate };
      if (p.endDate) dateFilter.lte = p.endDate;

      return prisma.reading.updateMany({
        where: {
          deviceId: p.deviceId,
          OR: [ { deletedAt: null }, { deletedAt: { isSet: false } } ],
          readAt: dateFilter
        },
        data: {
          meterId: p.meterId,
          registerName: p.meter?.register || null,
          apartmentId: p.meter?.apartmentId || null,
          blockId: p.meter?.blockId || null,
          complexId: p.meter?.complexId || null,
          companyId: p.meter?.companyId || null,
          updatedByUserId: userId,
          updatedAt: new Date(),
          deletedAt: null
        }
      }).then(res => ({ status: 'fulfilled' as const, count: res.count, period: p }))
        .catch(err => ({ status: 'rejected' as const, error: err instanceof Error ? err.message : String(err), period: p }));
    });

    const settled = await Promise.all(updatePromises);

    let totalUpdated = 0;
    const perLink: Array<any> = [];
    const errors: string[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        totalUpdated += r.count;
        perLink.push({ deviceId: r.period.deviceId, meterId: r.period.meterId, startDate: r.period.startDate, endDate: r.period.endDate, updated: r.count });
      } else {
        errors.push(`Device ${r.period.deviceId} meter ${r.period.meterId}: ${r.error}`);
        perLink.push({ deviceId: r.period.deviceId, meterId: r.period.meterId, startDate: r.period.startDate, endDate: r.period.endDate, error: r.error });
      }
    }

    const durationMs = Date.now() - startedAt;
    const updateDurationMs = Date.now() - updateStarted;

    const details = `Dispositivos: ${deviceIds.length}\nVínculos processados: ${periods.length}\nLeituras atualizadas: ${totalUpdated}\nErros: ${errors.length}\nTempo total: ${durationMs}ms (updates: ${updateDurationMs}ms)`;

    return { success: errors.length === 0, deviceCount: deviceIds.length, linkCount: periods.length, totalUpdated, details, perLink, errors };
  }
  static async reprocessLinkReadings(userId: string, meterDeviceLinks: string[]) {
    if (!meterDeviceLinks || meterDeviceLinks.length === 0) {
      throw new Error('Nenhum vínculo de medidor fornecido para reprocessamento.');
    }

    // 1. Valida links
    if (meterDeviceLinks.find(link => typeof link !== 'string' || link.trim() === '')) {
      throw new Error('Nenhum vínculo de medidor válido fornecido para reprocessamento.');
    }

    const validLinks = await prisma.meterDeviceLink.findMany({
      where: {
        id: { in: meterDeviceLinks }
      }
    });
    console.warn('🔍 Links Encontrados:');
    for (const link of validLinks) {
      console.warn(`- ${link.id} | ${link.deviceId} | ${link.meterId} | ${link.startDate} | ${link.endDate}`);
    }

    if (validLinks.length === 0) {
      throw new Error('Nenhum vínculo de medidor válido encontrado para reprocessamento.');
    }
    if (validLinks.length !== meterDeviceLinks.length) {
      const invalidLinks = meterDeviceLinks.filter(link => !validLinks.find(v => v.id === link));
      throw new Error(`Alguns vínculos de medidor fornecidos não são válidos: ${invalidLinks.join(', ')}`);
    }

    // 2. Coleta informações dos meters para atualizar as leituras
    const meterIds = Array.from(new Set(validLinks.map(link => link.meterId)));
    const meters = await prisma.meter.findMany({
      where: {
        id: { in: meterIds }
      }
    });

    console.log('✅ Medidores Encontrados:');
    for (const meter of meters) {
      console.log(`- ${meter.id} | ${meter.register} | ${meter.apartmentId} | ${meter.blockId} | ${meter.complexId} | ${meter.companyId}`);
    }

    if (meters.length === 0) {
      throw new Error('Nenhum medidor válido encontrado para reprocessamento.');
    }
    if (meters.length !== meterIds.length) {
      const invalidMeters = meterIds.filter(id => !meters.find(m => m.id === id));
      throw new Error(`Alguns medidores fornecidos não são válidos: ${invalidMeters.join(', ')}`);
    }

    // 3. Atualiza as leituras, por link, com as informações coletadas
    try {
      const updatePromises = validLinks.map(link => {
        const meter = meters.find(m => m.id === link.meterId);
        if (!meter) {
          throw new Error(`Medidor não encontrado para o link: ${link.id}`);
        }

        const dateFilter: any = { gt: link.startDate };
        if (link.endDate) dateFilter.lt = link.endDate;

        return prisma.reading.updateMany({
          where: {
            deviceId: link.deviceId,
            readAt: dateFilter
          },
          data: {
            meterId: meter.id,
            registerName: meter.register || null,
            apartmentId: meter.apartmentId || null,
            blockId: meter.blockId || null,
            complexId: meter.complexId || null,
            companyId: meter.companyId || null,
            updatedByUserId: userId,
            updatedAt: new Date(),
            deletedAt: null
          }
        });
      });

      console.time(`⏲️ Reprocessamento de leituras (${validLinks.length} links)`);
      const result = await Promise.all(updatePromises);
      console.timeEnd(`⏲️ Reprocessamento de leituras (${validLinks.length} links)`);
      return {
        success: true,
        message: 'Leituras atualizadas com sucesso.',
        data: result
      };
    } catch (error) {
      console.error('Error updating readings:', error);
      throw new Error('Erro ao atualizar as leituras.');
    }

  }
}

export default FastReadingReprocessService;
