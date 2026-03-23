import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getUserContextsForEntity } from "@/lib/userContexts"
import { cleanWhere } from "@/lib/utils"

function getQueryParams(req: NextRequest) {
    // parâmetros de consulta - customizados
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const withCompany = req.nextUrl.searchParams.get('with_company') === 'true'
    const withBlocksCount = req.nextUrl.searchParams.get('with_blocks_count') === 'true'
    const withApartmentsCount = req.nextUrl.searchParams.get('with_apartments_count') === 'true'
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') === 'true'
    const onlyWithReservoirs = req.nextUrl.searchParams.get('onlyWithReservoirs') === 'true'
    const socialNames = req.nextUrl.searchParams.get('socialNames') || '[]'

    // opção - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    // parâmetros de consulta - padrão
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '12')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { socialNames, withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

const activeWhere = {
    OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
    ],
}

function normalizeText(value: string | null | undefined): string {
    if (value === null || value === undefined) return ''
    const text = String(value)
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

async function fallbackFetchComplexes({
    userId,
    search,
    companyId,
    complexId,
    socialNames,
    withCompany,
    withBlocksCount,
    withApartmentsCount,
    withMetersCount,
    onlyWithReservoirs,
    take,
    skip,
    orderBy,
    orderDirection,
}: {
    userId: string
    search?: string
    companyId?: string
    complexId?: string
    socialNames?: string[]
    withCompany?: boolean
    withBlocksCount?: boolean
    withApartmentsCount?: boolean
    withMetersCount?: boolean
    onlyWithReservoirs?: boolean
    take?: number
    skip?: number
    orderBy?: string
    orderDirection?: string
}) {
    const contexts = await getUserContextsForEntity(userId, 'complex')
    const accessOr = contexts.system ? undefined : [
        ...(contexts.complexIds.length > 0 ? [{ id: { in: contexts.complexIds } }] : []),
        ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
        ...(contexts.blockIds.length > 0 ? [{ blocks: { some: { id: { in: contexts.blockIds } } } }] : []),
        ...(contexts.apartmentIds.length > 0 ? [{ blocks: { some: { apartments: { some: { id: { in: contexts.apartmentIds } } } } } }] : []),
    ]

    if (!contexts.system && (!accessOr || accessOr.length === 0)) {
        return { list: [], totalCount: 0 }
    }

    const requestedTake = typeof take === 'number' && take > 0 ? take : 12
    const requestedSkip = typeof skip === 'number' && skip >= 0 ? skip : 0

    const where = cleanWhere({
        AND: [
            activeWhere,
            complexId ? { id: complexId } : undefined,
            companyId ? { companyId } : undefined,
            socialNames && socialNames.length > 0 ? { socialName: { in: socialNames } } : undefined,
            search ? {
                OR: [
                    { socialName: { contains: search, mode: 'insensitive' } },
                    { aliasName: { contains: search, mode: 'insensitive' } },
                ]
            } : undefined,
            onlyWithReservoirs ? { reservoirs: { some: activeWhere } } : undefined,
            !contexts.system ? { OR: accessOr } : undefined,
        ]
    })

    const include = withCompany ? {
        company: {
            select: {
                id: true,
                name: true,
            },
        }
    } : undefined

    const safeOrderBy = ['socialName', 'createdAt', 'updatedAt'].includes(orderBy || '') ? orderBy : 'socialName'
    const safeOrderDirection: 'asc' | 'desc' = orderDirection === 'asc' ? 'asc' : 'desc'

    const [baseList, baseTotalCount] = await Promise.all([
        prisma.complex.findMany({
            where,
            include,
            take: requestedTake,
            skip: requestedSkip,
            orderBy: { [safeOrderBy || 'socialName']: safeOrderDirection },
        }),
        prisma.complex.count({ where }),
    ])

    let list = baseList
    let totalCount = baseTotalCount

    // Fallback tolerante a acentos/caracteres:
    // só ativa quando a busca contém caracteres não ASCII e não houver resultado.
    const hasNonAsciiSearch = /[^\x00-\x7F]/.test(search || '')
    if (search && hasNonAsciiSearch && baseList.length === 0) {
        const normalizedSearch = normalizeText(search)
        const broadWhere = cleanWhere({
            AND: [
                activeWhere,
                complexId ? { id: complexId } : undefined,
                companyId ? { companyId } : undefined,
                socialNames && socialNames.length > 0 ? { socialName: { in: socialNames } } : undefined,
                onlyWithReservoirs ? { reservoirs: { some: activeWhere } } : undefined,
                !contexts.system ? { OR: accessOr } : undefined,
            ]
        })

        const broadList = await prisma.complex.findMany({
            where: broadWhere,
            include,
            take: 4000,
            skip: 0,
            orderBy: { [safeOrderBy || 'socialName']: safeOrderDirection },
        })

        const normalizedFiltered = broadList.filter((complex: any) => {
            const socialNameNorm = normalizeText(complex?.socialName)
            const aliasNameNorm = normalizeText(complex?.aliasName)
            return socialNameNorm.includes(normalizedSearch) || aliasNameNorm.includes(normalizedSearch)
        })

        totalCount = normalizedFiltered.length
        list = normalizedFiltered.slice(requestedSkip, requestedSkip + requestedTake)
    }

    if (!withBlocksCount && !withApartmentsCount && !withMetersCount) {
        return { list, totalCount }
    }

    const ids = list.map((c) => c.id)
    if (ids.length === 0) {
        return { list, totalCount }
    }

    let blocksGrouped: Array<{ complexId: string | null; _count: { id: number } }> = []
    let apartmentsGrouped: Array<{ complexId: string | null; _count: { id: number } }> = []
    let metersGrouped: Array<{ complexId: string | null; _count: { id: number } }> = []
    try {
        [blocksGrouped, apartmentsGrouped, metersGrouped] = await Promise.all([
            withBlocksCount
                ? prisma.block.groupBy({
                    by: ['complexId'],
                    where: { complexId: { in: ids }, ...activeWhere },
                    _count: { id: true },
                })
                : Promise.resolve([] as Array<{ complexId: string | null; _count: { id: number } }>),
            withApartmentsCount
                ? prisma.apartment.groupBy({
                    by: ['complexId'],
                    where: { complexId: { in: ids }, ...activeWhere },
                    _count: { id: true },
                })
                : Promise.resolve([] as Array<{ complexId: string | null; _count: { id: number } }>),
            withMetersCount
                ? prisma.meter.groupBy({
                    by: ['complexId'],
                    where: { complexId: { in: ids }, ...activeWhere },
                    _count: { id: true },
                })
                : Promise.resolve([] as Array<{ complexId: string | null; _count: { id: number } }>),
        ])
    } catch (countError) {
        console.error('Erro ao calcular contagens de complexos (fallback):', countError)
    }

    const blocksMap: Record<string, number> = {}
    const apartmentsMap: Record<string, number> = {}
    const metersMap: Record<string, number> = {}
    blocksGrouped.forEach((r) => { if (r.complexId) blocksMap[r.complexId] = r._count.id })
    apartmentsGrouped.forEach((r) => { if (r.complexId) apartmentsMap[r.complexId] = r._count.id })
    metersGrouped.forEach((r) => { if (r.complexId) metersMap[r.complexId] = r._count.id })

    const enriched = list.map((complex: any) => ({
        ...complex,
        _count: {
            ...(complex._count || {}),
            blocks: blocksMap[complex.id] ?? 0,
        },
        totalApartments: apartmentsMap[complex.id] ?? 0,
        totalMeters: metersMap[complex.id] ?? 0,
    }))

    return { list: enriched, totalCount }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        console.log("######### Requisição GET de Complexos recebida")
        // valida sessão do usuário (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // obtém parâmetros de consulta
        const { withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection, socialNames } = getQueryParams(req)

        // Novo: busca por múltiplos socialNames
        let socialNamesParam: string[] | undefined = undefined;
        try {
            const parsed = socialNames ? JSON.parse(socialNames) : undefined;
            socialNamesParam = Array.isArray(parsed) ? parsed : undefined;
        } catch {
            socialNamesParam = undefined;
        }
        
        // Usa caminho robusto único para evitar regressões do endpoint de condomínios.
        const { list, totalCount } = await fallbackFetchComplexes({
            userId,
            search,
            companyId,
            complexId,
            socialNames: socialNamesParam,
            withCompany,
            withBlocksCount,
            withApartmentsCount,
            withMetersCount,
            onlyWithReservoirs,
            take,
            skip,
            orderBy,
            orderDirection,
        })
        return NextResponse.json({ list, totalCount })

    } catch (error: any) {
        console.error("Erro ao buscar complexos:", error)
        // Última barreira: evita 500 quebrando telas de seleção/filtro.
        return NextResponse.json({ list: [], totalCount: 0, error: error?.message || 'Erro interno do servidor' }, { status: 200 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Valida sessão do usuário
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Faz o parse do corpo da requisição
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Limpa o corpo para remover campos indesejados

        // Valida corpo da requisição
        if (!body) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });

        console.warn("######### Criando complexo com corpo:", body);

        // Tenta criar a entidade
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'complex', body);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Erro interno do servidor - Entidade não criada' }, { status: 500 });

        // Retorna os dados da entidade criada
        return NextResponse.json(entity);

    } catch (error: any) {
        // Loga e trata erros inesperados
        console.error("Erro ao criar complexo:", error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
