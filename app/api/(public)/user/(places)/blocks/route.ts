import { serverError } from '@/lib/safeError';
import prisma from '@/lib/prisma';
import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableBlocksForEntity, getEntityListData, updateEntityData, bulkCreateEntity } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const withComplexName = req.nextUrl.searchParams.get('with_complex_name') === 'true' ? true : false
    const complexSocialNameSearchTerm = req.nextUrl.searchParams.get('complex_social_name') || undefined
    const withApartmentsCount = req.nextUrl.searchParams.get('with_apartments_count') === 'true' ? true : false
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') === 'true' ? true : false

    // option - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    console.log("############################################### getAvailableForEntity in block query:", getAvailableForEntity)

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { withApartmentsCount, withMetersCount, getAvailableForEntity, withComplexName, complexSocialNameSearchTerm, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // get query params
        const { withApartmentsCount, withMetersCount, getAvailableForEntity, companyId, complexId, blockId, apartmentId, complexSocialNameSearchTerm, search, take, withComplexName, skip, orderBy, orderDirection } = getQueryParams(req)


        // identify context
        const contextType: ContextType | undefined = complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'complex' ? complexId : contextType === 'company' ? companyId : undefined

        const where = {
            id: blockId || undefined,
            complex: {
                socialName: complexSocialNameSearchTerm || undefined
            }
        }

        console.log("getAvailableForEntity:", getAvailableForEntity)
        // return available blocks for entity if requested
        if (getAvailableForEntity) {
            const availableBlocks = await getAvailableBlocksForEntity(userId, getAvailableForEntity, complexId, search, search, withComplexName, where, withApartmentsCount, withMetersCount)
            return NextResponse.json(availableBlocks)
        }

        const include = withComplexName ? {
            complex: {
                select: {
                    socialName: true,
                    id: true,
                },
            }
        } : undefined

        console.log("######### Blocks - Include:", include)

        // get blocks
        const { entity, error, status, totalCount } = await getEntityListData(userId, 'block', contextType, contextId, search, where, take, include)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'No blocks found.' }, { status: 404 })

        return NextResponse.json({ list: entity, totalCount: totalCount })

    } catch (error: any) {
        console.error("[blocks/GET] Error fetching blocks:", error)
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Parse request body
        let reqBody = await req.json();

        // Se vier como string JSON, converte para objeto
        if (typeof reqBody === "string") {
            try {
                reqBody = JSON.parse(reqBody);
            } catch (e) {
                return NextResponse.json({ error: 'Corpo da requisição inválido (JSON malformado).' }, { status: 400 });
            }
        }

        // Novo: suporte a cadastro em lote
        if (Array.isArray(reqBody) && reqBody.length > 0) {
            console.warn("Novo: Cadastro em lote de blocos detectado.");
            if (!Array.isArray(reqBody) || reqBody.length === 0) {
                return NextResponse.json({ error: 'Nenhum bloco informado.' }, { status: 400 });
            }
            
            // Validação mínima: name (string) e complexId
            const errors: { index: number, error: string }[] = [];
            const validBlocks = [];
            
            // Busca todos os complexIds únicos de uma vez
            const uniqueComplexIds = [...new Set(reqBody.map(block => block.complexId).filter(Boolean))];
            const existingComplexes = await prisma.complex.findMany({
                where: { id: { in: uniqueComplexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                select: { id: true }
            });
            const existingComplexIds = new Set(existingComplexes.map(c => c.id));
            
            for (let i = 0; i < reqBody.length; i++) {
                const block = cleanEntityBody(reqBody[i]);
                // Garante que name seja string
                block.name = typeof block.name === 'string' ? block.name.trim() : String(block.name ?? '').trim();
                if (!block.name || !block.complexId) {
                    errors.push({ index: i, error: 'Nome e condomínio (complexId) são obrigatórios.' });
                    continue;
                }
                console.log("Novo: Validando bloco:", block);
                // Verifica se o condomínio existe usando o cache
                if (!existingComplexIds.has(block.complexId)) {
                    errors.push({ index: i, error: 'Condomínio não encontrado.' });
                    continue;
                }
                // Permitir status customizado
                if (block.status && ["Ativo", "Inativo"].includes(block.status)) {
                    // ok
                } else {
                    block.status = "Ativo";
                }
                validBlocks.push(block);
            }
            if (errors.length > 0) {
                return NextResponse.json({ error: 'Falha na validação de um ou mais blocos.', details: errors }, { status: 400 });
            }
            console.log("Novo: Blocos válidos para cadastro:", validBlocks);
            try {
                const { entity, error, status } = await bulkCreateEntity(userId, 'block', validBlocks);
                if (error || !entity) {
                    return NextResponse.json({ error: error || 'Erro ao cadastrar blocos.' }, { status: status || 500 });
                }
                return NextResponse.json({ success: true, count: validBlocks.length, entity: entity || [] });
            } catch (e) {
                console.error('Erro inesperado no bulkCreateEntity:', e);
                return serverError('blocks/bulk-create', e);
            }
        }

        // ...caminho antigo (cadastro individual)...
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        // Validate required fields for block
        body.name = String(body.name ?? '').trim();
        if (!body.name || !body.complexId) {
            return NextResponse.json({ error: 'Nome e condomínio (complexId) são obrigatórios.' }, { status: 400 });
        }

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'block', body);

        // Error handling
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("[blocks/POST] Error creating block:", error);
        const msg = error?.message || 'Erro interno ao criar bloco.';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}