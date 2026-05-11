import prisma from '@/lib/prisma';
import { PermissionableEntity } from '@prisma/client';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { buildOrConditions } from '@/lib/utils';
import { ReadingLinkService } from './reading-link-service';

// 🔥 CACHE PARA PERFORMANCE - TTL de 30 segundos
interface CacheEntry {
    data: Map<string, number>;
    timestamp: number;
    ttl: number;
}

const readingsCountCache = new Map<string, CacheEntry>();

export interface UnlinkedReading {
    id: string;
    reading: number;
    readAt: Date;
    readAtDate: string;
    deviceId: string;
    remoteId: string;
    deviceName?: string;
    device?: {
        id: string;
        deviceId: string;
        remoteId: string;
        name?: string;
    };
}

export interface DeviceWithStatus {
    id: string;
    deviceId: string;
    remoteId: string;
    name?: string;
    lastReading?: number;
    lastSeen?: number;
    lastSeenDate?: string;
    hasActiveLink: boolean;
    currentMeter?: {
        id: string;
        register: string;
        apartment?: {
            id: string;
            name: string;
            block?: {
                id: string;
                name: string;
                complex?: {
                    id: string;
                    socialName: string;
                    companyId?: string | null;
                };
            };
        };
        blockId?: string | null;
        complexId?: string | null;
        companyId?: string | null;
    };
    meter?: {
        id: string;
        register: string;
        apartment?: {
            id: string;
            name: string;
            block?: {
                id: string;
                name: string;
                complex?: {
                    id: string;
                    socialName: string;
                    companyId?: string | null;
                };
            };
        };
        blockId?: string | null;
        complexId?: string | null;
        companyId?: string | null;
    };
    readingsCount: number;
    unlinkedReadingsCount: number;
    pilotMode?: boolean;
    lastReadingSource?: string | null;
    lastReadingAt?: string | null;
}

export interface CreateMeterDeviceLinkData {
    meterId: string;
    deviceId: string;
    startDate: Date;
    endDate?: Date;
}

export class DeviceManagementService {

    /**
     * Busca leituras sem link com medidor
     */
    static async findUnlinkedReadings(
        userId: string,
        options: {
            deviceId?: string;
            remoteId?: string;
            dateFrom?: Date;
            dateTo?: Date;
            take?: number;
            skip?: number;
        } = {}
    ): Promise<{ readings: UnlinkedReading[]; total: number }> {

        const { deviceId, remoteId, dateFrom, dateTo, take = 50, skip = 0 } = options;

        // Verificar permissões
        const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');
        const hasSystemPermission = !!contexts.system;

        const whereConditions: any = {
            meterId: null, // Leituras sem medidor vinculado
            isManualReading: false, // Apenas leituras IoT
            deletedAt: null,
        };

        // Filtros opcionais
        if (deviceId) {
            whereConditions.device = {
                deviceId: { contains: deviceId, mode: 'insensitive' }
            };
        }

        if (remoteId) {
            whereConditions.remoteId = { contains: remoteId, mode: 'insensitive' };
        }

        if (dateFrom || dateTo) {
            whereConditions.readAt = {};
            if (dateFrom) whereConditions.readAt.gte = dateFrom;
            if (dateTo) whereConditions.readAt.lte = dateTo;
        }

        // TODO: Aplicar filtros de contexto se necessário
        // Por enquanto, assumindo que leituras IoT não têm restrições de contexto diretas

        const [readings, total] = await Promise.all([
            prisma.reading.findMany({
                where: whereConditions,
                include: {
                    device: {
                        select: {
                            id: true,
                            deviceId: true,
                            remoteId: true,
                            name: true,
                        }
                    }
                },
                orderBy: { readAt: 'desc' },
                take,
                skip,
            }),
            prisma.reading.count({ where: whereConditions })
        ]);

        const processedReadings: UnlinkedReading[] = readings.map(reading => ({
            id: reading.id,
            reading: reading.reading || 0,
            readAt: reading.readAt,
            readAtDate: reading.readAtDate,
            deviceId: reading.deviceId || '',
            remoteId: reading.remoteId || '',
            deviceName: reading.deviceName || undefined,
            device: reading.device ? {
                id: reading.device.id,
                deviceId: reading.device.deviceId,
                remoteId: reading.device.remoteId,
                name: reading.device.name || undefined,
            } : undefined
        }));

        return {
            readings: processedReadings,
            total
        };
    }

