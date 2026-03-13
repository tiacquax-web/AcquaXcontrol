import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

async function listComplexesFallback(params: {
    search: string
    take: number
    skip: number
    companyId?: string
    complexId?: string
    socialNamesParam?: string[]
    withCompany?: boolean
    withBlocksCount?: boolean
    withApartmentsCount?: boolean
    withMetersCount?: boolean
    onlyWithReservoirs?: boolean
}) {
    const {
        search,
        take,
        skip,
        companyId,
        complexId,
        socialNamesParam,
        withCompany,
        withBlocksCount,
        withApartmentsCount,
        withMetersCount,
        onlyWithReservoirs,
    } = params

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (complexId) where.id = complexId
    if (socialNamesParam && socialNamesParam.length > 0) where.socialName = { in: socialNamesParam }
    if (onlyWithReservoirs) where.reservoirs = { some: { deletedAt: null } }

    // Busca maior e pagina em memória para evitar falhas em count/orderBy/contains no banco
    const expandedTake = Math.min(Math.max(skip + take, 200), 5000)
    const include = withCompany ? { company: { select: { id: true, name: true } } } : undefined

    let baseList: any[] = []
    try {
        baseList = await prisma.complex.findMany({
            where,
            include,
            take: expandedTake,
        })
    } catch (queryError) {
        console.warn("Fallback query with include failed, retrying without include:", queryError)
        baseList = await prisma.complex.findMany({
            where,
            take: expandedTake,
        })
    }

    const normalizedSearch = search.trim().toLowerCase()
    const filtered = normalizedSearch
        ? baseList.filter((complex: any) => (complex?.socialName || "").toLowerCase().includes(normalizedSearch))
        : baseList

    filtered.sort((a: any, b: any) => (a?.socialName || "").localeCompare(b?.socialName || ""))
    const paginated = filtered.slice(skip, skip + take)

    if (!withBlocksCount && !withApartmentsCount && !withMetersCount) {
        return { list: paginated, totalCount: filtered.length }
    }

    const complexIds = paginated.map((c: any) => c.id)
    if (complexIds.length === 0) {
        return { list: paginated, totalCount: filtered.length }
    }

    const blocks = await prisma.block.findMany({
        where: { complexId: { in: complexIds }, deletedAt: null },
        select: { id: true, complexId: true, name: true },
        take: 20000,
    })

    const apartments = (withApartmentsCount || withMetersCount)
        ? await prisma.apartment.findMany({
            where: { complexId: { in: complexIds }, deletedAt: null },
            select: { id: true, blockId: true, complexId: true, name: true },
            take: 50000,
        })
        : []

    const meters = withMetersCount
        ? await prisma.meter.findMany({
            where: { complexId: { in: complexIds }, deletedAt: null },
            select: { id: true, apartmentId: true, complexId: true },
            take: 200000,
        })
        : []

    const blocksByComplex = new Map<string, any[]>()
    blocks.forEach((b) => {
        const arr = blocksByComplex.get(b.complexId) || []
        arr.push(b)
        blocksByComplex.set(b.complexId, arr)
    })

    const apartmentsByBlock = new Map<string, any[]>()
    apartments.forEach((a) => {
        const arr = apartmentsByBlock.get(a.blockId) || []
        arr.push(a)
        apartmentsByBlock.set(a.blockId, arr)
    })

    const meterCountByApartment = new Map<string, number>()
    meters.forEach((m) => {
        const key = m.apartmentId || ''
        if (!key) return
        meterCountByApartment.set(key, (meterCountByApartment.get(key) || 0) + 1)
    })

    const enriched = paginated.map((complex: any) => {
        const result: any = { ...complex }
        const cBlocks = blocksByComplex.get(complex.id) || []
        result._count = result._count || {}
        if (withBlocksCount) result._count.blocks = cBlocks.length

        if (withApartmentsCount || withMetersCount) {
            result.blocks = cBlocks.map((block: any) => {
                const bApts = apartmentsByBlock.get(block.id) || []
                const blockResult: any = {
                    id: block.id,
                    name: block.name,
                    complexId: block.complexId,
                    _count: { apartments: withApartmentsCount ? bApts.length : 0 },
                }
                if (withMetersCount) {
                    blockResult.apartments = bApts.map((apt: any) => ({
                        id: apt.id,
                        name: apt.name,
                        blockId: apt.blockId,
                        _count: { meters: meterCountByApartment.get(apt.id) || 0 },
                    }))
                }
                return blockResult
            })
        }
        return result
    })

    return { list: enriched, totalCount: filtered.length }
}

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
    const takeRaw = parseInt(req.nextUrl.searchParams.get('take') || '12')
    const skipRaw = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, 500) : 12
    const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { socialNames, withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        console.log("######### Requisição GET de Complexos recebida")
        // valida sessão do usuário (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // obtém parâmetros de consulta
        const {
            withBlocksCount,
            withApartmentsCount,
            withMetersCount,
            onlyWithReservoirs,
            withCompany,
            companyId,
            complexId,
            search,
            take,
            skip,
            socialNames
        } = getQueryParams(req)

        // Novo: busca por múltiplos socialNames (parse resiliente para evitar 500 em query inválida)
        let socialNamesParam: string[] | undefined;
        if (socialNames) {
            try {
                const parsed = JSON.parse(socialNames);
                if (Array.isArray(parsed)) socialNamesParam = parsed;
            } catch (parseError) {
                console.warn("socialNames inválido recebido na query:", socialNames, parseError);
                socialNamesParam = undefined;
            }
        }
        
        const direct = await listComplexesFallback({
            search,
            take,
            skip,
            companyId,
            complexId,
            socialNamesParam,
            withCompany,
            withBlocksCount,
            withApartmentsCount,
            withMetersCount,
            onlyWithReservoirs,
        })
        return NextResponse.json(direct)

    } catch (error: any) {
        console.error("Erro ao buscar complexos:", error)
        try {
            const { withCompany, companyId, complexId, search, take, skip, socialNames } = getQueryParams(req)
            let socialNamesParam: string[] | undefined
            if (socialNames) {
                try {
                    const parsed = JSON.parse(socialNames)
                    if (Array.isArray(parsed)) socialNamesParam = parsed
                } catch {
                    socialNamesParam = undefined
                }
            }
            const direct = await listComplexesFallback({
                search,
                take,
                skip,
                companyId,
                complexId,
                socialNamesParam,
                withCompany,
            })
            return NextResponse.json(direct)
        } catch (fallbackError) {
            console.error("Fallback final de complexos também falhou:", fallbackError)
        }
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
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
