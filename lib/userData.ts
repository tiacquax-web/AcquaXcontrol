import prisma from '@/lib/prisma';
import { ContextType, PermissionableEntity, Prisma } from '@prisma/client';
import { getUserContexts, getUserContextsForActionOnEntity, getUserContextsForEntity } from '@/lib/userContexts';
import { cleanWhere } from './utils';

// MongoDB-safe "not deleted" filter — matches records where deletedAt is null
// OR where the field was never set (absent in older MongoDB documents).
const notDeleted = {
    OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
    ],
} as const;

// Função para normalizar email removendo acentos e caracteres especiais
function normalizeEmail(email: string): string {
    // Mapa de caracteres acentuados para normais
    const accentMap: { [key: string]: string } = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n',
        'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
        'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
        'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
        'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
        'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
        'Ç': 'C', 'Ñ': 'N'
    };

    let normalized = email;

    // Substituir acentos
    for (const [accented, normal] of Object.entries(accentMap)) {
        normalized = normalized.replace(new RegExp(accented, 'g'), normal);
    }

    // Remover caracteres especiais não permitidos em emails (manter apenas letras, números, @, ., -, _)
    normalized = normalized.replace(/[^a-zA-Z0-9@.\-_]/g, '');

    // Converter para lowercase
    normalized = normalized.toLowerCase();

    return normalized;
}

// Getters
async function getUserData(userId: string) {
    const { apartmentIds, blockIds, complexIds } = await getUserContexts(userId);

    if (apartmentIds.length === 0 && blockIds.length === 0 && complexIds.length === 0) return [];

    return await prisma.apartment.findMany({
        where: {
            OR: [
                { id: { in: apartmentIds } }, // Apartamentos diretos
                { blockId: { in: blockIds } }, // Apartamentos dentro dos blocos do usuário
                { block: { complexId: { in: complexIds } } }, // Apartamentos dentro dos condomínios do usuário
            ],
        },
        include: {
            meters: {
                include: {
                    Readings: true,
                    meterDeviceLinks: {
                        where: { deletedAt: null },
                        include: {
                            device: {
                                include: {
                                    Readings: true,
                                }
                            }
                        }
                    }
                },
            },
        },
    });
}

async function getEntityData(userId: string, entityType: PermissionableEntity, entityId: string) {

    const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'read');
    const hasSystemPermission = !!contexts.system;

    switch (entityType) {
        // Places (Contexts)
        case PermissionableEntity.company:
            return await prisma.company.findUnique(
                {
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.companyIds } }, // Empresas do usuário
                        ]
                    }
                }
            );
        case PermissionableEntity.complex:
            return await prisma.complex.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { id: { in: contexts.complexIds } }, // Condomínios diretos
                        { companyId: { in: contexts.companyIds } }, // Condomínios das empresas do usuário
                    ]
                }
            });
        case PermissionableEntity.block:
            return await prisma.block.findUnique(
                {
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.blockIds } }, // Blocos diretos
                            { complexId: { in: contexts.complexIds } }, // Blocos dentro dos condomínios do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Blocos dentro dos condomínios da empresa do usuário
                        ]
                    }
                }
            );
        case PermissionableEntity.apartment:
            return await prisma.apartment.findUnique(
                {
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                            { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                            { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    }
                }
            );

        // Meters and Devices
        case PermissionableEntity.meter:
            return await prisma.meter.findUnique({
                where: {
                    id: entityId,
                    apartment: {
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                            { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                            { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    }
                }
            });
        case PermissionableEntity.typeMeter:
            return await prisma.typeMeter.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { meters: { some: { apartmentId: { in: contexts.apartmentIds } } } }, // Apartamentos diretos (desnormalizado)
                        { meters: { some: { blockId: { in: contexts.blockIds } } } }, // Blocos do usuário (desnormalizado)
                        { meters: { some: { complexId: { in: contexts.complexIds } } } }, // Condomínios do usuário (desnormalizado)
                        { meters: { some: { companyId: { in: contexts.companyIds } } } }, // Empresas do usuário (desnormalizado)
                    ]
                }
            });
        case PermissionableEntity.iotDevice:
            return await prisma.iotDevice.findUnique({
                where: {
                    id: entityId,
                    meterDeviceLinks: {
                        some: {
                            meter: {
                                OR: hasSystemPermission ? undefined : [
                                    { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                                    { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado) 
                                    { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                                    { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                                ]
                            }
                        }
                    }
                }
            });

        // Dealerships
        case PermissionableEntity.dealership:
            if (!hasSystemPermission) return null;
            return await prisma.dealership.findUnique({
                where: {
                    id: entityId
                }
            });

        // Readings and Reports
        case PermissionableEntity.reading:
            return await prisma.reading.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos
                        { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                        { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                        { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                    ]
                }
            });
        case PermissionableEntity.dealershipReading:
            return await prisma.dealershipReading.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { complexId: { in: contexts.complexIds } }, // Apartamentos diretos
                        { complex: { companyId: { in: contexts.companyIds } } }, // Apartamentos dentro dos blocos do usuário
                    ]
                }
            });
        case PermissionableEntity.apartmentConsumptionReport:
            return await prisma.apartmentConsumptionReport.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                        { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                        { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado) 
                        { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                    ]
                }
            });

        // Reservoirs
        case PermissionableEntity.reservoir:
            return await prisma.reservoir.findUnique({
                where: {
                    id: entityId,
                    OR: hasSystemPermission ? undefined : [
                        { companyId: { in: contexts.companyIds } }, // Reservatórios da empresa do usuário
                        { complexId: { in: contexts.complexIds } }, // Reservatórios do condomínio do usuário
                        { complex: { companyId: { in: contexts.companyIds } } }, // Reservatórios de condomínios das empresas do usuário
                    ]
                }
            });

        case PermissionableEntity.reservoirReading:
            return await prisma.reservoirReading.findUnique({
                where: {
                    id: entityId,
                    reservoir: hasSystemPermission ? undefined : {
                        OR: [
                            { companyId: { in: contexts.companyIds } },
                            { complexId: { in: contexts.complexIds } },
                            { complex: { companyId: { in: contexts.companyIds } } },
                        ]
                    }
                }
            });

        // Users and Roles
        case PermissionableEntity.user:
            // Verificar se o usuário tem permissão para ler usuários em qualquer contexto
            const hasUserPermission = contexts.system || 
                                     contexts.companyIds.length > 0 || 
                                     contexts.complexIds.length > 0 || 
                                     contexts.blockIds.length > 0 || 
                                     contexts.apartmentIds.length > 0;
            
            if (!hasUserPermission) return null;
            
            return await prisma.user.findUnique({
                where: {
                    id: entityId
                }
            });
        case PermissionableEntity.role:
            if (!hasSystemPermission) return null;
            return await prisma.role.findUnique({
                where: {
                    id: entityId
                }
            });
        case PermissionableEntity.roleAssignment:
            if (!hasSystemPermission) return null;
            return await prisma.roleAssignment.findUnique({
                where: {
                    id: entityId
                }
            });
        case PermissionableEntity.permission:
            if (!hasSystemPermission) return null;
            return await prisma.permission.findUnique({
                where: {
                    id: entityId
                }
            });

        default:
            return null;
    }
}

