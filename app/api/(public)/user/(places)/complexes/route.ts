import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity } from "@/lib/userData"
import { getUserContexts } from "@/lib/userContexts"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { MongoClient } from "mongodb"

let mongoClient: MongoClient | null = null

function safeString(value: any, fallback = ""): string {
    if (typeof value === "string") return value
    if (value === null || value === undefined) return fallback
    try {
        return String(value)
    } catch {
        return fallback
    }
}

async function getMongoClient(): Promise<MongoClient | null> {
    try {
        if (mongoClient) return mongoClient
        const uri = process.env.DATABASE_URL
        if (!uri) return null
        mongoClient = new MongoClient(uri)
        await mongoClient.connect()
        return mongoClient
    } catch (error) {
        console.error("Falha ao conectar no MongoDB raw fallback:", error)
        return null
    }
}

function getMongoDbName(uri: string): string {
    const withoutQuery = uri.split("?")[0]
    const parts = withoutQuery.split("/")
    return parts[parts.length - 1] || "test"
}

async function listComplexesFromMongoRaw(params: {
    search: string
    take: number
    skip: number
    companyId?: string
    complexId?: string
    allowedComplexIds?: string[]
    socialNamesParam?: string[]
    withCompany?: boolean
}) {
    const client = await getMongoClient()
    const uri = process.env.DATABASE_URL
    if (!client || !uri) return null

    const db = client.db(getMongoDbName(uri))
    const complexesCol = db.collection("Complexes")

    const filter: any = {
        $and: [
            { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] }
        ]
    }
    if (params.allowedComplexIds) {
        if (params.allowedComplexIds.length === 0) {
            return { list: [], totalCount: 0 }
        }
        filter.$and.push({ _id: { $in: params.allowedComplexIds } })
    }
    if (params.companyId) filter.$and.push({ companyId: params.companyId })
    if (params.complexId) filter.$and.push({ _id: params.complexId })
    if (params.socialNamesParam && params.socialNamesParam.length > 0) {
        filter.$and.push({ socialName: { $in: params.socialNamesParam } })
    }
    if (params.search) {
        filter.$and.push({ socialName: { $regex: params.search, $options: "i" } })
    }

    const projection: any = {
        _id: 1,
        socialName: 1,
        aliasName: 1,
        documentCompany: 1,
        city: 1,
        state: 1,
        status: 1,
        telephone: 1,
        cell: 1,
        companyId: 1,
    }

    const [docs, totalCount] = await Promise.all([
        complexesCol.find(filter, { projection })
            .sort({ socialName: 1 })
            .skip(params.skip)
            .limit(params.take)
            .toArray(),
        complexesCol.countDocuments(filter),
    ])

    const list = docs.map((doc: any) => ({
        id: typeof doc._id === "string" ? doc._id : String(doc._id),
        socialName: String(doc.socialName ?? ""),
        aliasName: doc.aliasName ?? null,
        documentCompany: doc.documentCompany ?? null,
        city: doc.city ?? null,
        state: doc.state ?? null,
        status: doc.status ?? null,
        telephone: doc.telephone ?? null,
        cell: doc.cell ?? null,
        companyId: doc.companyId ?? null,
    }))

    if (!params.withCompany) return { list, totalCount }

    const companyIds = [...new Set(list.map((c: any) => c.companyId).filter(Boolean))]
    if (companyIds.length === 0) return { list, totalCount }
    const companiesCol = db.collection("Companies")
    const companies = await companiesCol.find(
        { _id: { $in: companyIds } },
        { projection: { _id: 1, name: 1, socialName: 1 } }
    ).toArray()
    const byId = new Map<string, any>()
    companies.forEach((c: any) => byId.set(typeof c._id === "string" ? c._id : String(c._id), c))
    list.forEach((cx: any) => {
        const c = byId.get(cx.companyId)
        if (c) {
            cx.company = {
                id: typeof c._id === "string" ? c._id : String(c._id),
                name: c.name ?? c.socialName ?? "",
                socialName: c.socialName ?? c.name ?? "",
            }
        }
    })

    return { list, totalCount }
}