    /**
     * Busca devices com informações de status
     */
    static async findDevicesWithStatus(
        userId: string,
        options: {
            deviceId?: string;
            remoteId?: string;
            hasActiveLink?: boolean;
            hasUnlinkedReadings?: boolean;
            hasNoReadings?: boolean;
            pilotMode?: boolean;
            take?: number;
            skip?: number;
        } = {}
    ): Promise<{ devices: DeviceWithStatus[]; total: number }> {

        const { deviceId, remoteId, hasActiveLink, hasUnlinkedReadings, hasNoReadings, pilotMode, take = 50, skip = 0 } = options;

        // Verificar permissões
        const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.iotDevice, 'read');
        const hasSystemPermission = !!contexts.system;

        const whereConditions: any = {
            deletedAt: null,
        };

        // Filtros opcionais
        if (deviceId) {
            whereConditions.deviceId = { contains: deviceId, mode: 'insensitive' };
        }

        if (remoteId) {
            whereConditions.remoteId = { contains: remoteId, mode: 'insensitive' };
        }

        if (pilotMode !== undefined) {
            whereConditions.pilotMode = pilotMode;
        }

        // Filtro para dispositivos com leituras desvinculadas
        if (hasUnlinkedReadings !== undefined) {
            if (hasUnlinkedReadings) {
                // Apenas dispositivos que têm leituras sem meterId
                whereConditions.Readings = {
                    some: {
                        AND: [
                            {
                                OR: [
                                    { deletedAt: null },
                                    { deletedAt: { isSet: false } }
                                ]
                            },
                            {
                                OR: [
                                    { meterId: null },
                                    { meterId: { isSet: false } }
                                ]
                            }
                        ],
                    }
                };
            } else {
                // Apenas dispositivos que não têm leituras sem meterId
                whereConditions.Readings = {
                    none: {
                        deletedAt: null,
                        OR: [
                            { meterId: null },
                            { meterId: { isSet: false } }
                        ]
                    }
                };
            }
        }

        if (hasNoReadings !== undefined) {
            if (hasNoReadings) {
                whereConditions.Readings = {
                    none: {
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
                    }
                };
            } else {
                whereConditions.Readings = {
                    some: {
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
                    }
                };
            }
        }

        // 🔥 FIX: Adicionar filtro hasActiveLink na query do MongoDB
        if (hasActiveLink !== undefined) {
            if (hasActiveLink) {
                // Apenas dispositivos que têm vínculos ativos
                whereConditions.meterDeviceLinks = {
                    some: {
                        AND: [
                            { OR: [ { deletedAt: null }, { deletedAt: { isSet: false } } ] },
                            { OR: [ { endDate: null }, { endDate: { gte: new Date() } }, { endDate: { isSet: false } } ] }
                        ]
                    }
                };
            } else {
                // Apenas dispositivos que NÃO têm vínculos ativos
                whereConditions.meterDeviceLinks = {
                    none: {
                        AND: [
                            { OR: [ { deletedAt: null }, { deletedAt: { isSet: false } } ] },
                            { OR: [ { endDate: null }, { endDate: { gte: new Date() } }, { endDate: { isSet: false } } ] }
                        ]
                    }
                };
            }
        }

        console.log('🔍 Buscando devices com whereConditions:', JSON.stringify(whereConditions, null, 2));

