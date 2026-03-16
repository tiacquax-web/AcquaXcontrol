import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, getAvailableComplexesForEntity } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getUserContextsForActionOnEntity } from "@/lib/userContexts"
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
    const socialNames = req.nextUrl.searchParams.get('socialNames') || undefined

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
        const { withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, search, take, skip, socialNames } = getQueryParams(req)

        // Novo: busca por múltiplos socialNames (com parse seguro)
        let socialNamesParam: string[] | undefined = undefined;
        if (socialNames) {
            try {
                const parsed = JSON.parse(socialNames);
                if (Array.isArray(parsed)) {
                    socialNamesParam = parsed.filter((item) => typeof item === "string");
                }
            } catch {
                return NextResponse.json({ error: 'Parâmetro "socialNames" inválido.' }, { status: 400 });
            }
        }
        
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
            const where = complexId
                ? { id: complexId }
                : (socialNamesParam && socialNamesParam.length > 0 ? { socialName: { in: socialNamesParam } } : undefined)
            const { list, totalCount } = await getAvailableComplexesForEntity(userId, getAvailableForEntity, search, companyId, where, !!withBlocksCount, !!withApartmentsCount, !!withMetersCount, false, onlyWithReservoirs, take, skip)
            return NextResponse.json({ list, totalCount })
        }

        // Consulta direta para evitar 500 no filtro de condomínio da tela de apartamentos
        const contexts = await getUserContextsForActionOnEntity(userId, 'complex', 'read');
        const hasSystemPermission = !!contexts.system;
        const permissionOr = [
            ...(contexts.complexIds.length > 0 ? [{ id: { in: contexts.complexIds } }] : []),
            ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
        ];
        const accessFilter = hasSystemPermission
            ? undefined
            : (permissionOr.length > 0 ? { OR: permissionOr } : { id: '__no_access__' });

        const where = cleanWhere({
            AND: [
                {
                    OR: [
                        { deletedAt: null },
                        { deletedAt: { isSet: false } },
                    ]
                },
                search ? { socialName: { contains: search } } : undefined,
                complexId ? { id: complexId } : undefined,
                companyId ? { companyId } : undefined,
                socialNamesParam && socialNamesParam.length > 0 ? { socialName: { in: socialNamesParam } } : undefined,
                accessFilter,
            ]
        });

        const list = await prisma.complex.findMany({
            where,
            include,
            take: take < 200 ? take : 200,
            skip: skip > 0 ? skip : 0,
            orderBy: { socialName: 'asc' },
        });
        const totalCount = await prisma.complex.count({ where });

        console.log("######### Complexos encontrados:", list.length)

        return NextResponse.json({ list, totalCount })

    } catch (error: unknown) {
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

    } catch (error: unknown) {
        // Loga e trata erros inesperados
        console.error("Erro ao criar complexo:", error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