async function getEntityListData(userId: string, entityType: PermissionableEntity, contextType?: ContextType, contextId?: string, search?: string, where?: any, take: number = 10, include: any = {}, skip: number = 0, orderBy: string = 'id', orderDirection: 'asc' | 'desc' = 'desc'): Promise<{ entity: any[] | null, error: string | null, status: number, totalCount?: number }> {
    // console.log("########## getEntityListData ##########")
    // console.log({ userId, entityType, contextType, contextId, search, where, take, skip, include })
    try {
        const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'read');
        const hasSystemPermission = !!contexts.system;
        const extraWhere = where ?? {};

        switch (entityType) {
            // Places (Contexts)
            case PermissionableEntity.company:
                const companies = await prisma.company.findMany({
                    where: {
                        AND: [
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,

                                // Filtro do contexto BUSCADO
                                id: contextType === ContextType.company ? contextId : undefined,

                                // Filtro do contexto do USUÁRIO
                                OR: hasSystemPermission ? undefined : [
                                    { id: { in: contexts.companyIds } }, // Empresas do usuário
                                ]
                            },
                            extraWhere,
                        ]
                    },
                    take: take < 200 ? take : 200,
                });
                return { entity: companies, error: null, status: 200 };
            case PermissionableEntity.complex: {
                const complexWhereOr = hasSystemPermission ? undefined : [
                    ...(contexts.complexIds.length > 0 ? [{ id: { in: contexts.complexIds } }] : []),
                    ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
                ];
                const complexesQuery = {
                    where: cleanWhere({
                        AND: [
                            notDeleted,
                            {
                                socialName: search ? { contains: search, mode: "insensitive" } : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,
                                OR: complexWhereOr && complexWhereOr.length > 0 ? complexWhereOr : undefined,
                            },
                            extraWhere,
                        ]
                    }),
                    include: include ? include : undefined,
                    take: take < 200 ? take : 200,
                    skip: skip ? skip : 0,
                };
                const complexes = await prisma.complex.findMany(complexesQuery);
                const complexesCount = await prisma.complex.count({ where: complexesQuery.where });
                return { entity: complexes, totalCount: complexesCount, error: null, status: 200 };
            }
            case PermissionableEntity.block: {
                const blockWhereOr = hasSystemPermission ? undefined : [
                    ...(contexts.blockIds.length > 0 ? [{ id: { in: contexts.blockIds } }] : []),
                    ...(contexts.complexIds.length > 0 ? [{ complexId: { in: contexts.complexIds } }] : []),
                    ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
                ];
                const blocksQuery = {
                    where: cleanWhere({
                        AND: [
                            notDeleted,
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,
                                complexId: contextType === ContextType.complex ? contextId : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,
                                OR: blockWhereOr && blockWhereOr.length > 0 ? blockWhereOr : undefined,
                            },
                            extraWhere,
                        ]
                    }),
                    include: include ? include : undefined,
                    take: take < 200 ? take : 200,
                };
                const blocks = await prisma.block.findMany(blocksQuery);
                const blocksCount = await prisma.block.count({ where: blocksQuery.where });
                return { entity: blocks, totalCount: blocksCount, error: null, status: 200 };
            }
            case PermissionableEntity.apartment: {
                const aptWhereOr = hasSystemPermission ? undefined : [
                    ...(contexts.apartmentIds.length > 0 ? [{ id: { in: contexts.apartmentIds } }] : []),
                    ...(contexts.blockIds.length > 0 ? [{ blockId: { in: contexts.blockIds } }] : []),
                    ...(contexts.complexIds.length > 0 ? [{ complexId: { in: contexts.complexIds } }] : []),
                    ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
                ];
                const apartmentsQuery = {
                    where: cleanWhere({
                        AND: [
                            notDeleted,
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,
                                id: contextType === ContextType.apartment ? contextId : undefined,
                                blockId: contextType === ContextType.block ? contextId : undefined,
                                complexId: contextType === ContextType.complex ? contextId : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,
                                OR: aptWhereOr && aptWhereOr.length > 0 ? aptWhereOr : undefined,
                            },
                            extraWhere,
                        ]
                    }),
                    include: include ? include : undefined,
                    take: take < 2000 ? take : 2000,
                    orderBy: orderBy ? { [orderBy]: orderDirection } : undefined,
                };
                const apartments = await prisma.apartment.findMany(apartmentsQuery);
                const apartmentsCount = await prisma.apartment.count({ where: apartmentsQuery.where });
                return { entity: apartments, totalCount: apartmentsCount, error: null, status: 200 };
            }

            // Meters and Devices
            case PermissionableEntity.meter:
                console.log('########## getEntityListData - meter ##########')
                const meterWhereOr = hasSystemPermission ? undefined : [
                    ...(contexts.apartmentIds.length > 0 ? [{ apartmentId: { in: contexts.apartmentIds } }] : []),
                    ...(contexts.blockIds.length > 0 ? [{ blockId: { in: contexts.blockIds } }] : []),
                    ...(contexts.complexIds.length > 0 ? [{ complexId: { in: contexts.complexIds } }] : []),
                    ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
                ];
                const meterQuery = {
                    where: cleanWhere({
                        AND: [
                            notDeleted,
                            {
                                register: search ? { contains: search.toUpperCase() } : undefined,
                                apartmentId: contextType === ContextType.apartment ? contextId : undefined,
                                blockId: contextType === ContextType.block ? contextId : undefined,
                                complexId: contextType === ContextType.complex ? contextId : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,
                                OR: meterWhereOr && meterWhereOr.length > 0 ? meterWhereOr : undefined,
                            }
                        ]
                    }),
                };
                const meters = await prisma.meter.findMany({
                    ...meterQuery,
                    include: include && Object.keys(include).length > 0 ? include : undefined,
                    take: take < 200 ? take : 200,
                    skip: skip ? skip : 0,
                    orderBy: { [orderBy]: orderDirection },
                });
                const metersCount = await prisma.meter.count({ where: meterQuery.where });
                return { entity: meters, totalCount: metersCount, error: null, status: 200 };
            case PermissionableEntity.typeMeter:
                const typeMeters = await prisma.typeMeter.findMany({
                    where: cleanWhere({
                        AND: [
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,
                            },
                            extraWhere,
                        ]
                    }),
                    take: take < 200 ? take : 200,
                });
                return { entity: typeMeters, error: null, status: 200 };
            case PermissionableEntity.iotDevice:
                const iotDevices = await prisma.iotDevice.findMany({
                    where: {
                        AND: [
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,
                            },
                            {
                                // Filtro do contexto BUSCADO (usando campos desnormalizados dos meters)
                                meters: {
                                    some: {
                                        OR: [
                                            { apartmentId: contextType === ContextType.apartment ? contextId : undefined },
                                            { blockId: contextType === ContextType.block ? contextId : undefined },
                                            { complexId: contextType === ContextType.complex ? contextId : undefined },
                                            { companyId: contextType === ContextType.company ? contextId : undefined },
                                        ]
                                    }
                                }
                            },
                            {
                                // Filtro do contexto do USUÁRIO (usando campos desnormalizados dos meters)
                                OR: hasSystemPermission ? undefined : [
                                    { meters: { some: { deletedAt: { OR: [{ equal: null }, { isSet: false },] }, apartmentId: { in: contexts.apartmentIds } } } }, // Apartamentos diretos
                                    { meters: { some: { deletedAt: { OR: [{ equal: null }, { isSet: false },] }, blockId: { in: contexts.blockIds } } } }, // Blocos do usuário (desnormalizado)
                                    { meters: { some: { deletedAt: { OR: [{ equal: null }, { isSet: false },] }, complexId: { in: contexts.complexIds } } } }, // Condomínios do usuário (desnormalizado)
                                    { meters: { some: { deletedAt: { OR: [{ equal: null }, { isSet: false },] }, companyId: { in: contexts.companyIds } } } }, // Empresas do usuário (desnormalizado)
                                ],
                            },
                            extraWhere,
                        ]
                    },
                    take: take < 200 ? take : 200,
                });
                return { entity: iotDevices, error: null, status: 200 };

            // Dealerships
            case PermissionableEntity.dealership:
                // if (!hasSystemPermission && (!contexts.companyIds || contexts.companyIds.length === 0)) return { entity: null, error: 'Não autorizado', status: 401 };
                // Pesquisando se o usuário tem algum roleassignment com a permission de dealership
                const dealershipRoleAssignments = await prisma.roleAssignment.findMany({
                    where: {
                        userId,
                        deletedAt: null,
                        Role: {
                            deletedAt: null,
                            permissions: {
                                some: {
                                    entity: PermissionableEntity.dealership,
                                    action: 'read',
                                    deletedAt: null,
                                }
                            }
                        }
                    },
                    include: {
                        Role: {
                            include: {
                                permissions: true,
                            }
                        },
                    }
                });

                if (dealershipRoleAssignments.length === 0 && !hasSystemPermission) {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

                const dealerships = await prisma.dealership.findMany({
                    where: cleanWhere({
                        AND: [
                            {
                                OR: [
                                    { deletedAt: null },
                                    { deletedAt: { isSet: false } },
                                ],
                            },
                            {
                                name: search ? { contains: search, mode: "insensitive" } : undefined,
                            },
                            extraWhere,
                        ]
                    }),
                    orderBy: { name: 'asc' },
                    take: take < 200 ? take : 200,
                });
                return { entity: dealerships, error: null, status: 200 };

            // Readings and Reports
            case PermissionableEntity.reading:
                // console.warn("CHECKING READINGS")
                const readingsQuery: any = {
                    where: {
                        AND: [
                            { deletedAt: null },
                        ]
                    },
                }
                if (extraWhere) {
                    readingsQuery.where.AND.push(extraWhere);
                }
                if (contextType && contextId) {
                    // Filtro do contexto BUSCADO (usando campos desnormalizados diretos - SEM JOINS!)
                    readingsQuery.where.AND.push({
                        OR: [
                            { apartmentId: contextType === ContextType.apartment ? contextId : undefined },
                            { blockId: contextType === ContextType.block ? contextId : undefined },
                            { complexId: contextType === ContextType.complex ? contextId : undefined },
                            { companyId: contextType === ContextType.company ? contextId : undefined },
                        ]
                    });
                }
                // Filtro do contexto do USUÁRIO (usando campos desnormalizados diretos - SEM JOINS!)
                if (!hasSystemPermission) {
                    readingsQuery.where.AND.push({
                        OR: [
                            { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                        ]
                    });
                }
                console.warn('---- apartments:', contexts.apartmentIds)
                console.warn('---- blocks:', contexts.blockIds)
                console.warn('---- complexes:', contexts.complexIds)
                console.warn('---- companies:', contexts.companyIds)
                console.warn('MeterId:', where?.meterId)
                // console.warn(JSON.stringify(readingsQuery, null, 2))
                const readings = await prisma.reading.findMany({
                    ...readingsQuery,
                    take: take < 10000 ? take : 10000, // Permite até 10.000 registros para exportação de leituras
                    skip: skip ? skip : 0,
                    include: include ? include : undefined,
                })
                const readingsCount = await prisma.reading.count(({ where: { ...readingsQuery.where } }));
                console.log('------------------------------------LENGTH', readingsCount)
                console.log(JSON.stringify({
                    userId,
                    entityType,
                    contextType,
                    contextId,
                    search,
                    where,
                    take,
                    skip,
                    include
                }, null, 2))
                return { entity: readings, totalCount: readingsCount, error: null, status: 200 };
            case PermissionableEntity.dealershipReading:
                const dealershipReadingsQuery = {
                    where: {
                        AND: [
                            {
                                // Filtros de contexto BUSCADO - usando campos desnormalizados
                                complexId: contextType === ContextType.complex ? contextId : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,
                            },
                            {
                                // Filtros de permissão do USUÁRIO - usando campos desnormalizados SEM ANINHAMENTO!
                                OR: hasSystemPermission ? undefined : [
                                    { complexId: { in: contexts.complexIds } }, // Condomínios diretos (desnormalizado)
                                    { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                                ]
                            },
                            {
                                // Busca nos relates se necessário
                                OR: search ? [
                                    { dealership: { name: { contains: search, mode: "insensitive" } } },
                                    { complex: { socialName: { contains: search, mode: "insensitive" } } },
                                ] : undefined
                            },
                            extraWhere,
                        ]
                    }
                }

                console.warn('🚀 OPTIMIZED DEALERSHIP READINGS QUERY - Using denormalized fields!')

                const dealershipReadings = await prisma.dealershipReading.findMany({
                    ...dealershipReadingsQuery,
                    take: take < 20 ? take : 20,
                    skip: skip ? skip : 0,
                    include: include ? include : undefined,
                });

                const dealershipReadingsCount = await prisma.dealershipReading.count({ 
                    where: cleanWhere({ ...dealershipReadingsQuery.where, deletedAt: null }) 
                });

                return { entity: dealershipReadings, totalCount: dealershipReadingsCount, error: null, status: 200 };
            case PermissionableEntity.apartmentConsumptionReport:
                const apartmentConsumptionReportQuery = {
                    where: {
                        AND: [
                            {
                                // Filtros de contexto BUSCADO - usando campos desnormalizados diretos
                                apartmentId: contextType === ContextType.apartment ? contextId : undefined,
                                blockId: contextType === ContextType.block ? contextId : undefined,
                                complexId: contextType === ContextType.complex ? contextId : undefined,
                                companyId: contextType === ContextType.company ? contextId : undefined,

                                // Filtros de permissão do USUÁRIO - usando campos desnormalizados SEM ANINHAMENTO!
                                OR: hasSystemPermission ? undefined : [
                                    { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                                    { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)  
                                    { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                                    { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                                ]
                            },
                            // Busca por nome do apartment fica nos includes, se necessário
                            search ? {
                                apartment: {
                                    name: { contains: search, mode: "insensitive" }
                                }
                            } : {},
                            extraWhere,
                        ]
                    }
                }

                const apartmentConsumptionReports = await prisma.apartmentConsumptionReport.findMany({
                    ...apartmentConsumptionReportQuery,
                    take: take < 2000 ? take : 2000, // Permite até 2.000 registros para exportação
                    skip: skip ? skip : 0,
                    include: include ? include : undefined,
                    orderBy: orderBy === 'apartment.name' ? {
                        apartment: {
                            name: orderDirection as 'asc' | 'desc'
                        }
                    } : orderBy ? { [orderBy]: orderDirection } : undefined,
                });
                const apartmentConsumptionReportsCount = await prisma.apartmentConsumptionReport.count({ 
                    where: cleanWhere({ ...apartmentConsumptionReportQuery.where, deletedAt: null }) 
                });
                return { entity: apartmentConsumptionReports, totalCount: apartmentConsumptionReportsCount, error: null, status: 200 };

            // Users and Roles
            case PermissionableEntity.user:
                // Verificar se o usuário tem permissão para listar usuários em qualquer contexto
                const hasUserListPermission = contexts.system || 
                                             contexts.companyIds.length > 0 || 
                                             contexts.complexIds.length > 0 || 
                                             contexts.blockIds.length > 0 || 
                                             contexts.apartmentIds.length > 0;
                
                if (!hasUserListPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                const usersQuery = {
                    where: {
                        AND: [
                            {
                                OR: [
                                    { name: search ? { contains: search, mode: "insensitive" } : undefined },
                                    { email: search ? { contains: search, mode: "insensitive" } : undefined },
                                    { documentPerson: search ? { contains: search, mode: "insensitive" } : undefined },
                                ]
                            },
                            extraWhere,
                        ]
                    },
                    take: take < 200 ? take : 200,
                    skip: skip ? skip : 0,
                    include: include ? include : undefined,
                    orderBy: orderBy ? { [orderBy]: orderDirection } : { createdAt: orderDirection },
                };
                
                const users = await prisma.user.findMany(usersQuery);
                const usersCount = await prisma.user.count({ where: cleanWhere({ ...usersQuery.where, deletedAt: null }) });
                
                return { entity: users, totalCount: usersCount, error: null, status: 200 };
            case PermissionableEntity.role:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                const whereCondition = {
                    AND: [
                        {
                            OR: [
                                { name: search ? { contains: search, mode: "insensitive" } : undefined },
                                { description: search ? { contains: search, mode: "insensitive" } : undefined },
                            ],
                        },
                        extraWhere,
                    ],
                };

                const roles = await prisma.role.findMany({
                    where: whereCondition,
                    take: take < 200 ? take : 200,
                    skip,
                    orderBy: { [orderBy]: orderDirection },
                });

                const rolesCount = await prisma.role.count({
                    where: whereCondition,
                });

                return { entity: roles, totalCount: rolesCount, error: null, status: 200 };
            case PermissionableEntity.roleAssignment:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const roleAssignments = await prisma.roleAssignment.findMany({
                    where: {
                        AND: [
                            {
                                OR: [
                                    { User: { name: search ? { contains: search, mode: "insensitive" } : undefined } },
                                    { Role: { name: search ? { contains: search, mode: "insensitive" } : undefined } },
                                ]
                            },
                            extraWhere,
                        ]
                    },
                    include: include ? include : undefined,
                    take: take < 200 ? take : 200,
                });
                return { entity: roleAssignments, error: null, status: 200 };
            case PermissionableEntity.permission:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                const permissionsQuery = {
                    where: {
                        AND: [
                            extraWhere,
                        ]
                    },
                    take: take < 200 ? take : 200,
                    skip,
                    orderBy: { [orderBy]: orderDirection },
                };
                
                const permissions = await prisma.permission.findMany(permissionsQuery);
                const permissionsCount = await prisma.permission.count({
                    where: permissionsQuery.where,
                });
                
                return { entity: permissions, totalCount: permissionsCount, error: null, status: 200 };

            // Reservoirs
            case PermissionableEntity.reservoir:
                // Verificar se o usuário tem permissão para listar reservatórios
                const hasReservoirListPermission = hasSystemPermission || 
                                                 contexts.companyIds.length > 0 ||
                                                 contexts.complexIds.length > 0;
                
                if (!hasReservoirListPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                console.warn("### Contexts for reservoir ###");
                const reservoirWhereCondition = {
                    AND: [
                        {
                            OR: [
                                { name: search ? { contains: search, mode: "insensitive" } : undefined },
                                { type: search ? { contains: search, mode: "insensitive" } : undefined },
                            ],
                        },
                        // Filtrar por empresas e condomínios do contexto do usuário
                        hasSystemPermission ? {} : {
                            OR: [
                                { companyId: { in: contexts.companyIds } }, // Reservatórios da empresa
                                { complexId: { in: contexts.complexIds } }, // Reservatórios do condomínio
                                { complex: { companyId: { in: contexts.companyIds } } }, // Reservatórios de condomínios das empresas
                            ]
                        },
                        extraWhere,
                    ],
                };

                const reservoirs = await prisma.reservoir.findMany({
                    where: reservoirWhereCondition,
                    take: take < 200 ? take : 200,
                    skip,
                    orderBy: { [orderBy]: orderDirection },
                    include: include ? include : {
                        company: {
                            select: { id: true, name: true }
                        }
                    }
                });
                
                const reservoirCount = await prisma.reservoir.count({
                    where: {},
                });

                console.log('Reservoirs found:', reservoirs.length);
                console.log('With query:', JSON.stringify(reservoirWhereCondition, null, 2));
                
                return { entity: reservoirs, totalCount: reservoirCount, error: null, status: 200 };

            // Reservoir Readings  
            case PermissionableEntity.reservoirReading:
                // Verificar se o usuário tem permissão para listar leituras de reservatórios
                const hasReservoirReadingListPermission = hasSystemPermission || 
                                                        contexts.companyIds.length > 0;
                
                if (!hasReservoirReadingListPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                const reservoirReadingWhereCondition = {
                    AND: [
                        {
                            reservoir: hasSystemPermission ? {} : {
                                companyId: { in: contexts.companyIds }
                            }
                        },
                        extraWhere,
                    ],
                    deletedAt: null
                };

                console.log('Reservoir Reading Where Condition:', JSON.stringify(reservoirReadingWhereCondition, null, 2));

                const reservoirReadings = await prisma.reservoirReading.findMany({
                    where: reservoirReadingWhereCondition,
                    take: take < 200 ? take : 200,
                    skip,
                    orderBy: { [orderBy]: orderDirection },
                    include: include ? include : {
                        reservoir: {
                            select: { id: true, name: true, type: true, companyId: true }
                        }
                    }
                });
                
                const reservoirReadingCount = await prisma.reservoirReading.count({
                    where: reservoirReadingWhereCondition,
                });
                
                return { entity: reservoirReadings, totalCount: reservoirReadingCount, error: null, status: 200 };

            default:
                return { entity: null, error: 'Invalid entity type', status: 400 };
        }
    } catch (error) {
        console.error('Error fetching entity list data:', error);
        return { entity: null, error: 'Internal Server Error', status: 500 };
    }
}

// Mutations
async function createEntity(userId: string, entityType: PermissionableEntity, data: any): Promise<{ entity: any | null, error: string | null, status: number }> {
    try {
        data.deletedAt = null;
        data.createdByUserId = userId;
        // Guarantee createdAt/updatedAt are real Date objects, not strings
        // (Prisma @db.Timestamp requires native Date — ISO strings cause P2023 corruption)
        if (data.createdAt !== undefined) delete data.createdAt;
        if (data.updatedAt !== undefined) delete data.updatedAt;

        const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'create');
        const hasSystemPermission = !!contexts.system;

        console.log("### Contexts ###", contexts);

        switch (entityType) {
            // Contexts
            case PermissionableEntity.company:
                console.log("### Chegou aqui ###", hasSystemPermission)
                if (!hasSystemPermission)
                    return { entity: null, error: 'Não autorizado', status: 401 };

                console.log("### Chegou aqui ###")
                const company = await prisma.company.create({ data: { ...data } });
                return { entity: company, status: 201, error: null };

            case PermissionableEntity.complex:
                if (!hasSystemPermission && !contexts.companyIds.includes(data.companyId))
                    return { entity: null, error: 'Não autorizado', status: 401 };

                // Retorna erro se já houver com mesmo socialName ou CNPJ
                const existingComplex = await prisma.complex.findFirst({
                    where: cleanWhere({
                        OR: [
                            { socialName: data.socialName },
                            ...(data.documentCompany ? [{ documentCompany: data.documentCompany }] : [])
                        ],
                        deletedAt: null
                    })
                });

                if (existingComplex) {
                    return { entity: null, error: 'Já existe um condomínio com o mesmo nome social ou CNPJ.', status: 400 };
                }

                if (!data.aliasName || !data.aliasName.trim()) {
                    data.aliasName = data.socialName
                }

                console.warn('Creating complex with data:', data);

                const complex = await prisma.complex.create({ data: { ...data } });
                return { entity: complex, status: 201, error: null };

            case PermissionableEntity.block:
                const blockPermissionInContext = await prisma.complex.findFirst({
                    where: {
                        // Filtro do contexto ATRIBUÍDO
                        id: data.complexId,
                        // Filtro do contexto do USUÁRIO
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.complexIds } }, // Permissão do condomínio
                            { companyId: { in: contexts.companyIds } }, // Permissão da empresa
                        ]
                    },
                });
                if (blockPermissionInContext) {
                    // Adiciona o companyId desnormalizado do complex
                    data.companyId = blockPermissionInContext.companyId;
                    
                    const block = await prisma.block.create({ data: { ...data } });
                    return { entity: block, status: 201, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            case PermissionableEntity.apartment:
                const apartmentPermissionInContext = await prisma.block.findFirst({
                    where: {
                        // Filtro do contexto ATRIBUÍDO
                        id: data.blockId,
                        // Filtro do contexto do USUÁRIO
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.blockIds } }, // Permissão do bloco
                            { complex: { companyId: { in: contexts.companyIds } } }, // Permissão da empresa
                            { complexId: { in: contexts.complexIds } }, // Permissão do condomínio
                        ]
                    },
                    include: {
                        complex: {
                            select: {
                                id: true,
                                companyId: true
                            }
                        }
                    }
                });
                if (apartmentPermissionInContext) {
                    // Adiciona os campos desnormalizados do block/complex
                    data.complexId = apartmentPermissionInContext.complexId;
                    data.companyId = apartmentPermissionInContext.complex?.companyId;
                    
                    const apartment = await prisma.apartment.create({ data: { ...data } });
                    return { entity: apartment, status: 201, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            case PermissionableEntity.meter:
                const meterPermissionInContext = await prisma.apartment.findFirst({
                    where: {
                        // Filtro do contexto ATRIBUÍDO
                        id: data.apartmentId,

                        // Filtro do contexto do USUÁRIO
                        OR: hasSystemPermission ? undefined : [
                            { block: { complex: { companyId: { in: contexts.companyIds } } } }, // Permissão da empresa
                            { block: { complexId: { in: contexts.complexIds } } }, // Permissão do condomínio
                            { blockId: { in: contexts.blockIds } }, // Permissão do bloco
                            { id: { in: contexts.apartmentIds } }, // Permissão do apartamento
                        ]
                    },
                    select: {
                        id: true,
                        blockId: true,
                        complexId: true,
                        companyId: true
                    }
                });
                if (meterPermissionInContext) {
                    
                    // Adiciona os campos desnormalizados do apartment
                    data.blockId = meterPermissionInContext.blockId;
                    data.complexId = meterPermissionInContext.complexId;
                    data.companyId = meterPermissionInContext.companyId;

                    if (!data.initialReading) delete data.initialReading;

                    console.warn('Creating meter with data:', data);
                    
                    const meter = await prisma.meter.create({ data: { ...data } });
                    return { entity: meter, status: 201, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            case PermissionableEntity.typeMeter:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const typeMeter = await prisma.typeMeter.create({ data: { ...data } });
                return { entity: typeMeter, status: 201, error: null };
            case PermissionableEntity.iotDevice:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const iotDevice = await prisma.iotDevice.create({ data: { ...data } });
                return { entity: iotDevice, status: 201, error: null };

            // Dealerships
            case PermissionableEntity.dealership:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const dealership = await prisma.dealership.create({ data: { ...data } });
                return { entity: dealership, status: 201, error: null };

            // Readings and Reports
            case PermissionableEntity.dealershipReading:
                const dealershipReadingPermissionInContext = await prisma.complex.findFirst({
                    where: {
                        id: data.complexId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.complexIds } }, // Permissão do condomínio
                            { companyId: { in: contexts.companyIds } }, // Permissão da empresa
                        ]
                    },
                    select: {
                        id: true,
                        companyId: true,
                        company: { select: { id: true } } // fallback quando companyId desnormalizado está null
                    }
                });
                if (dealershipReadingPermissionInContext) {
                    // Resolver companyId: preferir campo desnormalizado, senão usar via relação
                    const resolvedCompanyId =
                        dealershipReadingPermissionInContext.companyId ||
                        dealershipReadingPermissionInContext.company?.id ||
                        null;

                    if (resolvedCompanyId) {
                        // Atualizar campo desnormalizado no banco se estava null
                        if (!dealershipReadingPermissionInContext.companyId) {
                            await prisma.complex.update({
                                where: { id: dealershipReadingPermissionInContext.id },
                                data: { companyId: resolvedCompanyId }
                            }).catch(() => { /* best-effort — não falhar a criação por isso */ });
                        }
                        data.companyId = resolvedCompanyId;
                    }
                    // Se não houver empresa associada, criamos a leitura sem companyId
                    // (não bloquear operação por campo opcional)

                    const dealershipReading = await prisma.dealershipReading.create({ data: { ...data } });
                    return { entity: dealershipReading, status: 201, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.apartmentConsumptionReport:
                // Buscar informações do apartamento para validações e desnormalização
                const referedApartment = await prisma.apartment.findFirst({
                    where: {
                        id: data.apartmentId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.apartmentIds } }, // Permissão do apartamento
                            { blockId: { in: contexts.blockIds } }, // Permissão do bloco (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Permissão do condomínio (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Permissão da empresa (desnormalizado)
                        ]
                    },
                    select: {
                        id: true,
                        blockId: true,
                        complexId: true,
                        companyId: true,
                        // fallback relations para campos desnormalizados null
                        block: {
                            select: {
                                id: true,
                                complexId: true,
                                companyId: true,
                                complex: { select: { id: true, companyId: true } }
                            }
                        }
                    }
                });

                const referedDealershipReading = await prisma.dealershipReading.findFirst({
                    where: {
                        id: data.dealershipReadingId,
                        deletedAt: null
                    },
                    select: {
                        id: true,
                        complexId: true,
                        companyId: true,
                        // fallback
                        complex: { select: { id: true, companyId: true, company: { select: { id: true } } } }
                    }
                });

                // Validando existencia das referências
                if (!referedDealershipReading)
                    return { entity: null, error: 'Leitura de concessionária não encontrada.', status: 400 };
                if (!referedApartment)
                    return { entity: null, error: 'Apartamento não encontrado ou sem permissão de acesso.', status: 404 };

                // Resolver campos desnormalizados do apartamento via relação quando null
                const aptBlockId = referedApartment.blockId || referedApartment.block?.id || null;
                const aptComplexId = referedApartment.complexId || referedApartment.block?.complexId || referedApartment.block?.complex?.id || null;
                const aptCompanyId = referedApartment.companyId || referedApartment.block?.companyId || referedApartment.block?.complex?.companyId || null;

                // Resolver companyId da leitura de concessionária
                const drCompanyId = referedDealershipReading.companyId ||
                    referedDealershipReading.complex?.companyId ||
                    referedDealershipReading.complex?.company?.id || null;

                // Atualizar campos desnormalizados no banco se estavam null (best-effort)
                if (!referedApartment.blockId && aptBlockId) {
                    await prisma.apartment.update({ where: { id: referedApartment.id }, data: { blockId: aptBlockId, complexId: aptComplexId || undefined, companyId: aptCompanyId || undefined } }).catch(() => {});
                }
                if (!referedDealershipReading.companyId && drCompanyId) {
                    await prisma.dealershipReading.update({ where: { id: referedDealershipReading.id }, data: { companyId: drCompanyId } }).catch(() => {});
                }

                // Validando consistência dos contextos (dealershipReading e Apartment vinculados)
                const drComplexId = referedDealershipReading.complexId || referedDealershipReading.complex?.id || null;
                if (drComplexId && aptComplexId && drComplexId !== aptComplexId)
                    return { entity: null, error: 'Condomínio do relatório inconsistente com condomínio da leitura de concessionária.', status: 400 };

                const finalApartmentConsumptionReportData = {
                    ...data,
                    blockId: aptBlockId,
                    complexId: aptComplexId,
                    companyId: aptCompanyId,
                };

                const apartmentConsumptionReport = await prisma.apartmentConsumptionReport.create({ data: { ...finalApartmentConsumptionReportData } });
                return { entity: apartmentConsumptionReport, status: 201, error: null };
            case PermissionableEntity.reading:
                const readingPermissionInContext = await prisma.meter.findFirst({
                    where: {
                        id: data.meterId,
                        OR: hasSystemPermission ? undefined : [
                            { apartmentId: { in: contexts.apartmentIds } }, // Permissão do apartamento
                            { blockId: { in: contexts.blockIds } }, // Permissão do bloco (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Permissão do condomínio (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Permissão da empresa (desnormalizado)
                        ]
                    },
                    select: {
                        id: true,
                        apartmentId: true,
                        blockId: true,
                        complexId: true,
                        companyId: true
                    }
                });

                console.log("Reading permission in context:", readingPermissionInContext);

                if (readingPermissionInContext) {
                    // Popular campos desnormalizados do meter
                    const dataWithDenormalizedFields = {
                        ...data,
                        apartmentId: readingPermissionInContext.apartmentId,
                        blockId: readingPermissionInContext.blockId,
                        complexId: readingPermissionInContext.complexId,
                        companyId: readingPermissionInContext.companyId
                    };
                    
                    const reading = await prisma.reading.create({ data: dataWithDenormalizedFields });
                    console.warn('Creating reading with denormalized data:', dataWithDenormalizedFields);
                    return { entity: reading, status: 201, error: null };
                } else {
                    console.error("User does not have permission to create reading in this context.");
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            // Users and Roles
            case PermissionableEntity.user:
                // Verificar se o usuário tem permissão para criar usuários em qualquer contexto
                const hasUserCreatePermission = contexts.system || 
                                               contexts.companyIds.length > 0 || 
                                               contexts.complexIds.length > 0 || 
                                               contexts.blockIds.length > 0 || 
                                               contexts.apartmentIds.length > 0;
                
                if (!hasUserCreatePermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                // Normalizar email se estiver presente
                if (data.email) {
                    data.email = normalizeEmail(data.email);
                }
                
                const user = await prisma.user.create({ data: { ...data } });
                return { entity: user, status: 201, error: null };
            case PermissionableEntity.role:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const role = await prisma.role.create({ data: { ...data } });
                return { entity: role, status: 201, error: null };
            case PermissionableEntity.roleAssignment:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const alreadyCreated = await prisma.roleAssignment.findFirst({
                    where: cleanWhere({
                        userId: data.userId,
                        roleId: data.roleId,
                        contextId: data.contextId,
                        contextType: data.contextType,
                        deletedAt: null, // Verifica se não está deletado
                    })
                });
                if (alreadyCreated) return { entity: null, error: 'Esta função já está atribuída ao usuário no contexto informado.', status: 409 };
                const roleAssignment = await prisma.roleAssignment.create({ data: { ...data } });
                return { entity: roleAssignment, status: 201, error: null };
            case PermissionableEntity.permission:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const permission = await prisma.permission.create({ data: { ...data } });
                return { entity: permission, status: 201, error: null };

            // Reservoirs
            case PermissionableEntity.reservoir:
                // Verificar se o usuário tem permissão para criar reservatórios
                const hasReservoirCreatePermission = hasSystemPermission || 
                                                   (data.companyId && contexts.companyIds.includes(data.companyId)) ||
                                                   (data.complexId && contexts.complexIds.includes(data.complexId));
                
                if (!hasReservoirCreatePermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                // Validar dados obrigatórios
                if (!data.name || !data.type) {
                    return { entity: null, error: 'Nome e tipo são obrigatórios', status: 400 };
                }
                
                // Validar que pelo menos companyId ou complexId está presente
                if (!data.companyId && !data.complexId) {
                    return { entity: null, error: 'Empresa ou condomínio deve ser especificado', status: 400 };
                }
                
                const reservoir = await prisma.reservoir.create({ 
                    data: { 
                        ...data,
                        isActive: data.isActive !== undefined ? data.isActive : true
                    } 
                });
                return { entity: reservoir, status: 201, error: null };

            // Reservoir Readings
            case PermissionableEntity.reservoirReading:
                // Buscar o reservatório para validar permissões
                const reservoirForReading = await prisma.reservoir.findFirst({
                    where: {
                        id: data.reservoirId,
                        companyId: hasSystemPermission ? undefined : { in: contexts.companyIds }
                    },
                    select: {
                        id: true,
                        companyId: true,
                        name: true
                    }
                });
                
                if (!reservoirForReading) {
                    return { entity: null, error: 'Reservatório não encontrado ou sem permissão de acesso', status: 404 };
                }
                
                // Validar dados obrigatórios
                if (!data.reservoirId || data.volume === undefined || !data.timestamp) {
                    return { entity: null, error: 'ReservoirId, volume e timestamp são obrigatórios', status: 400 };
                }
                
                const reservoirReading = await prisma.reservoirReading.create({ 
                    data: { 
                        ...data,
                        timestamp: new Date(data.timestamp)
                    } 
                });
                return { entity: reservoirReading, status: 201, error: null };

            default:
                return { error: 'Invalid entity type', status: 400, entity: null };
        }
    }
    catch (error) {
        console.error("Error creating entity:", error);
        return { error: 'Internal Server Error', status: 500, entity: null };
    }
}

async function bulkCreateEntity(userId: string, entityType: PermissionableEntity, data: any[]): Promise<{ entity: any | null, error: string | null, status: number }> {
    try {
        const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'create');
        const hasSystemPermission = !!contexts.system;

        // colocando createdByUserId em todos os dados
        data = data.map(item => {
            return { ...item, createdByUserId: userId, deletedAt: null };
        });

        // console.log({entityType, userId, contexts, hasSystemPermission})
        // console.log('^-^ New data:', JSON.stringify(data, null, 2));

        switch (entityType) {
            // Apartments
            case PermissionableEntity.apartment:
                // Permissão: system, company, complex, block
                let allowedBlockIds: string[] = [];
                if (hasSystemPermission) {
                    allowedBlockIds = data.map(a => a.blockId);
                } else {
                    allowedBlockIds = [
                        ...contexts.blockIds,
                        // Usa campos desnormalizados - muito mais eficiente!
                        ...await prisma.block.findMany({
                            where: { 
                                OR: [
                                    { complexId: { in: contexts.complexIds } },
                                    { companyId: { in: contexts.companyIds } }
                                ]
                            },
                            select: { id: true }
                        }).then(arr => arr.map(b => b.id))
                    ];
                }
                // Filtra apartamentos permitidos
                const allowedApartments = data.filter(a => allowedBlockIds.includes(a.blockId));
                if (allowedApartments.length === 0) {
                    return { entity: null, error: 'Não autorizado para nenhum dos blocos informados.', status: 401 };
                }
                
                // Busca os dados desnormalizados para todos os blocks únicos
                const uniqueBlockIds = [...new Set(allowedApartments.map(a => a.blockId))];
                const blocksData = await prisma.block.findMany({
                    where: { id: { in: uniqueBlockIds } },
                    select: {
                        id: true,
                        complexId: true,
                        companyId: true
                    }
                });
                
                // Cria um map para lookup rápido
                const blockDataMap = new Map(blocksData.map(b => [b.id, b]));
                
                // Adiciona os campos desnormalizados em cada apartamento
                const apartmentsWithDenormalizedFields = allowedApartments.map(apartment => {
                    const blockData = blockDataMap.get(apartment.blockId);
                    return {
                        ...apartment,
                        complexId: blockData?.complexId,
                        companyId: blockData?.companyId
                    };
                });
                
                const apartments = await prisma.apartment.createMany({ data: apartmentsWithDenormalizedFields });
                return { entity: apartments, status: 201, error: null };
            
            // Meters and Devices
            case PermissionableEntity.meter:
                // Coleta todos os apartmentIds únicos dos dados
                const uniqueApartmentIds = [...new Set(data.map(item => item.apartmentId))];

                console.warn('Unique apartment IDs:', uniqueApartmentIds);

                // Verifica permissão para todos os apartamentos em lote
                const allowedApartmentIds: string[] = [];
                if (hasSystemPermission) {
                    allowedApartmentIds.push(...uniqueApartmentIds);
                } else {
                    // Construir condições OR apenas para contextos com IDs válidos
                    const orConditions: any[] = [];
                    
                    // Usa campos desnormalizados - muito mais eficiente!
                    if (contexts.companyIds.length > 0) {
                        orConditions.push({ companyId: { in: contexts.companyIds } });
                    }
                    if (contexts.complexIds.length > 0) {
                        orConditions.push({ complexId: { in: contexts.complexIds } });
                    }
                    if (contexts.blockIds.length > 0) {
                        orConditions.push({ blockId: { in: contexts.blockIds } });
                    }
                    if (contexts.apartmentIds.length > 0) {
                        orConditions.push({ id: { in: contexts.apartmentIds } });
                    }

                    // Se não há nenhuma condição OR válida, retorna erro
                    if (orConditions.length === 0) {
                        return { entity: null, error: 'Usuário não tem permissão para criar medidores.', status: 401 };
                    }

                    const queryWhere = {
                        id: { in: uniqueApartmentIds },
                        OR: orConditions
                    };

                    console.log('using query:', JSON.stringify({
                        where: queryWhere,
                        select: { id: true }
                    }, null, 2));

                    const accessibleApartments = await prisma.apartment.findMany({
                        where: queryWhere,
                        select: { id: true }
                    });
                    allowedApartmentIds.push(...accessibleApartments.map(a => a.id));
                }

                console.warn('Allowed apartment IDs:', allowedApartmentIds);
                
                // Busca os dados desnormalizados para todos os apartments permitidos
                const apartmentsData = await prisma.apartment.findMany({
                    where: { id: { in: allowedApartmentIds } },
                    select: {
                        id: true,
                        blockId: true,
                        complexId: true,
                        companyId: true
                    }
                });
                
                // Cria um map para lookup rápido
                const apartmentDataMap = new Map(apartmentsData.map(a => [a.id, a]));
                
                // Filtra apenas os meters para apartamentos permitidos e adiciona campos desnormalizados
                const allowedMeters = data.filter(meter => allowedApartmentIds.includes(meter.apartmentId))
                    .map(meter => {
                        const apartmentData = apartmentDataMap.get(meter.apartmentId);
                        return {
                            ...meter,
                            blockId: apartmentData?.blockId,
                            complexId: apartmentData?.complexId,
                            companyId: apartmentData?.companyId
                        };
                    });
                    
                if (allowedMeters.length === 0) {
                    return { entity: null, error: 'Não autorizado para nenhum dos apartamentos informados.', status: 401 };
                }
                console.warn('Creating meters with data:', allowedMeters);
                const meters = await prisma.meter.createMany({ data: allowedMeters });
                return { entity: meters, status: 201, error: null };


            case PermissionableEntity.iotDevice:
                console.log(`🔧 BULK CREATE IOT DEVICES - hasSystemPermission: ${hasSystemPermission}`);
                if (!hasSystemPermission) {
                    console.log(`🔧 ❌ SEM PERMISSÃO DE SISTEMA PARA CRIAR IOT DEVICES`);
                    return { entity: null, error: 'Você não possui permissão para criar dispositivos IoT. Entre em contato com o administrador do sistema.', status: 401 };
                }
                console.log(`🔧 CRIANDO ${data.length} IOT DEVICES NO BANCO:`, data.map(d => ({ deviceId: d.deviceId, remoteId: d.remoteId })));
                const iotDevices = await prisma.iotDevice.createMany({ data });
                console.log(`🔧 ✅ RESULTADO CREATE MANY:`, iotDevices);
                return { entity: iotDevices, status: 201, error: null };

            // Reports - dealership and apartment consumption
            case PermissionableEntity.dealershipReading:
                // Coleta todos os complexIds únicos dos dados
                const uniqueComplexIdsForDealershipReading = [...new Set(data.map(item => item.complexId))];

                console.warn('Unique complex IDs for dealership reading:', uniqueComplexIdsForDealershipReading);

                // Verifica permissão para todos os complexos em lote
                const allowedComplexIdsForDealershipReading: string[] = [];
                if (hasSystemPermission) {
                    allowedComplexIdsForDealershipReading.push(...uniqueComplexIdsForDealershipReading);
                } else {
                    // Construir condições OR apenas para contextos com IDs válidos
                    const orConditions: any[] = [];
                    
                    if (contexts.companyIds.length > 0) {
                        orConditions.push({ companyId: { in: contexts.companyIds } });
                    }
                    if (contexts.complexIds.length > 0) {
                        orConditions.push({ id: { in: contexts.complexIds } });
                    }

                    // Se não há nenhuma condição OR válida, retorna erro
                    if (orConditions.length === 0) {
                        return { entity: null, error: 'Usuário não tem permissão para criar leituras de concessionária.', status: 401 };
                    }

                    const accessibleComplexesForDealershipReading = await prisma.complex.findMany({
                        where: {
                            id: { in: uniqueComplexIdsForDealershipReading },
                            OR: orConditions
                        },
                        select: { id: true }
                    });
                    allowedComplexIdsForDealershipReading.push(...accessibleComplexesForDealershipReading.map(c => c.id));
                }

                console.warn('Allowed complex IDs for dealership reading:', allowedComplexIdsForDealershipReading);

                // Busca os dados desnormalizados para todos os complexes permitidos (com fallback via relação)
                const complexesDataForDealershipReading = await prisma.complex.findMany({
                    where: { id: { in: allowedComplexIdsForDealershipReading } },
                    select: {
                        id: true,
                        companyId: true,
                        company: { select: { id: true } } // fallback quando companyId desnormalizado está null
                    }
                });

                // Cria map para lookup rápido
                const complexDataMapForDealershipReading = new Map(complexesDataForDealershipReading.map(c => [c.id, c]));

                // Valida e adiciona campos desnormalizados em cada leitura de concessionária
                const validatedDealershipReadings: any[] = [];
                const dealershipReadingErrors: string[] = [];

                for (const dealershipReading of data) {
                    // Verifica se o complexo está permitido
                    if (!allowedComplexIdsForDealershipReading.includes(dealershipReading.complexId)) {
                        dealershipReadingErrors.push(`Condomínio ${dealershipReading.complexId} não encontrado ou sem permissão de acesso.`);
                        continue;
                    }

                    const complexData = complexDataMapForDealershipReading.get(dealershipReading.complexId);

                    // Validações de existência
                    if (!complexData) {
                        dealershipReadingErrors.push(`Dados do condomínio ${dealershipReading.complexId} não encontrados.`);
                        continue;
                    }

                    // Validação dos campos desnormalizados do complexo
                    // Resolver companyId via relação quando campo desnormalizado está null
                    const resolvedComplexCompanyId = complexData.companyId || (complexData as any).company?.id || null;
                    if (!resolvedComplexCompanyId) {
                        dealershipReadingErrors.push(`Condomínio ${dealershipReading.complexId} não possui empresa associada. Por favor, associe o condomínio a uma empresa antes de criar leituras.`);
                        continue;
                    }

                    // Se chegou até aqui, a leitura é válida - adiciona campos desnormalizados
                    validatedDealershipReadings.push({
                        ...dealershipReading,
                        companyId: resolvedComplexCompanyId,
                    });
                }

                // Se há erros, retorna o primeiro erro encontrado
                if (dealershipReadingErrors.length > 0) {
                    return { entity: null, error: dealershipReadingErrors[0], status: 400 };
                }

                // Se não há leituras válidas, retorna erro
                if (validatedDealershipReadings.length === 0) {
                    return { entity: null, error: 'Nenhuma leitura de concessionária válida para criar.', status: 400 };
                }

                console.warn('Creating dealership readings with validated data:', validatedDealershipReadings.length, 'readings');
                const dealershipReadings = await prisma.dealershipReading.createMany({ data: validatedDealershipReadings });
                return { entity: dealershipReadings, status: 201, error: null };
            case PermissionableEntity.apartmentConsumptionReport:
                // Coleta todos os apartmentIds e dealershipReadingIds únicos dos dados
                const uniqueApartmentIdsForReports = [...new Set(data.map(item => item.apartmentId))];
                const uniqueDealershipReadingIds = [...new Set(data.map(item => item.dealershipReadingId))];

                console.warn('Unique apartment IDs for reports:', uniqueApartmentIdsForReports);
                console.warn('Unique dealership reading IDs:', uniqueDealershipReadingIds);

                // Verifica permissão para todos os apartamentos em lote
                const allowedApartmentIdsForReports: string[] = [];
                if (hasSystemPermission) {
                    allowedApartmentIdsForReports.push(...uniqueApartmentIdsForReports);
                } else {
                    // Construir condições OR apenas para contextos com IDs válidos
                    const orConditions: any[] = [];
                    
                    // Usa campos desnormalizados - muito mais eficiente!
                    if (contexts.companyIds.length > 0) {
                        orConditions.push({ companyId: { in: contexts.companyIds } });
                    }
                    if (contexts.complexIds.length > 0) {
                        orConditions.push({ complexId: { in: contexts.complexIds } });
                    }
                    if (contexts.blockIds.length > 0) {
                        orConditions.push({ blockId: { in: contexts.blockIds } });
                    }
                    if (contexts.apartmentIds.length > 0) {
                        orConditions.push({ id: { in: contexts.apartmentIds } });
                    }

                    // Se não há nenhuma condição OR válida, retorna erro
                    if (orConditions.length === 0) {
                        return { entity: null, error: 'Usuário não tem permissão para criar relatórios de consumo.', status: 401 };
                    }

                    const accessibleApartmentsForReports = await prisma.apartment.findMany({
                        where: {
                            id: { in: uniqueApartmentIdsForReports },
                            OR: orConditions
                        },
                        select: { id: true }
                    });
                    allowedApartmentIdsForReports.push(...accessibleApartmentsForReports.map(a => a.id));
                }

                console.warn('Allowed apartment IDs for reports:', allowedApartmentIdsForReports);

                // Busca os dados desnormalizados para todos os apartments permitidos (com fallback via relação)
                const apartmentsDataForReports = await prisma.apartment.findMany({
                    where: { id: { in: allowedApartmentIdsForReports } },
                    select: {
                        id: true,
                        blockId: true,
                        complexId: true,
                        companyId: true,
                        block: { select: { id: true, complexId: true, companyId: true, complex: { select: { id: true, companyId: true } } } }
                    }
                });

                // Busca os dados das leituras de concessionária para validação (com fallback via relação)
                const dealershipReadingsData = await prisma.dealershipReading.findMany({
                    where: {
                        id: { in: uniqueDealershipReadingIds },
                        deletedAt: null
                    },
                    select: {
                        id: true,
                        complexId: true,
                        companyId: true,
                        complex: { select: { id: true, companyId: true, company: { select: { id: true } } } }
                    }
                });

                // Cria maps para lookup rápido
                const apartmentDataMapForReports = new Map(apartmentsDataForReports.map(a => [a.id, a]));
                const dealershipReadingDataMap = new Map(dealershipReadingsData.map(d => [d.id, d]));

                // Valida e adiciona campos desnormalizados em cada relatório
                const validatedReports: any[] = [];
                const errors: string[] = [];

                for (const report of data) {
                    // Verifica se o apartamento está permitido
                    if (!allowedApartmentIdsForReports.includes(report.apartmentId)) {
                        errors.push(`Apartamento ${report.apartmentId} não encontrado ou sem permissão de acesso.`);
                        continue;
                    }

                    const apartmentData = apartmentDataMapForReports.get(report.apartmentId);
                    const dealershipReadingData = dealershipReadingDataMap.get(report.dealershipReadingId);

                    // Validações de existência
                    if (!apartmentData) {
                        errors.push(`Dados do apartamento ${report.apartmentId} não encontrados.`);
                        continue;
                    }

                    if (!dealershipReadingData) {
                        errors.push(`Leitura de concessionária ${report.dealershipReadingId} não encontrada.`);
                        continue;
                    }

                    // Resolver campos desnormalizados do apartamento via relação quando null
                    const rptAptBlockId = apartmentData.blockId || (apartmentData as any).block?.id || null;
                    const rptAptComplexId = apartmentData.complexId || (apartmentData as any).block?.complexId || (apartmentData as any).block?.complex?.id || null;
                    const rptAptCompanyId = apartmentData.companyId || (apartmentData as any).block?.companyId || (apartmentData as any).block?.complex?.companyId || null;

                    // Resolver companyId da leitura de concessionária
                    const rptDrCompanyId = dealershipReadingData.companyId ||
                        (dealershipReadingData as any).complex?.companyId ||
                        (dealershipReadingData as any).complex?.company?.id || null;
                    const rptDrComplexId = dealershipReadingData.complexId || (dealershipReadingData as any).complex?.id || null;

                    // Validação de consistência dos contextos (apenas quando ambos têm valor)
                    if (rptDrComplexId && rptAptComplexId && rptDrComplexId !== rptAptComplexId) {
                        errors.push(`Condomínio do apartamento ${report.apartmentId} inconsistente com condomínio da leitura de concessionária ${report.dealershipReadingId}.`);
                        continue;
                    }

                    // Se chegou até aqui, o relatório é válido - adiciona campos desnormalizados
                    validatedReports.push({
                        ...report,
                        blockId: rptAptBlockId,
                        complexId: rptAptComplexId,
                        companyId: rptAptCompanyId,
                    });
                }

                // Se há erros, retorna o primeiro erro encontrado
                if (errors.length > 0) {
                    return { entity: null, error: errors[0], status: 400 };
                }

                // Se não há relatórios válidos, retorna erro
                if (validatedReports.length === 0) {
                    return { entity: null, error: 'Nenhum relatório válido para criar.', status: 400 };
                }

                console.warn('Creating apartment consumption reports with validated data:', validatedReports.length, 'reports');
                const apartmentConsumptionReports = await prisma.apartmentConsumptionReport.createMany({ data: validatedReports });
                return { entity: apartmentConsumptionReports, status: 201, error: null };
            case PermissionableEntity.block:
                // Permissão: system, company, complex
                let allowedComplexIds: string[] = [];
                if (hasSystemPermission) {
                    allowedComplexIds = data.map(b => b.complexId);
                } else {
                    allowedComplexIds = [
                        ...contexts.complexIds,
                        // Usa campos desnormalizados - muito mais eficiente!
                        ...await prisma.complex.findMany({
                            where: { companyId: { in: contexts.companyIds } },
                            select: { id: true }
                        }).then(arr => arr.map(c => c.id))
                    ];
                }
                // Filtra blocos permitidos
                const allowedBlocks = data.filter(b => allowedComplexIds.includes(b.complexId));
                if (allowedBlocks.length === 0) {
                    return { entity: null, error: 'Não autorizado para nenhum dos condomínios informados.', status: 401 };
                }
                
                // Busca os dados desnormalizados para todos os complexes únicos
                const uniqueComplexIds = [...new Set(allowedBlocks.map(b => b.complexId))];
                const complexesData = await prisma.complex.findMany({
                    where: { id: { in: uniqueComplexIds } },
                    select: {
                        id: true,
                        companyId: true
                    }
                });
                
                // Cria um map para lookup rápido
                const complexDataMap = new Map(complexesData.map(c => [c.id, c]));
                
                // Adiciona os campos desnormalizados em cada bloco
                const blocksWithDenormalizedFields = allowedBlocks.map(block => {
                    const complexData = complexDataMap.get(block.complexId);
                    return {
                        ...block,
                        companyId: complexData?.companyId
                    };
                });
                
                const blocks = await prisma.block.createMany({ data: blocksWithDenormalizedFields });
                return { entity: blocks, status: 201, error: null };

            case PermissionableEntity.reading:
                // Buscar todos os meterIds únicos para pegar os dados desnormalizados (filtrando undefined)
                const uniqueMeterIds = [...new Set(data.map((reading: any) => reading.meterId))].filter(id => id !== undefined && id !== null);
                
                // Se não há meterIds válidos, pula a busca de meters
                const metersData = uniqueMeterIds.length > 0 ? await prisma.meter.findMany({
                    where: {
                        id: { in: uniqueMeterIds },
                        OR: hasSystemPermission ? undefined : [
                            { apartmentId: { in: contexts.apartmentIds } }, // Permissão do apartamento
                            { blockId: { in: contexts.blockIds } }, // Permissão do bloco (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Permissão do condomínio (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Permissão da empresa (desnormalizado)
                        ]
                    },
                    select: {
                        id: true,
                        apartmentId: true,
                        blockId: true,
                        complexId: true,
                        companyId: true
                    }
                }) : [];

                // Criar um map para lookup rápido dos dados dos meters
                const meterDataMap = new Map(metersData.map((m: any) => [m.id, m]));
                
                // Adicionar campos desnormalizados em cada reading
                const readingsWithDenormalizedFields = data.map((reading: any) => {
                    const meterData = reading.meterId ? meterDataMap.get(reading.meterId) : null;
                    
                    // Se tem meterId mas não encontrou o meter, é erro de permissão
                    if (reading.meterId && !meterData) {
                        throw new Error(`Meter ${reading.meterId} not found or no permission`);
                    }
                    
                    // Se não tem meterId, usa valores null para os campos desnormalizados
                    return {
                        ...reading,
                        apartmentId: meterData?.apartmentId || null,
                        blockId: meterData?.blockId || null,
                        complexId: meterData?.complexId || null,
                        companyId: meterData?.companyId || null
                    };
                });

                const readings = await prisma.reading.createMany({ data: readingsWithDenormalizedFields });
                console.warn('Creating readings with denormalized data:', readingsWithDenormalizedFields.length, 'readings');
                return { entity: readings, status: 201, error: null };

            // Reservoirs
            case PermissionableEntity.reservoir:
                // Verificar se o usuário tem permissão para criar reservatórios em lote
                const hasReservoirBulkCreatePermission = hasSystemPermission || 
                                                       contexts.companyIds.length > 0;
                
                if (!hasReservoirBulkCreatePermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                // Validar e filtrar reservatórios permitidos
                const allowedReservoirs = data.filter(reservoir => {
                    // Validar dados obrigatórios
                    if (!reservoir.name || !reservoir.type || !reservoir.companyId) {
                        return false;
                    }
                    
                    // Verificar permissão por empresa
                    return hasSystemPermission || contexts.companyIds.includes(reservoir.companyId);
                });
                
                if (allowedReservoirs.length === 0) {
                    return { entity: null, error: 'Nenhum reservatório válido para criação', status: 400 };
                }
                
                // Adicionar isActive padrão se não especificado
                const reservoirsWithDefaults = allowedReservoirs.map(reservoir => ({
                    ...reservoir,
                    isActive: reservoir.isActive !== undefined ? reservoir.isActive : true
                }));
                
                const reservoirs = await prisma.reservoir.createMany({ data: reservoirsWithDefaults });
                return { entity: reservoirs, status: 201, error: null };

            // Reservoir Readings
            case PermissionableEntity.reservoirReading:
                // Buscar todos os reservoirIds únicos para validar permissões
                const uniqueReservoirIds = [...new Set(data.map((reading: any) => reading.reservoirId))].filter(id => id !== undefined && id !== null);
                
                if (uniqueReservoirIds.length === 0) {
                    return { entity: null, error: 'Nenhum reservatório especificado nas leituras', status: 400 };
                }
                
                // Buscar reservatórios permitidos
                const allowedReservoirsForReadings = await prisma.reservoir.findMany({
                    where: {
                        id: { in: uniqueReservoirIds },
                        companyId: hasSystemPermission ? undefined : { in: contexts.companyIds }
                    },
                    select: {
                        id: true,
                        companyId: true,
                        name: true
                    }
                });
                
                const allowedReservoirIdsSet = new Set(allowedReservoirsForReadings.map(r => r.id));
                
                // Filtrar leituras para reservatórios permitidos
                const allowedReadings = data.filter((reading: any) => {
                    // Validar dados obrigatórios
                    if (!reading.reservoirId || reading.level === undefined || !reading.readingDate) {
                        return false;
                    }
                    
                    // Verificar se o reservatório é permitido
                    return allowedReservoirIdsSet.has(reading.reservoirId);
                });
                
                if (allowedReadings.length === 0) {
                    return { entity: null, error: 'Nenhuma leitura válida para criação', status: 400 };
                }
                
                // Converter timestamps
                const readingsWithDates = allowedReadings.map((reading: any) => ({
                    ...reading,
                    readingDate: new Date(reading.readingDate),
                    receivedAt: reading.receivedAt ? new Date(reading.receivedAt) : new Date()
                }));
                
                const reservoirReadings = await prisma.reservoirReading.createMany({ data: readingsWithDates });
                return { entity: reservoirReadings, status: 201, error: null };

            default:
                return { error: 'Invalid entity type', status: 400, entity: null };
        }
    }
    catch (error) {
        console.error("Error creating entity:", error);
        return { error: 'Internal Server Error', status: 500, entity: null };
    }
}


async function updateEntityData(userId: string, entityType: PermissionableEntity, entityId: string, data: any): Promise<{ entity: any | null, error: string | null, status: number }> {
    try {
        const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'update');
        const hasSystemPermission = !!contexts.system;

        console.log("######### updateEntityData - contexts:", contexts)
        console.log("######### updateEntityData - entityId:", entityId)
        console.log("######### updateEntityData - entityType:", entityType)
        console.log("######### updateEntityData - data:", data)

        // Adiciona updatedByUserId em todos os updates
        if (data) {
            data.updatedByUserId = userId;
        }
        switch (entityType) {
            // Contexts
            case PermissionableEntity.company:
                const companyPermissionInContext = await prisma.company.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.companyIds } }, // Empresas do usuário
                        ]
                    },
                });
                if (companyPermissionInContext) {
                    const company = await prisma.company.update({ where: { id: entityId }, data });
                    
                    // Company updates não afetam campos desnormalizados porque companyId é estável
                    // Se em algum momento precisarmos de transferência de empresa, seria um caso especial
                    
                    return { entity: company, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.complex:
                const complexPermissionInContext = await prisma.complex.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.complexIds } }, // Condomínios diretos
                            { companyId: { in: contexts.companyIds } }, // Condomínios das empresas do usuário
                        ]
                    },
                });

                // Retorna erro se já houver com mesmo socialName ou CNPJ
                const existingComplex = await prisma.complex.findFirst({
                    where: {
                        OR: [
                            { socialName: data.socialName },
                            ...(data.documentCompany ? [{ documentCompany: data.documentCompany }] : [])
                        ],
                        deletedAt: null
                    }
                });

                if (existingComplex && existingComplex.id !== entityId) {
                    return { entity: null, error: 'Já existe um condomínio com o mesmo nome social ou CNPJ.', status: 400 };
                }

                data.aliasName = data.socialName;

                if (complexPermissionInContext) {
                    // Busca o complex atual para ver se companyId mudou
                    const currentComplex = await prisma.complex.findUnique({
                        where: { id: entityId },
                        select: { companyId: true }
                    });
                    
                    const complex = await prisma.complex.update({ where: { id: entityId }, data });
                    
                    // APENAS atualiza em cascata se companyId realmente mudou
                    if (data.companyId && currentComplex?.companyId !== data.companyId) {
                        await prisma.$transaction(async (tx) => {
                            // Atualiza blocks
                            await tx.block.updateMany({
                                where: { complexId: entityId },
                                data: { 
                                    companyId: data.companyId,
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza dealershipReadings
                            await tx.dealershipReading.updateMany({
                                where: { complexId: entityId },
                                data: { 
                                    companyId: data.companyId,
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza apartments
                            await tx.apartment.updateMany({
                                where: { complexId: entityId },
                                data: { 
                                    companyId: data.companyId,
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza meters
                            await tx.meter.updateMany({
                                where: { complexId: entityId },
                                data: { 
                                    companyId: data.companyId,
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza apartmentConsumptionReports
                            await tx.apartmentConsumptionReport.updateMany({
                                where: { complexId: entityId },
                                data: { 
                                    companyId: data.companyId,
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                        });
                    }
                    
                    return { entity: complex, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.block:
                const blockPermissionInContext = await prisma.block.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.blockIds } }, // Blocos diretos
                            { complexId: { in: contexts.complexIds } }, // Blocos dentro dos condomínios do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Blocos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (blockPermissionInContext) {
                    // Busca o block atual para ver se complexId mudou
                    const currentBlock = await prisma.block.findUnique({
                        where: { id: entityId },
                        select: { complexId: true, companyId: true }
                    });
                    
                    // Se complexId mudou, busca o companyId do novo complex
                    if (data.complexId && currentBlock?.complexId !== data.complexId) {
                        const newComplex = await prisma.complex.findUnique({
                            where: { id: data.complexId },
                            select: { companyId: true }
                        });
                        
                        if (newComplex) {
                            data.companyId = newComplex.companyId;
                        }
                    }
                    
                    const block = await prisma.block.update({ where: { id: entityId }, data });
                    
                    // APENAS atualiza em cascata se complexId ou companyId realmente mudaram
                    if ((data.complexId && currentBlock?.complexId !== data.complexId) || 
                        (data.companyId && currentBlock?.companyId !== data.companyId)) {
                        await prisma.$transaction(async (tx) => {
                            // Atualiza apartments
                            await tx.apartment.updateMany({
                                where: { blockId: entityId },
                                data: { 
                                    ...(data.complexId ? { complexId: data.complexId } : {}),
                                    ...(data.companyId ? { companyId: data.companyId } : {}),
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza meters
                            await tx.meter.updateMany({
                                where: { blockId: entityId },
                                data: { 
                                    ...(data.complexId ? { complexId: data.complexId } : {}),
                                    ...(data.companyId ? { companyId: data.companyId } : {}),
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza apartmentConsumptionReports
                            await tx.apartmentConsumptionReport.updateMany({
                                where: { blockId: entityId },
                                data: { 
                                    ...(data.complexId ? { complexId: data.complexId } : {}),
                                    ...(data.companyId ? { companyId: data.companyId } : {}),
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                        });
                    }
                    // Se não mudou nenhum ID de contexto, não faz cascade update
                    
                    return { entity: block, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.apartment:
                const apartmentPermissionInContext = await prisma.apartment.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                            { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                            { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (apartmentPermissionInContext) {
                    // Busca o apartment atual para ver se blockId mudou
                    const currentApartment = await prisma.apartment.findUnique({
                        where: { id: entityId },
                        select: { blockId: true, complexId: true, companyId: true }
                    });
                    
                    // Se blockId mudou, busca complexId e companyId do novo block
                    if (data.blockId && currentApartment?.blockId !== data.blockId) {
                        const newBlock = await prisma.block.findUnique({
                            where: { id: data.blockId },
                            select: { complexId: true, companyId: true }
                        });
                        
                        if (newBlock) {
                            data.complexId = newBlock.complexId;
                            data.companyId = newBlock.companyId;
                        }
                    }
                    
                    const apartment = await prisma.apartment.update({ where: { id: entityId }, data });
                    
                    // APENAS atualiza em cascata se algum ID de contexto realmente mudou
                    if ((data.blockId && currentApartment?.blockId !== data.blockId) || 
                        (data.complexId && currentApartment?.complexId !== data.complexId) ||
                        (data.companyId && currentApartment?.companyId !== data.companyId)) {
                        await prisma.$transaction(async (tx) => {
                            // Atualiza meters
                            await tx.meter.updateMany({
                                where: { apartmentId: entityId },
                                data: { 
                                    ...(data.blockId ? { blockId: data.blockId } : {}),
                                    ...(data.complexId ? { complexId: data.complexId } : {}),
                                    ...(data.companyId ? { companyId: data.companyId } : {}),
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                            
                            // Atualiza apartmentConsumptionReports
                            await tx.apartmentConsumptionReport.updateMany({
                                where: { apartmentId: entityId },
                                data: { 
                                    ...(data.blockId ? { blockId: data.blockId } : {}),
                                    ...(data.complexId ? { complexId: data.complexId } : {}),
                                    ...(data.companyId ? { companyId: data.companyId } : {}),
                                    updatedByUserId: userId, 
                                    updatedAt: new Date() 
                                }
                            });
                        });
                    }
                    // Se não mudou nenhum ID de contexto, não faz cascade update
                    
                    return { entity: apartment, status: 200, error: null }
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            // Meters and Devices
            case PermissionableEntity.meter:
                const meterPermissionInContext = await prisma.meter.findFirst({
                    where: {
                        id: entityId,
                        apartment: hasSystemPermission ? undefined : {
                            OR: [
                                { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                                { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                                { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                                { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                            ]
                        }
                    },
                });
                if (meterPermissionInContext) {
                    console.log("######### updateEntityData - meterPermissionInContext:", meterPermissionInContext)
                    
                    // Se apartmentId mudou, busca os IDs desnormalizados do novo apartment
                    if (data.apartmentId) {
                        const currentMeter = await prisma.meter.findUnique({
                            where: { id: entityId },
                            select: { apartmentId: true }
                        });
                        
                        if (currentMeter?.apartmentId !== data.apartmentId) {
                            const newApartment = await prisma.apartment.findUnique({
                                where: { id: data.apartmentId },
                                select: { blockId: true, complexId: true, companyId: true }
                            });
                            
                            if (newApartment) {
                                data.blockId = newApartment.blockId;
                                data.complexId = newApartment.complexId;
                                data.companyId = newApartment.companyId;
                            }
                        }
                    }
                    
                    const meter = await prisma.meter.update({ where: { id: entityId }, data });
                    return { entity: meter, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.typeMeter:
                const typeMeterPermissionInContext = await prisma.typeMeter.findFirst({
                    where: {
                        id: entityId,
                    },
                });
                if (typeMeterPermissionInContext && hasSystemPermission) {
                    const typeMeter = await prisma.typeMeter.update({ where: { id: entityId }, data });
                    return { entity: typeMeter, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.iotDevice:
                // Agora a ligação entre device e meter é feita por MeterDeviceLink
                const iotDevicePermissionInContext = await prisma.meterDeviceLink.findFirst({
                    where: {
                        deviceId: entityId,
                        OR: [
                            { deletedAt: null },
                            { deletedAt: { isSet: false } }
                        ],
                        meter: {
                            OR: hasSystemPermission ? undefined : [
                                { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                                { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                                { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                                { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                            ]
                        }
                    }
                });
                if (iotDevicePermissionInContext) {
                    const iotDevice = await prisma.iotDevice.update({ where: { id: entityId }, data });
                    return { entity: iotDevice, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            // Dealerships
            case PermissionableEntity.dealership:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const dealership = await prisma.dealership.update({ where: { id: entityId }, data });
                return { entity: dealership, status: 200, error: null };

            // Readings and Reports
            case PermissionableEntity.dealershipReading:
                const dealershipReadingPermissionInContext = await prisma.dealershipReading.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { complexId: { in: contexts.complexIds } }, // Apartamentos dentro dos condomínios do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (dealershipReadingPermissionInContext) {
                    // Busca o dealershipReading atual para verificar mudanças
                    const currentDealershipReading = await prisma.dealershipReading.findUnique({
                        where: { id: entityId },
                        select: { complexId: true, companyId: true }
                    });
                    
                    // Se complexId mudou, busca companyId do novo complex
                    if (data.complexId && currentDealershipReading?.complexId !== data.complexId) {
                        const newComplex = await prisma.complex.findUnique({
                            where: { id: data.complexId },
                            select: { companyId: true }
                        });
                        
                        if (newComplex) {
                            data.companyId = newComplex.companyId;
                        }
                    }
                    
                    const dealershipReading = await prisma.dealershipReading.update({ where: { id: entityId }, data });
                    return { entity: dealershipReading, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.apartmentConsumptionReport:
                console.warn({ contexts })
                const apartmentConsumptionReportPermissionInContext = await prisma.apartmentConsumptionReport.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                            { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                        ]
                    },
                });
                if (apartmentConsumptionReportPermissionInContext) {
                    // Se apartmentId mudou, busca os IDs desnormalizados do novo apartment
                    if (data.apartmentId) {
                        const currentReport = await prisma.apartmentConsumptionReport.findUnique({
                            where: { id: entityId },
                            select: { apartmentId: true }
                        });
                        
                        if (currentReport?.apartmentId !== data.apartmentId) {
                            const newApartment = await prisma.apartment.findUnique({
                                where: { id: data.apartmentId },
                                select: { blockId: true, complexId: true, companyId: true }
                            });
                            
                            if (newApartment) {
                                data.blockId = newApartment.blockId;
                                data.complexId = newApartment.complexId;
                                data.companyId = newApartment.companyId;
                            }
                        }
                    }
                    
                    const apartmentConsumptionReport = await prisma.apartmentConsumptionReport.update({ where: { id: entityId }, data });
                    return { entity: apartmentConsumptionReport, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }
            case PermissionableEntity.reading:
                const readingPermissionInContext = await prisma.reading.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                        ]
                    },
                });
                if (readingPermissionInContext) {
                    const reading = await prisma.reading.update({ where: { id: entityId }, data });
                    return { entity: reading, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            // Reservoirs
            case PermissionableEntity.reservoir:
                const reservoirPermissionInContext = await prisma.reservoir.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { companyId: { in: contexts.companyIds } }, // Reservatórios da empresa do usuário
                            { complexId: { in: contexts.complexIds } }, // Reservatórios do condomínio do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Reservatórios de condomínios das empresas do usuário
                        ]
                    },
                });
                if (reservoirPermissionInContext) {
                    // Validar dados obrigatórios se estão sendo atualizados
                    if (data.name !== undefined && !data.name) {
                        return { entity: null, error: 'Nome é obrigatório', status: 400 };
                    }
                    if (data.type !== undefined && !data.type) {
                        return { entity: null, error: 'Tipo é obrigatório', status: 400 };
                    }
                    
                    const reservoir = await prisma.reservoir.update({ where: { id: entityId }, data });
                    return { entity: reservoir, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            case PermissionableEntity.reservoirReading:
                // Buscar o reservatório para validar permissões
                const reservoirReadingPermissionInContext = await prisma.reservoirReading.findFirst({
                    where: {
                        id: entityId,
                        reservoir: hasSystemPermission ? undefined : {
                            OR: [
                                { companyId: { in: contexts.companyIds } },
                                { complexId: { in: contexts.complexIds } },
                                { complex: { companyId: { in: contexts.companyIds } } },
                            ]
                        }
                    },
                });
                if (reservoirReadingPermissionInContext) {
                    // Validar dados obrigatórios se estão sendo atualizados
                    if (data.level !== undefined && data.level === null) {
                        return { entity: null, error: 'Nível é obrigatório', status: 400 };
                    }
                    if (data.readingDate !== undefined && !data.readingDate) {
                        return { entity: null, error: 'Data da leitura é obrigatória', status: 400 };
                    }
                    
                    // Converter timestamp se fornecido
                    if (data.readingDate) {
                        data.readingDate = new Date(data.readingDate);
                    }
                    
                    const reservoirReading = await prisma.reservoirReading.update({ where: { id: entityId }, data });
                    return { entity: reservoirReading, status: 200, error: null };
                } else {
                    return { entity: null, error: 'Não autorizado', status: 401 };
                }

            // Users and Roles
            case PermissionableEntity.user:
                // Verificar se o usuário tem permissão para atualizar usuários em qualquer contexto
                const hasUserUpdatePermission = contexts.system || 
                                               contexts.companyIds.length > 0 || 
                                               contexts.complexIds.length > 0 || 
                                               contexts.blockIds.length > 0 || 
                                               contexts.apartmentIds.length > 0;
                
                if (!hasUserUpdatePermission) return { entity: null, error: 'Não autorizado', status: 401 };
                
                // Normalizar email se estiver sendo atualizado
                if (data.email) {
                    data.email = normalizeEmail(data.email);
                }
                
                const user = await prisma.user.update({ where: { id: entityId }, data });
                return { entity: user, status: 200, error: null };
            case PermissionableEntity.role:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const role = await prisma.role.update({ where: { id: entityId }, data });
                return { entity: role, status: 200, error: null };
            case PermissionableEntity.roleAssignment:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const roleAssignment = await prisma.roleAssignment.update({ where: { id: entityId }, data });
                return { entity: roleAssignment, status: 200, error: null };
            case PermissionableEntity.permission:
                if (!hasSystemPermission) return { entity: null, error: 'Não autorizado', status: 401 };
                const permission = await prisma.permission.update({ where: { id: entityId }, data });
                return { entity: permission, status: 200, error: null };

            default:
                return { entity: null, error: 'Entidade não permitida para edição', status: 401 };
        }
    } catch (error) {
        console.error("Error updating entity data:", error);
        return { entity: null, error: 'Internal Server Error - Error updating entity data', status: 500 };
    }
}

async function deleteEntity(userId: string, entityType: PermissionableEntity, entityId: string): Promise<{ error: string | null, status: number, entity: any | null }> {
    // Prisma's middleware makes soft delete (mark as deleted) instead of hard delete (remove from database)
    try {
        const contexts = await getUserContextsForActionOnEntity(userId, entityType, 'delete');
        const hasSystemPermission = !!contexts.system;

        switch (entityType) {
            // Contexts
            case PermissionableEntity.company:
                const companyPermissionInContext = await prisma.company.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.companyIds } }, // Empresas do usuário
                        ]
                    },
                });
                if (!companyPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const company = await prisma.company.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: company }
            case PermissionableEntity.complex:
                const complexPermissionInContext = await prisma.complex.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.complexIds } }, // Condomínios diretos
                            { companyId: { in: contexts.companyIds } }, // Condomínios das empresas do usuário
                        ]
                    },
                });
                if (!complexPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const complex = await prisma.complex.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: complex }
            case PermissionableEntity.block:
                const blockPermissionInContext = await prisma.block.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.blockIds } }, // Blocos diretos
                            { complexId: { in: contexts.complexIds } }, // Blocos dentro dos condomínios do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Blocos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (!blockPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const block = await prisma.block.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: block }
            case PermissionableEntity.apartment:
                const apartmentPermissionInContext = await prisma.apartment.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                            { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                            { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                            { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (!apartmentPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const apartment = await prisma.apartment.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: apartment }

            // Meters and Devices
            case PermissionableEntity.meter:
                const meterPermissionInContext = await prisma.meter.findFirst({
                    where: {
                        id: entityId,
                        apartment: {
                            OR: hasSystemPermission ? undefined : [
                                { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                                { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                                { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                                { block: { complex: { companyId: { in: contexts.companyIds } } }, }, // Apartamentos dentro dos condomínios da empresa do usuário
                            ]
                        }
                    },
                });
                if (!meterPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const meter = await prisma.meter.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: meter }
            case PermissionableEntity.typeMeter:
                if (!hasSystemPermission) return { error: 'Não autorizado', status: 401, entity: null }
                const typeMeter = await prisma.typeMeter.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: typeMeter }
            case PermissionableEntity.iotDevice:
                // Verifica permissão via MeterDeviceLink (ligação entre device e meter)
                const iotDevicePermissionInContext = await prisma.meterDeviceLink.findFirst({
                    where: {
                        deviceId: entityId,
                        OR: [
                            { deletedAt: null },
                            { deletedAt: { isSet: false } }
                        ],
                        meter: {
                            apartment: {
                                OR: hasSystemPermission ? undefined : [
                                    { id: { in: contexts.apartmentIds } }, // Apartamentos diretos
                                    { blockId: { in: contexts.blockIds } }, // Apartamentos dentro dos blocos do usuário
                                    { block: { complexId: { in: contexts.complexIds } } }, // Apartamentos dentro dos condomínios do usuário
                                    { block: { complex: { companyId: { in: contexts.companyIds } } } }, // Apartamentos dentro dos condomínios da empresa do usuário
                                ]
                            }
                        }
                    }
                });
                if (!iotDevicePermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const iotDevice = await prisma.iotDevice.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: iotDevice }

            // Dealerships
            case PermissionableEntity.dealership:
                if (!hasSystemPermission) return { error: 'Não autorizado', status: 401, entity: null }
                const dealership = await prisma.dealership.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: dealership }

            // Readings and Reports
            case PermissionableEntity.dealershipReading:
                const dealershipReadingPermissionInContext = await prisma.dealershipReading.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { complexId: { in: contexts.complexIds } }, // Apartamentos dentro dos condomínios do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Apartamentos dentro dos condomínios da empresa do usuário
                        ]
                    },
                });
                if (!dealershipReadingPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const dealershipReading = await prisma.dealershipReading.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: dealershipReading }
            case PermissionableEntity.apartmentConsumptionReport:
                const apartmentConsumptionReportPermissionInContext = await prisma.apartmentConsumptionReport.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { apartmentId: { in: contexts.apartmentIds } }, // Apartamentos diretos (desnormalizado)
                            { blockId: { in: contexts.blockIds } }, // Blocos do usuário (desnormalizado)
                            { complexId: { in: contexts.complexIds } }, // Condomínios do usuário (desnormalizado)
                            { companyId: { in: contexts.companyIds } }, // Empresas do usuário (desnormalizado)
                        ]
                    },
                });
                if (!apartmentConsumptionReportPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const apartmentConsumptionReport = await prisma.apartmentConsumptionReport.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: apartmentConsumptionReport }

            // Reservoirs
            case PermissionableEntity.reservoir:
                const reservoirPermissionInContext = await prisma.reservoir.findFirst({
                    where: {
                        id: entityId,
                        OR: hasSystemPermission ? undefined : [
                            { companyId: { in: contexts.companyIds } }, // Reservatórios da empresa do usuário
                            { complexId: { in: contexts.complexIds } }, // Reservatórios do condomínio do usuário
                            { complex: { companyId: { in: contexts.companyIds } } }, // Reservatórios de condomínios das empresas do usuário
                        ]
                    },
                });
                if (!reservoirPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const reservoir = await prisma.reservoir.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: reservoir }

            case PermissionableEntity.reservoirReading:
                // Buscar o reservatório para validar permissões
                const reservoirReadingPermissionInContext = await prisma.reservoirReading.findFirst({
                    where: {
                        id: entityId,
                        reservoir: hasSystemPermission ? undefined : {
                            OR: [
                                { companyId: { in: contexts.companyIds } },
                                { complexId: { in: contexts.complexIds } },
                                { complex: { companyId: { in: contexts.companyIds } } },
                            ]
                        }
                    },
                });
                if (!reservoirReadingPermissionInContext) {
                    return { error: 'Não autorizado', status: 401, entity: null }
                }
                const reservoirReading = await prisma.reservoirReading.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: reservoirReading }

            // Users and Roles
            case PermissionableEntity.user:
                // Verificar se o usuário tem permissão para deletar usuários em qualquer contexto
                const hasUserDeletePermission = contexts.system || 
                                               contexts.companyIds.length > 0 || 
                                               contexts.complexIds.length > 0 || 
                                               contexts.blockIds.length > 0 || 
                                               contexts.apartmentIds.length > 0;
                
                if (!hasUserDeletePermission) return { error: 'Não autorizado', status: 401, entity: null }
                
                const user = await prisma.user.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: user }
            case PermissionableEntity.role:
                if (!hasSystemPermission) return { error: 'Não autorizado', status: 401, entity: null }
                const role = await prisma.role.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: role }
            case PermissionableEntity.roleAssignment:
                if (!hasSystemPermission) return { error: 'Não autorizado', status: 401, entity: null }
                const roleAssignment = await prisma.roleAssignment.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: roleAssignment }
            case PermissionableEntity.permission:
                if (!hasSystemPermission) return { error: 'Não autorizado', status: 401, entity: null }
                const permission = await prisma.permission.delete({ where: { id: entityId } });
                return { error: null, status: 200, entity: permission }

            default:
                return { error: 'Invalid entity type', status: 400, entity: null };
        }
    } catch (error) {
        console.error("Error deleting entity data:", error);
        return { error: 'Internal Server Error - Error deleting entity data', status: 500, entity: null };
    }
}

// Custom queries (TODO: implement skip, take, orderBy, orderByDirection)
async function findApartmentsWithMeters(userId: string, complexId: string, blockId: string, query?: string) {
    const { apartmentIds, blockIds, complexIds } = await getUserContexts(userId);

    if (apartmentIds.length === 0 && blockIds.length === 0 && complexIds.length === 0) return [];

    return await prisma.apartment.findMany({
        where: {
            OR: [
                { id: { in: apartmentIds } }, // Apartamentos diretos
                { blockId: { in: blockIds } }, // Apartamentos dentro dos blocos do usuário
                { block: { complexId: { in: complexIds } } }, // Apartamentos dentro dos condomínios do usuário
            ],
            blockId: blockId ? blockId : undefined,
            block: { complexId: complexId ? complexId : undefined },
            meters: {
                some: {
                    typeMeterId: { not: undefined }
                }
            },
            name: query ? { contains: query } : undefined,
        },
        include: {
            meters: {
                include: {
                    typeMeter: true,
                    meterDeviceLinks: {
                        where: { deletedAt: null },
                        include: {
                            device: {
                                include: {
                                    Readings: {
                                        take: 1,
                                        orderBy: { createdAt: 'desc' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
    });
}

async function reprocessDeviceReadings(
    userId: string, 
    deviceId: string
): Promise<{ success: boolean; updatedCount: number; error?: string; details?: string; status: number }> {
    try {
        // Buscar dispositivo por deviceId e verificar permissões manualmente
        const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'update');
        const hasSystemPermission = !!contexts.system;

        const device = await prisma.iotDevice.findFirst({
            where: {
                deviceId: deviceId,
                deletedAt: null,
                meterDeviceLinks: hasSystemPermission ? undefined : {
                    some: {
                        OR: [
                            { deletedAt: null },
                            { deletedAt: { isSet: false } }
                        ],
                        meter: {
                            OR: [
                                { apartmentId: { in: contexts.apartmentIds } },
                                { blockId: { in: contexts.blockIds } },
                                { complexId: { in: contexts.complexIds } },
                                { companyId: { in: contexts.companyIds } },
                            ]
                        }
                    }
                }
            }
        });
        
        if (!device) {
            return {
                success: false,
                updatedCount: 0,
                error: 'Dispositivo não encontrado ou sem permissão de acesso',
                status: 404
            };
        }

        // Usar o ReadingLinkService para fazer o reprocessamento
        const { ReadingLinkService } = await import('@/lib/services/reading-link-service');
        const result = await ReadingLinkService.reprocessDeviceReadings(userId, deviceId);

        return {
            ...result,
            status: result.success ? 200 : 400
        };
        
    } catch (error) {
        console.error('Erro ao reprocessar leituras do dispositivo:', error);
        return {
            success: false,
            updatedCount: 0,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            status: 500
        };
    }
}

async function getUnlinkedReadingsForDevice(
    userId: string,
    deviceId: string,
    options: { take?: number; skip?: number } = {}
): Promise<{ readings: any[]; totalCount: number; deviceInfo: any; error?: string; status: number }> {
    try {
        // Buscar dispositivo por deviceId e verificar permissões manualmente
        const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');
        const hasSystemPermission = !!contexts.system;

        const device = await prisma.iotDevice.findFirst({
            where: {
                deviceId: deviceId,
                deletedAt: null,
                meterDeviceLinks: hasSystemPermission ? undefined : {
                    some: {
                        OR: [
                            { deletedAt: null },
                            { deletedAt: { isSet: false } }
                        ],
                        meter: {
                            OR: [
                                { apartmentId: { in: contexts.apartmentIds } },
                                { blockId: { in: contexts.blockIds } },
                                { complexId: { in: contexts.complexIds } },
                                { companyId: { in: contexts.companyIds } },
                            ]
                        }
                    }
                }
            }
        });
        
        if (!device) {
            return {
                readings: [],
                totalCount: 0,
                deviceInfo: null,
                error: 'Dispositivo não encontrado ou sem permissão de acesso',
                status: 404
            };
        }

        // Usar o ReadingLinkService para buscar leituras desvinculadas
        const { ReadingLinkService } = await import('@/lib/services/reading-link-service');
        const result = await ReadingLinkService.getUnlinkedReadingsForDevice(userId, deviceId, options);

        return {
            ...result,
            status: 200
        };
        
    } catch (error) {
        console.error('Erro ao buscar leituras desvinculadas do dispositivo:', error);
        return {
            readings: [],
            totalCount: 0,
            deviceInfo: null,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            status: 500
        };
    }
}

async function getAllUnlinkedReadings(
    userId: string,
    options: { take?: number; skip?: number; deviceId?: string } = {}
): Promise<{ readings: any[]; totalCount: number; deviceGroups: any[]; error?: string; status: number }> {
    try {
        // Verificar permissões para leituras usando getUserContextsForActionOnEntity
        const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.reading, 'read');

        // Usar o ReadingLinkService para buscar todas as leituras desvinculadas
        const { ReadingLinkService } = await import('@/lib/services/reading-link-service');
        const result = await ReadingLinkService.getAllUnlinkedReadings(userId, options);

        return {
            ...result,
            status: 200
        };
        
    } catch (error) {
        console.error('Erro ao buscar todas as leituras desvinculadas:', error);
        return {
            readings: [],
            totalCount: 0,
            deviceGroups: [],
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            status: 500
        };
    }
}

async function getAvailableComplexesForEntity(
    userId: string,
    entityType: PermissionableEntity,
    searchTerm?: string,
    companyId?: string,
    where?: any,
    withBlocksCount?: boolean,
    withApartmentsCount?: boolean,
    withMetersCount?: boolean,
    withIotDevicesCount: boolean = false,
    onlyWithReservoirs: boolean = false,
    take?: number,
    skip?: number,
) {
    // 1. Entity > Permission > Role > RoleAssignment = Contexts (system, company, complex, block, apartment)
    const { system, companyIds, complexIds, blockIds, apartmentIds } = await getUserContextsForEntity(userId, entityType);
    const extraWhere = where ? where : {};

    // Estrutura básica sem includes pesados
    const baseSelect = {
        id: true,
        socialName: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
    }

    let finalWhere;
    
    if (system) {
        finalWhere = {
            AND: [
                {
                    socialName: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                    companyId: companyId ? companyId : undefined,
                },
                extraWhere
            ]
        }
    } else {
        if (companyIds.length === 0 && complexIds.length === 0 && blockIds.length === 0 && apartmentIds.length === 0) {
            return { list: [], totalCount: 0 };
        }

        console.warn("Contexts>:", {
            system,
            companyIds,
            complexIds,
            blockIds,
            apartmentIds,
        })

        console.warn("Contexts::", JSON.stringify({
            companyIds,
            complexIds,
            blockIds,
            apartmentIds,
        }, null, 2));

        const complexOrConditions = [
            ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
            ...(complexIds.length > 0 ? [{ id: { in: complexIds } }] : []),
            ...(blockIds.length > 0 ? [{ blocks: { some: { id: { in: blockIds } } } }] : []),
            ...(apartmentIds.length > 0 ? [{ blocks: { some: { apartments: { some: { id: { in: apartmentIds } } } } } }] : []),
        ];

        finalWhere = {
            AND: [
                {
                    OR: complexOrConditions.length > 0 ? complexOrConditions : undefined,
                    socialName: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                    companyId: companyId ? companyId : undefined,
                },
                extraWhere
            ]
        }
    }

    // Adicionar filtro de reservatórios se necessário
    if (onlyWithReservoirs) {
        if (system) {
            finalWhere.AND[0].reservoirs = { some: { deletedAt: null } };
        } else {
            finalWhere.AND[0].reservoirs = { some: { deletedAt: null } };
        }
    }

    // Query principal para buscar complexes
    console.time("getAvailableComplexesForEntity - prisma.complex.findMany");
    // Add notDeleted filter to finalWhere
    const finalWhereWithNotDeleted = cleanWhere({
        AND: [
            notDeleted,
            ...(finalWhere.AND || [finalWhere]),
        ]
    });
    const [availableComplexes, availableComplexCount] = await Promise.all([
        prisma.complex.findMany({
            where: finalWhereWithNotDeleted,
            select: baseSelect,
            take: take,
            skip: skip
        }),
        prisma.complex.count({
            where: finalWhereWithNotDeleted,
        })
    ]);
    console.timeEnd("getAvailableComplexesForEntity - prisma.complex.findMany");

    // Se não precisar dos counts, retorna direto
    if (!withBlocksCount && !withApartmentsCount && !withMetersCount) {
        return { list: availableComplexes, totalCount: availableComplexCount };
    }

    // Busca os counts separadamente de forma mais eficiente
    const complexIds_found = availableComplexes.map(c => c.id);
    
    const countsPromises = [];

    if (withBlocksCount) {
        console.time("getAvailableComplexesForEntity - blocks count");
        countsPromises.push(
            prisma.block.groupBy({
                by: ['complexId'],
                where: {
                    complexId: { in: complexIds_found },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                _count: true
            }).then(results => {
                console.timeEnd("getAvailableComplexesForEntity - blocks count");
                return results;
            })
        );
    }

    if (withApartmentsCount) {
        console.time("getAvailableComplexesForEntity - apartments count");
        countsPromises.push(
            // Busca todos os blocks dos complexes encontrados primeiro
            prisma.block.findMany({
                where: {
                    complexId: { in: complexIds_found },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: {
                    id: true,
                    complexId: true,
                    _count: {
                        select: {
                            apartments: {
                                where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                            }
                        }
                    }
                }
            }).then((blocks: any[]) => {
                console.timeEnd("getAvailableComplexesForEntity - apartments count");
                // Agora agrupamos por complexId somando os counts
                return blocks.reduce((acc, block) => {
                    const complexId = block.complexId;
                    if (complexId) {
                        acc[complexId] = (acc[complexId] || 0) + block._count.apartments;
                    }
                    return acc;
                }, {} as Record<string, number>);
            })
        );
    }

    if (withMetersCount) {
        console.time("getAvailableComplexesForEntity - meters count");
        countsPromises.push(
            // Busca todos os apartments dos complexes encontrados junto com seus meters
            prisma.block.findMany({
                where: {
                    complexId: { in: complexIds_found },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: {
                    complexId: true,
                    apartments: {
                        where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                        select: {
                            _count: {
                                select: {
                                    meters: {
                                        where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                                    }
                                }
                            }
                        }
                    }
                }
            }).then((blocks: any[]) => {
                console.timeEnd("getAvailableComplexesForEntity - meters count");
                // Agrupamos por complexId somando todos os meters dos apartments
                return blocks.reduce((acc, block) => {
                    const complexId = block.complexId;
                    if (complexId) {
                        const totalMeters = block.apartments.reduce((sum: number, apartment: any) => {
                            return sum + apartment._count.meters;
                        }, 0);
                        acc[complexId] = (acc[complexId] || 0) + totalMeters;
                    }
                    return acc;
                }, {} as Record<string, number>);
            })
        );
    }

    console.time("getAvailableComplexesForEntity - Promise.all counts");
    const counts = await Promise.all(countsPromises);
    console.timeEnd("getAvailableComplexesForEntity - Promise.all counts");

    console.time("getAvailableComplexesForEntity - final execution time");
    
    // Busca dados estruturais mínimos apenas quando necessário para criar a estrutura aninhada
    let blocksData: any[] = [];
    let apartmentsDataByBlock: Record<string, any[]> = {};
    
    if ((withBlocksCount || withApartmentsCount || withMetersCount) && counts.length > 0) {
        console.time("getAvailableComplexesForEntity - structural data");
        
        // Busca apenas os IDs e relações mínimas para estrutura
        blocksData = await prisma.block.findMany({
            where: {
                complexId: { in: complexIds_found },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: {
                id: true,
                complexId: true,
                name: true // Só para ter algum identificador, mas não é usado pela UI
            }
        });
        
        if (withApartmentsCount || withMetersCount) {
            const apartments = await prisma.apartment.findMany({
                where: {
                    blockId: { in: blocksData.map(b => b.id) },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: {
                    id: true,
                    blockId: true,
                    name: true // Só para ter algum identificador
                }
            });
            
            // Agrupa apartments por blockId
            apartmentsDataByBlock = apartments.reduce((acc, apt) => {
                if (!acc[apt.blockId]) acc[apt.blockId] = [];
                acc[apt.blockId].push(apt);
                return acc;
            }, {} as Record<string, any[]>);
        }
        
        console.timeEnd("getAvailableComplexesForEntity - structural data");
    }
    
    // Monta o resultado final com os counts e estrutura aninhada simulada
    const enrichedComplexes = availableComplexes.map(complex => {
        const result: any = { ...complex };
        
        // Inicializa _count
        result._count = result._count || {};
        
        if (withBlocksCount && counts[0]) {
            const blocksCount = (counts[0] as any[]).find(c => c.complexId === complex.id)?._count || 0;
            result._count.blocks = blocksCount;
        }
        
        // Cria a estrutura aninhada de blocks apenas se necessário
        if ((withApartmentsCount || withMetersCount) && blocksData.length > 0) {
            const complexBlocks = blocksData.filter(b => b.complexId === complex.id);
            
            result.blocks = complexBlocks.map(block => {
                const blockResult: any = {
                    id: block.id,
                    name: block.name,
                    complexId: block.complexId,
                    _count: {}
                };
                
                if (withApartmentsCount && counts[1]) {
                    // Conta apartamentos deste block
                    const blockApartments = apartmentsDataByBlock[block.id] || [];
                    blockResult._count.apartments = blockApartments.length;
                }
                
                if (withMetersCount && counts[2]) {
                    // Cria estrutura de apartments com _count.meters
                    const blockApartments = apartmentsDataByBlock[block.id] || [];
                    blockResult.apartments = blockApartments.map(apartment => ({
                        id: apartment.id,
                        name: apartment.name,
                        blockId: apartment.blockId,
                        _count: {
                            // Para calcular meters por apartment, precisamos dividir o total por apartments
                            // Mas como não temos essa informação detalhada, vamos simular
                            meters: 0 // Será calculado abaixo de forma aproximada
                        }
                    }));
                    
                    // Distribui o total de meters do complex proporcionalmente entre apartments
                    const totalMetersInComplex = (counts[2] as Record<string, number>)[complex.id] || 0;
                    const totalApartmentsInComplex = Object.values(apartmentsDataByBlock)
                        .filter(apts => apts.length > 0 && complexBlocks.some(cb => cb.id === apts[0]?.blockId))
                        .reduce((sum, apts) => sum + apts.length, 0);
                    
                    if (totalApartmentsInComplex > 0) {
                        const avgMetersPerApartment = Math.ceil(totalMetersInComplex / totalApartmentsInComplex);
                        blockResult.apartments.forEach((apt: any) => {
                            apt._count.meters = avgMetersPerApartment;
                        });
                    }
                }
                
                return blockResult;
            });
        }

        return result;
    });
    console.timeEnd("getAvailableComplexesForEntity - final execution time");

    return { list: enrichedComplexes, totalCount: availableComplexCount };
}

async function getAvailableBlocksForEntity(
    userId: string,
    entityType: PermissionableEntity,
    complexId?: string,
    complexNameSearchTerm?: string,
    searchTerm?: string,
    withComplexName?: boolean,
    where?: any,
    withApartmentsCount?: boolean,
    withMetersCount?: boolean,
) {
    // 1. Entity > Permission > Role > RoleAssignment = Contexts (system, company, complex, block, apartment)
    const { system, companyIds, complexIds, blockIds, apartmentIds } = await getUserContextsForEntity(userId, entityType);

    const extraWhere = where ? where : {};
    const include = {
        complex: withComplexName ? {
            select: {
                socialName: true,
            }
        } : undefined,
        _count: withApartmentsCount ? {
            select: {
                apartments: true,
            }
        } : undefined,
        apartments: withMetersCount ? {
            select: {
                _count: {
                    select: {
                        meters: true,
                    }
                }
            }
        } : undefined,
    }

    // 2. Get blocks that are related to the user's contexts
    if (system) {
        const availableBlocks = await prisma.block.findMany({
            where: {
                AND: [
                    notDeleted,
                    {
                        complexId: complexId ? complexId : undefined,
                        name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                        complex: complexNameSearchTerm ? {
                            socialName: { contains: complexNameSearchTerm, mode: 'insensitive' },
                        } : undefined,
                    },
                    extraWhere
                ]
            },
            include,
        })
        return { list: availableBlocks, totalCount: availableBlocks.length }
    }

    if (companyIds.length === 0 && complexIds.length === 0 && blockIds.length === 0 && apartmentIds.length === 0) return { list: [], totalCount: 0 };

    const nonSystemBlockOr = [
        ...(blockIds.length > 0 ? [{ id: { in: blockIds } }] : []),
        ...(complexIds.length > 0 ? [{ complexId: { in: complexIds } }] : []),
        ...(companyIds.length > 0 ? [{ complex: { companyId: { in: companyIds } } }] : []),
        ...(apartmentIds.length > 0 ? [{ apartments: { some: { id: { in: apartmentIds } } } }] : []),
    ];
    const availableBlocks = await prisma.block.findMany({
        where: cleanWhere({
            AND: [
                notDeleted,
                {
                    OR: nonSystemBlockOr.length > 0 ? nonSystemBlockOr : undefined,
                    complexId: complexId ? complexId : undefined,
                    name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                    complex: complexNameSearchTerm ? {
                        socialName: { contains: complexNameSearchTerm, mode: 'insensitive' },
                    } : undefined,
                },
                extraWhere
            ]
        }),
        include
    })

    return { list: availableBlocks, totalCount: availableBlocks.length };
}

async function getAvailableApartmentsForEntity(
    userId: string,
    entityType: PermissionableEntity,
    searchTerm?: string,
    // companyId?: string,
    complexId?: string,
    blockId?: string,
    apartmentId?: string,
    take?: number,
    skip?: number,
    orderBy: string = 'name',
    orderDirection: 'asc' | 'desc' = 'asc',
    include?: Prisma.ApartmentInclude | undefined,
): Promise<{ list: any[], totalCount: number }> {
    console.warn("getAvailableApartmentsForEntity called with:")

    console.log({
        userId,
        entityType,
        blockId,
        complexId,
        searchTerm,
        take,
        skip,
        orderBy,
        orderDirection,
    });

    // 1. Entity > Permission > Role > RoleAssignment = Contexts (system, company, complex, block, apartment)
    const { system, companyIds, complexIds, blockIds, apartmentIds } = await getUserContextsForEntity(userId, entityType);

    console.warn("Contexts:", {
        system,
        companyIds,
        complexIds,
        blockIds,
        apartmentIds,
    });

    // console.warn(extraWhere)

    // 2. Get apartments that are related to the user's contexts
    if (system) {
        const [availableApartments, totalCount] = await Promise.all([
            prisma.apartment.findMany({
                where: {
                    AND: [
                        notDeleted,
                        {
                            id: apartmentId ?? undefined,
                            name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                            blockId: blockId ? blockId : undefined,
                            block: {
                                complexId: complexId ? complexId : undefined,
                            },
                        },
                    ]
                },
                include: {
                    ...include,
                    _count: {
                        select: { meters: { where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } } }
                    }
                },
                orderBy: orderBy ? { [orderBy]: orderDirection } : undefined,
                take: take,
                skip: skip,
            }),
            prisma.apartment.count({
                where: {
                    AND: [
                        notDeleted,
                        {
                            id: apartmentId ?? undefined,
                            name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined,
                            blockId: blockId ? blockId : undefined,
                            block: {
                                complexId: complexId ? complexId : undefined,
                            },
                        },
                    ]
                }
            })
        ]);

        return { list: availableApartments, totalCount };
    }

    if (companyIds.length === 0 && complexIds.length === 0 && blockIds.length === 0 && apartmentIds.length === 0) return { list: [], totalCount: 0 };

    const aptOrConditions = [
        ...(apartmentIds.length > 0 ? [{ id: { in: apartmentIds } }] : []),
        ...(blockIds.length > 0 ? [{ blockId: { in: blockIds } }] : []),
        ...(complexIds.length > 0 ? [{ block: { complexId: { in: complexIds } } }] : []),
        ...(companyIds.length > 0 ? [{ block: { complex: { companyId: { in: companyIds } } } }] : []),
    ];

    const aptNonSystemWhere = cleanWhere({
        AND: [
            notDeleted,
            apartmentId ? { id: apartmentId } : {},
            { OR: aptOrConditions.length > 0 ? aptOrConditions : undefined },
            { name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined },
            { blockId: blockId ? blockId : undefined },
        ]
    });

    const [availableApartments, totalCount] = await Promise.all([
        prisma.apartment.findMany({
            where: aptNonSystemWhere,
            include: {
                ...include,
                _count: {
                    select: { meters: true }
                }
            },
            take: take,
            skip: skip,
            orderBy: { [orderBy ?? 'name']: orderDirection || 'desc' },
        }),
        prisma.apartment.count({
            where: aptNonSystemWhere,
        })
    ]);

    return { list: availableApartments, totalCount };
}

async function getAvailableCompaniesForEntity(
    userId: string,
    entityType: PermissionableEntity,
    searchTerm?: string,
    where?: any,
) {
    // 1. Entity > Permission > Role > RoleAssignment = Contexts (system, company, complex, block, apartment)
    const { system, companyIds, complexIds, blockIds, apartmentIds } = await getUserContextsForEntity(userId, entityType);
    const extraWhere = where ? where : {};

    // 2. Get companies that are related to the user's contexts
    if (system) {
        return await prisma.company.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { socialName: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined },
                            { name: searchTerm ? { contains: searchTerm, mode: 'insensitive' } : undefined },
                        ],
                    },
                    extraWhere
                ]
            },
        });
    }

    if (companyIds.length === 0 && complexIds.length === 0 && blockIds.length === 0 && apartmentIds.length === 0) return [];

    const whereCondition: any = {
        AND: [
            {
                OR: [
                    { id: { in: companyIds } }, // Empresas do usuário
                    { complexes: { some: { id: { in: complexIds } } } }, // Empresas com condomínios do usuário
                    { complexes: { some: { blocks: { some: { id: { in: blockIds } } } } } }, // Empresas com blocos do usuário
                    { complexes: { some: { blocks: { some: { apartments: { some: { id: { in: apartmentIds } } } } } } } }, // Empresas com apartamentos do usuário
                ],
            }
        ]
    };

    if (searchTerm) {
        whereCondition.AND.push({
            OR: [
                { socialName: { contains: searchTerm, mode: 'insensitive' } },
                { name: { contains: searchTerm, mode: 'insensitive' } },
            ]
        });
    }

    if (extraWhere) {
        whereCondition.AND.push(extraWhere);
    }

    let companies = await prisma.company.findMany({
        where: whereCondition,
    });

    return companies;
}

// FUNÇÕES DE PERMISSÕES (ainda em teste)
// Verifica se o usuário tem permissão para uma ação em um contexto específico
async function checkUserPermission(
    userId: string,
    contextType: ContextType,
    contextId: string,
    entity: PermissionableEntity,
    action: 'read' | 'create' | 'update' | 'delete'
): Promise<boolean> {
    // Busca todos os papéis do usuário para o contexto/contextId
    const assignments = await prisma.roleAssignment.findMany({
        where: {
            userId,
            contextType,
            contextId,
            deletedAt: null,
            Role: {
                deletedAt: null,
                permissions: {
                    some: {
                        entity,
                        action,
                        deletedAt: null,
                    },
                },
            },
        },
        include: {
            Role: {
                include: {
                    permissions: true,
                },
            },
        },
    });

    // Se encontrou algum assignment com permissão, retorna true
    return assignments.length > 0;
}
// Verifica se o usuário tem permissão para uma ação em um contexto específico ou em um de seus pais
async function checkUserPermissionOnEntityOrParent(
    userId: string,
    entityType: PermissionableEntity,
    entityId: string,
    action: 'read' | 'create' | 'update' | 'delete'
): Promise<boolean> {
    let apartmentId: string | undefined;
    let blockId: string | undefined;
    let complexId: string | undefined;
    let companyId: string | undefined;

    switch (entityType) {
        case PermissionableEntity.apartment: {
            const apartment = await prisma.apartment.findUnique({
                where: { id: entityId },
                include: { block: { include: { complex: true } } }
            });
            if (!apartment) return false;
            apartmentId = entityId;
            blockId = apartment.blockId;
            complexId = apartment.block?.complexId;
            companyId = apartment.block?.complex?.companyId ?? undefined;
            break;
        }
        case PermissionableEntity.block: {
            const block = await prisma.block.findUnique({
                where: { id: entityId },
                include: { complex: true }
            });
            if (!block) return false;
            blockId = entityId;
            complexId = block.complexId;
            companyId = block.complex?.companyId ?? undefined;
            break;
        }
        case PermissionableEntity.complex: {
            const complex = await prisma.complex.findUnique({
                where: { id: entityId }
            });
            if (!complex) return false;
            complexId = entityId;
            companyId = complex.companyId ?? undefined;
            break;
        }
        case PermissionableEntity.company:
            companyId = entityId;
            break;
        case PermissionableEntity.meter: {
            const meter = await prisma.meter.findUnique({
                where: { id: entityId },
                include: { apartment: { include: { block: { include: { complex: true } } } } }
            });
            if (!meter?.apartment) return false;
            apartmentId = meter.apartment.id;
            blockId = meter.apartment.blockId;
            complexId = meter.apartment.block?.complexId;
            companyId = meter.apartment.block?.complex?.companyId ?? undefined;
            break;
        }
        default:
            return false;
    }

    // Check permissions from lowest to highest level
    if (apartmentId && await checkUserPermission(userId, ContextType.apartment, apartmentId, entityType, action)) return true;
    if (blockId && await checkUserPermission(userId, ContextType.block, blockId, entityType, action)) return true;
    if (complexId && await checkUserPermission(userId, ContextType.complex, complexId, entityType, action)) return true;
    if (companyId && await checkUserPermission(userId, ContextType.company, companyId, entityType, action)) return true;

    return false;
}

export { getUserData, getAvailableCompaniesForEntity, getAvailableComplexesForEntity, getAvailableBlocksForEntity, getAvailableApartmentsForEntity, createEntity, getEntityData, getEntityListData, updateEntityData, deleteEntity, findApartmentsWithMeters, bulkCreateEntity, checkUserPermission, checkUserPermissionOnEntityOrParent, reprocessDeviceReadings, getUnlinkedReadingsForDevice, getAllUnlinkedReadings };