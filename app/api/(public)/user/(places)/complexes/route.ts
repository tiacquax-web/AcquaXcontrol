import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { Complex, ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // parâmetros de consulta - customizados
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const withCompany = req.nextUrl.searchParams.get('with_company') || undefined
    const withBlocksCount = req.nextUrl.searchParams.get('with_blocks_count') || false
    const withApartmentsCount = req.nextUrl.searchParams.get('with_apartments_count') || false
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') || false
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

        // retorna complexos disponíveis para entidade se solicitado
        if (getAvailableForEntity) {
            console.log("######### Buscando complexos disponíveis para entidade:", getAvailableForEntity)
            const { list, totalCount } = await getAvailableComplexesForEntity(userId, getAvailableForEntity, search, companyId, where, !!withBlocksCount, !!withApartmentsCount, !!withMetersCount, false, onlyWithReservoirs, take, skip)
            return NextResponse.json({ list, totalCount })
        }
        
        const { entity, error, status, totalCount } = await getEntityListData(userId, 'complex', contextType, contextId, search, where, take, include, skip)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Erro interno do servidor - Entidade não encontrada' }, { status: 500 })

        console.log("######### Complexos encontrados:", entity.length)

        return NextResponse.json({ list: entity, totalCount: totalCount ?? entity.length })

    } catch (error: any) {
        console.error("Erro ao buscar complexos:", error)
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
