import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { Complex, ContextType } from "@prisma/client"
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
}) {
    const { search, take, skip, companyId, complexId, socialNamesParam, withCompany } = params
    const where: any = {}
    if (companyId) where.companyId = companyId
    if (complexId) where.id = complexId
    if (socialNamesParam && socialNamesParam.length > 0) where.socialName = { in: socialNamesParam }

    // Busca maior e pagina em memória para evitar falhas em count/orderBy/contains no banco
    const expandedTake = Math.min(Math.max(skip + take, 50), 2000)
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
    const list = filtered.slice(skip, skip + take)
    return { list, totalCount: filtered.length }
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
        const { withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection, socialNames } = getQueryParams(req)

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
        
        // identifica contexto
        const contextType: ContextType | undefined = companyId ? 'company' : undefined
        const contextId = companyId ? companyId : undefined

        const where = complexId ? { id: complexId } : (socialNamesParam && Array.isArray(socialNamesParam) && socialNamesParam.length > 0 ? { socialName: { in: socialNamesParam } } : undefined);

        const include = withCompany ? {
            company: {
                select: {
                    id: true,
                    name: true,
                },
            }
        } : undefined

        // Fast path para combobox/filtros (sem contagens pesadas): evita 500 em seletores de condomínio
        if (!withBlocksCount && !withApartmentsCount && !withMetersCount) {
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
        }

        // retorna complexos disponíveis para entidade se solicitado
        if (getAvailableForEntity) {
            console.log("######### Buscando complexos disponíveis para entidade:", getAvailableForEntity)
            try {
                const { list, totalCount } = await getAvailableComplexesForEntity(
                    userId,
                    getAvailableForEntity,
                    search,
                    companyId,
                    where,
                    withBlocksCount,
                    withApartmentsCount,
                    withMetersCount,
                    false,
                    onlyWithReservoirs,
                    take,
                    skip
                )
                return NextResponse.json({ list, totalCount })
            } catch (availableError) {
                console.error("Falha ao buscar complexos por disponibilidade, aplicando fallback:", availableError)
                const fallback = await getEntityListData(userId, 'complex', contextType, contextId, search, where, take, include, skip)
                if (fallback.error || !fallback.entity) {
                    console.warn("Fallback com contexto também falhou; aplicando fallback direto de banco.")
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
                }
                return NextResponse.json({ list: fallback.entity, totalCount: fallback.totalCount ?? fallback.entity.length })
            }
        }
        
        const { entity, error, status, totalCount } = await getEntityListData(userId, 'complex', contextType, contextId, search, where, take, include, skip)
        if (error || !entity) {
            console.warn("Consulta principal de complexos falhou; aplicando fallback direto de banco.", { error, status })
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
        }

        console.log("######### Complexos encontrados:", entity.length)

        return NextResponse.json({ list: entity, totalCount: totalCount ?? entity.length })

    } catch (error: any) {
        console.error("Erro ao buscar complexos:", error)
        try {
            const { withCompany, companyId, complexId, search, take, skip, socialNames } = getQueryParams(req)
            let socialNamesParam: string[] | undefined
            if (socialNames) {
                try {
                    const parsed = JSON.parse(socialNames)
                    if (Array.isArray(parsed)) socialNamesParam = parsed
                } catch (_e) {
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