        const [devices, total] = await Promise.all([
            prisma.iotDevice.findMany({
                where: whereConditions,
                include: {
                    meterDeviceLinks: {
                        where: {
                            AND: [
                                { OR: [ { deletedAt: null }, { deletedAt: { isSet: false } } ] },
                                { OR: [ { endDate: null }, { endDate: { gte: new Date() } }, { endDate: { isSet: false } } ] }
                            ]
                        },
                        include: {
                            meter: {
                                include: {
                                    apartment: {
                                        include: {
                                            block: {
                                                include: {
                                                    complex: {
                                                        select: {
                                                            id: true,
                                                            socialName: true,
                                                            companyId: true,
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    Readings: {
                        where: {
                            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
                        },
                        orderBy: { readAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            reading: true,
                            source: true,
                            readAt: true,
                            readAtDate: true,
                        }
                    },
                    _count: {
                        select: {
                            Readings: true
                        }
                    }
                },
                orderBy: { lastSeen: 'desc' },
                take,
                skip,
            }),
            prisma.iotDevice.count({ where: whereConditions })
        ]);

        console.log(`📊 Encontrados ${devices.length} devices, primeiro device:`, {
            deviceId: devices[0]?.deviceId,
            name: devices[0]?.name,
            meterDeviceLinksCount: devices[0]?.meterDeviceLinks?.length || 0,
            firstLink: devices[0]?.meterDeviceLinks?.[0] ? {
                id: devices[0].meterDeviceLinks[0].id,
                meterId: devices[0].meterDeviceLinks[0].meterId,
                startDate: devices[0].meterDeviceLinks[0].startDate,
                endDate: devices[0].meterDeviceLinks[0].endDate
            } : null
        });

        // 🔥 OTIMIZAÇÃO CRÍTICA: Buscar contagem de leituras não vinculadas com aggregation pipeline
        // Substituindo N+1 queries por uma única aggregation
        const deviceIds = devices.map(d => d.deviceId);
        const unlinkedCountsMap = await this.getUnlinkedReadingsCountsBulk(deviceIds);

        const devicesWithStatus: DeviceWithStatus[] = devices.map(device => {
            console.log(`🔍 Processando device ${device.deviceId}:`, {
                meterDeviceLinksCount: device.meterDeviceLinks.length,
                links: device.meterDeviceLinks.map(link => ({
                    id: link.id,
                    startDate: link.startDate,
                    endDate: link.endDate,
                    isActive: link.endDate === null || link.endDate >= new Date()
                }))
            });

            const activeLink = device.meterDeviceLinks.find(link =>
                link.endDate === null || link.endDate >= new Date()
            );

            console.log(`🎯 Device ${device.deviceId} activeLink:`, activeLink ? {
                id: activeLink.id,
                startDate: activeLink.startDate,
                endDate: activeLink.endDate,
                meterRegister: activeLink.meter.register,
                apartmentName: activeLink.meter.apartment?.name
            } : 'Nenhum link ativo');

            const meterData = activeLink ? {
                id: activeLink.meter.id,
                register: activeLink.meter.register,
                apartment: activeLink.meter.apartment ? {
                    id: activeLink.meter.apartment.id,
                    name: activeLink.meter.apartment.name,
                    block: activeLink.meter.apartment.block ? {
                        id: activeLink.meter.apartment.block.id,
                        name: activeLink.meter.apartment.block.name,
                        complex: activeLink.meter.apartment.block.complex ? {
                            id: activeLink.meter.apartment.block.complex.id,
                            socialName: activeLink.meter.apartment.block.complex.socialName,
                            companyId: activeLink.meter.apartment.block.complex.companyId,
                        } : undefined
                    } : undefined
                } : undefined,
                blockId: activeLink.meter.blockId || activeLink.meter.apartment?.blockId || null,
                complexId: activeLink.meter.complexId || activeLink.meter.apartment?.block?.complexId || null,
                companyId:
                    activeLink.meter.companyId ||
                    activeLink.meter.apartment?.companyId ||
                    activeLink.meter.apartment?.block?.companyId ||
                    activeLink.meter.apartment?.block?.complex?.companyId ||
                    null
            } : undefined;

            const lastReading = device.Readings?.[0];

            return {
                id: device.id,
                deviceId: device.deviceId,
                remoteId: device.remoteId,
                name: device.name || undefined,
                lastReading: device.lastReading || undefined,
                lastSeen: device.lastSeen || undefined,
                lastSeenDate: device.lastSeenDate || undefined,
                hasActiveLink: !!activeLink,
                currentMeter: meterData,
                meter: meterData, // Para compatibilidade com DeviceFull
                readingsCount: device._count.Readings,
                unlinkedReadingsCount: unlinkedCountsMap.get(device.deviceId) || 0,
                pilotMode: device.pilotMode,
                lastReadingSource: lastReading?.source || null,
                lastReadingAt: lastReading?.readAtDate || lastReading?.readAt?.toISOString() || null,
            };
        });

        // 🔥 FIX: Remover filtragem pós-query já que foi movida para a query do MongoDB
        // Agora a filtragem é feita diretamente no banco, garantindo contagem e paginação corretas
        return {
            devices: devicesWithStatus,
            total: total
        };
    }

    /**
     * Cria um novo link meter-device
     */
    static async createMeterDeviceLink(
        userId: string,
        data: CreateMeterDeviceLinkData
    ): Promise<{ success: boolean; error?: string; linkId?: string }> {

        try {
            // Verificar permissões
            const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.meterDeviceLink, 'create');
            const hasSystemPermission = !!contexts.system;

            // Verificar se o meter existe e se o usuário tem permissão
            const meter = await prisma.meter.findFirst({
                where: {
                    id: data.meterId,
                    deletedAt: null,
                    ...(hasSystemPermission ? {} : {
                        OR: buildOrConditions(contexts, hasSystemPermission)
                    })
                }
            });

            if (!meter) {
                return { success: false, error: 'Medidor não encontrado ou sem permissão' };
            }

            // Verificar se o device existe
            const device = await prisma.iotDevice.findFirst({
                where: {
                    deviceId: data.deviceId,
                    deletedAt: null
                }
            });

            if (!device) {
                return { success: false, error: 'Dispositivo não encontrado' };
            }

            // Verificar se já existe um link ativo para este período
            const existingLink = await prisma.meterDeviceLink.findFirst({
                where: {
                    meterId: data.meterId,
                    deviceId: data.deviceId,
                    startDate: { lte: data.endDate || new Date('2099-12-31') },
                    AND: [
                        {
                            OR: [
                                { deletedAt: null },
                                { deletedAt: { isSet: false } }
                            ]

                        },
                        {
                            OR: [
                                { endDate: null },
                                { endDate: { gte: data.startDate } },
                                { endDate: { isSet: false } }
                            ]
                        }
                    ]
                }
            });

            if (existingLink) {
                return {
                    success: false,
                    error: 'Já existe um link ativo para este medidor e dispositivo no período especificado'
                };
            }

            // Criar o link
            const newLink = await prisma.meterDeviceLink.create({
                data: {
                    meterId: data.meterId,
                    deviceId: data.deviceId,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    deletedAt: null,
                    createdByUserId: userId
                }
            });

            // Atualizar leituras usando o ReadingLinkService
            await ReadingLinkService.updateReadingsForMeterDeviceLinks(userId, data.deviceId, [{
                startDate: data.startDate,
                endDate: data.endDate || null,
                meterId: data.meterId
            }]);

            return { success: true, linkId: newLink.id };
        } catch (error) {
            console.error('Erro ao criar link meter-device:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido'
            };
        }
    }

    /**
     * Remove um link meter-device (soft delete)
     */
    static async removeMeterDeviceLink(
        userId: string,
        linkId: string
    ): Promise<{ success: boolean; error?: string }> {

        try {
            // Verificar permissões
            const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.meterDeviceLink, 'delete');
            const hasSystemPermission = !!contexts.system;

            // Buscar o link
            const link = await prisma.meterDeviceLink.findFirst({
                where: {
                    id: linkId,
                    OR: [
                        { deletedAt: null },
                        { deletedAt: { isSet: false } }
                    ]
                },
                include: {
                    meter: true
                }
            });

            if (!link) {
                return { success: false, error: 'Link não encontrado' };
            }

            // Verificar permissão no meter
            if (!hasSystemPermission) {
                const hasPermission = await prisma.meter.findFirst({
                    where: {
                        id: link.meterId,
                        deletedAt: null,
                        OR: buildOrConditions(contexts, hasSystemPermission)
                    }
                });

                if (!hasPermission) {
                    return { success: false, error: 'Sem permissão para remover este link' };
                }
            }

            // Remover o link (soft delete)
            await prisma.meterDeviceLink.update({
                where: { id: linkId },
                data: {
                    deletedAt: new Date(),
                    updatedByUserId: userId
                }
            });

            // Desvincula leituras usando o ReadingLinkService
            await ReadingLinkService.updateReadingsForMeterDeviceLinks(userId, link.deviceId, [{
                startDate: link.startDate,
                endDate: link.endDate,
                meterId: null // Remove o meterId
            }]);

            return { success: true };

        } catch (error) {
            console.error('Erro ao remover link meter-device:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido'
            };
        }
    }

    /**
     * 🔥 OTIMIZAÇÃO CRÍTICA: Busca contagens de leituras desvinculadas usando aggregation pipeline
     * Substitui N queries individuais por uma única aggregation otimizada + cache
     */
    private static async getUnlinkedReadingsCountsBulk(deviceIds: string[]): Promise<Map<string, number>> {
        try {
            // 🔥 VERIFICAR CACHE PRIMEIRO
            const cacheKey = deviceIds.sort().join(',');
            const cached = readingsCountCache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < cached.ttl) {
                console.log('⚡ Cache hit para contagens de leituras');
                return cached.data;
            }

            // Usando aggregation pipeline do MongoDB para performance máxima
            const pipeline = [
                {
                    $match: {
                        deviceId: { $in: deviceIds },
                        deletedAt: null,
                        $or: [
                            { meterId: null },
                            { meterId: { $exists: false } }
                        ]
                    }
                },
                {
                    $group: {
                        _id: "$deviceId",
                        unlinkedCount: { $sum: 1 }
                    }
                }
            ];

            console.log('🚀 Executando aggregation pipeline para contagens:', { deviceIds: deviceIds.length });
            const startTime = Date.now();

            // Usando aggregateRaw para performance máxima no MongoDB
            const rawResults = await prisma.reading.aggregateRaw({
                pipeline
            });
            
            const results = rawResults as unknown as Array<{ _id: string; unlinkedCount: number }>;

            const endTime = Date.now();
            console.log(`⚡ Aggregation concluída em ${endTime - startTime}ms para ${deviceIds.length} devices`);

            // Converter resultado para Map
            const countsMap = new Map<string, number>();
            results.forEach(result => {
                countsMap.set(result._id, result.unlinkedCount);
            });

            // Garantir que todos os deviceIds tenham uma entrada (mesmo que seja 0)
            deviceIds.forEach(deviceId => {
                if (!countsMap.has(deviceId)) {
                    countsMap.set(deviceId, 0);
                }
            });

            // 🔥 ARMAZENAR NO CACHE
            readingsCountCache.set(cacheKey, {
                data: countsMap,
                timestamp: Date.now(),
                ttl: 30000 // 30 segundos
            });

            return countsMap;

        } catch (error) {
            console.error('❌ Erro na aggregation pipeline, fallback para queries individuais:', error);
            
            // Fallback para o método original em caso de erro
            const unlinkedCountsPromises = deviceIds.map(async (deviceId) => {
                const count = await prisma.reading.count({
                    where: {
                        deviceId: deviceId,
                        deletedAt: null,
                        OR: [
                            { meterId: null },
                            { meterId: { isSet: false } }
                        ]
                    }
                });
                return [deviceId, count] as const;
            });

            const unlinkedCountsResults = await Promise.all(unlinkedCountsPromises);
            return new Map(unlinkedCountsResults);
        }
    }
}