async function listComplexesFallback(params: {
    search: string
    take: number
    skip: number
    companyId?: string
    complexId?: string
    allowedComplexIds?: string[]
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
        allowedComplexIds,
        socialNamesParam,
        withCompany,
        withBlocksCount,
        withApartmentsCount,
        withMetersCount,
        onlyWithReservoirs,
    } = params

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (allowedComplexIds) {
        if (allowedComplexIds.length === 0) {
            return { list: [], totalCount: 0 }
        }
        where.id = complexId ? complexId : { in: allowedComplexIds }
    } else if (complexId) {
        where.id = complexId
    }
    if (socialNamesParam && socialNamesParam.length > 0) where.socialName = { in: socialNamesParam }
    if (onlyWithReservoirs) where.reservoirs = { some: { deletedAt: null } }

    // Busca maior e pagina em memória para evitar falhas em count/orderBy/contains no banco
    const expandedTake = Math.min(Math.max(skip + take, 200), 5000)
    const safeSelect: any = {
        id: true,
        socialName: true,
        aliasName: true,
        documentCompany: true,
        city: true,
        state: true,
        status: true,
        telephone: true,
        cell: true,
        companyId: true,
    }
    if (withCompany) {
        safeSelect.company = {
            select: {
                id: true,
                name: true,
                socialName: true,
            }
        }
    }

    let baseList: any[] = []
    try {
        baseList = await prisma.complex.findMany({
            where,
            select: safeSelect,
            take: expandedTake,
        })
    } catch (queryError) {
        console.warn("Fallback query with safe select failed, retrying with minimal select:", queryError)
        try {
            baseList = await prisma.complex.findMany({
                where,
                select: { id: true, socialName: true, companyId: true },
                take: expandedTake,
            })
        } catch (minimalError) {
            console.error("Minimal Prisma query for complexes failed, using Mongo raw fallback:", minimalError)
            const raw = await listComplexesFromMongoRaw({
                search,
                take,
                skip,
                companyId,
                complexId,
                allowedComplexIds,
                socialNamesParam,
                withCompany,
            })
            if (raw) return raw
            throw minimalError
        }
    }

    const normalizedSearch = String(search ?? '').trim().toLowerCase()
    const filtered = normalizedSearch
        ? baseList.filter((complex: any) => String(complex?.socialName ?? "").toLowerCase().includes(normalizedSearch))
        : baseList

    filtered.sort((a: any, b: any) => String(a?.socialName ?? "").localeCompare(String(b?.socialName ?? "")))
    const paginated = filtered.slice(skip, skip + take)
    const safePaginated = paginated.map((complex: any) => ({
        ...complex,
        socialName: safeString(complex?.socialName),
        aliasName: complex?.aliasName == null ? null : safeString(complex?.aliasName),
        city: complex?.city == null ? null : safeString(complex?.city),
        state: complex?.state == null ? null : safeString(complex?.state),
        status: complex?.status == null ? null : safeString(complex?.status),
        telephone: complex?.telephone == null ? null : safeString(complex?.telephone),
        cell: complex?.cell == null ? null : safeString(complex?.cell),
        company: complex?.company
            ? {
                ...complex.company,
                name: safeString(complex.company?.name ?? complex.company?.socialName),
                socialName: safeString(complex.company?.socialName ?? complex.company?.name),
            }
            : undefined,
    }))

    if (!withBlocksCount && !withApartmentsCount && !withMetersCount) {
        return { list: safePaginated, totalCount: filtered.length }
    }

    const complexIds = safePaginated.map((c: any) => c.id)
    if (complexIds.length === 0) {
        return { list: safePaginated, totalCount: filtered.length }
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

    const enriched = safePaginated.map((complex: any) => {
        const result: any = { ...complex }
        const cBlocks = blocksByComplex.get(complex.id) || []
        result._count = result._count || {}
        if (withBlocksCount) result._count.blocks = cBlocks.length

        if (withApartmentsCount || withMetersCount) {
            result.blocks = cBlocks.map((block: any) => {
                const bApts = apartmentsByBlock.get(block.id) || []
                const blockResult: any = {
                    id: block.id,
                    name: safeString(block.name),
                    complexId: block.complexId,
                    _count: { apartments: withApartmentsCount ? bApts.length : 0 },
                }
                if (withMetersCount) {
                    blockResult.apartments = bApts.map((apt: any) => ({
                        id: apt.id,
                        name: safeString(apt.name),
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

async function resolveAllowedComplexIdsForUser(userId: string): Promise<string[] | undefined> {
    const contexts = await getUserContexts(userId)
    if (contexts.system) return undefined

    const allowedSet = new Set<string>()
    contexts.complexIds.forEach((id) => id && allowedSet.add(id))

    if (contexts.companyIds.length > 0) {
        const companyComplexes = await prisma.complex.findMany({
            where: {
                companyId: { in: contexts.companyIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { id: true },
            take: 5000,
        })
        companyComplexes.forEach((cx) => cx.id && allowedSet.add(cx.id))
    }

    if (contexts.blockIds.length > 0) {
        const blocks = await prisma.block.findMany({
            where: {
                id: { in: contexts.blockIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { complexId: true },
            take: 5000,
        })
        blocks.forEach((b) => b.complexId && allowedSet.add(b.complexId))
    }

    if (contexts.apartmentIds.length > 0) {
        const apartments = await prisma.apartment.findMany({
            where: {
                id: { in: contexts.apartmentIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { complexId: true },
            take: 20000,
        })
        apartments.forEach((a) => a.complexId && allowedSet.add(a.complexId))
    }

    return [...allowedSet]
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

        // Aplica escopo de acesso para perfis não-sistema
        const allowedComplexIds = await resolveAllowedComplexIdsForUser(userId)
        if (allowedComplexIds) {
            if (allowedComplexIds.length === 0) {
                return NextResponse.json({ list: [], totalCount: 0 })
            }
            if (complexId && !allowedComplexIds.includes(complexId)) {
                return NextResponse.json({ error: 'Não autorizado para este condomínio.' }, { status: 403 })
            }
        }

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
            allowedComplexIds,
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
            const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req)
            if (sessionError || !userId) return NextResponse.json({ error: 'Não autorizado' }, { status: sessionStatus || 401 })
            const allowedComplexIds = await resolveAllowedComplexIdsForUser(userId)
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
                allowedComplexIds,
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
