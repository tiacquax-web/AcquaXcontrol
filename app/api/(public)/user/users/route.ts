import prisma, { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { createUser, createBulkResidentsUsers, isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

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

function getQueryParams(req: NextRequest) {
    // query params - custom
    const userId = req.nextUrl.searchParams.get('id') || undefined
    const roleName = req.nextUrl.searchParams.get('role_name') || undefined
    const excludeRole = req.nextUrl.searchParams.get('exclude_role') || undefined
    const contextType = req.nextUrl.searchParams.get('role_context_type') || undefined
    const contextId = req.nextUrl.searchParams.get('role_context_id') || undefined

    // option - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { getAvailableForEntity, userId, roleName, excludeRole, contextType, contextId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        // get userId from session
        const userId = validSession.userId

        // get query params
        const { userId: searchUserId, search, take, contextId: roleContextId, contextType: roleContextType, roleName, excludeRole, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType: ContextType | undefined = undefined
        const contextId = undefined

        // extra where
        const where: any = {
            id: searchUserId ?? undefined,
            Roles: !roleName ? undefined : {
                some: {
                    Role: {
                        name: roleName ?? undefined,
                    },
                    OR: [
                        { contextId: roleContextType === ContextType.complex ? roleContextId : undefined },
                        { complex: { companyId: roleContextType === ContextType.company ? roleContextId : undefined } }
                    ]
                }
            }
        }

        // Exclude users with specific role (e.g., exclude Moradores)
        if (excludeRole) {
            where.NOT = {
                Roles: {
                    some: {
                        Role: { name: excludeRole, deletedAt: null },
                        deletedAt: null,
                    }
                }
            }
        }

        // get users
        const { entity, error, status, totalCount } = await getEntityListData(userId, 'user', contextType, contextId, search, where, take, {}, skip, orderBy, orderDirection as 'asc' | 'desc')
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 })

        console.log("######### Users found:", entity.length, "Total:", totalCount)

        return NextResponse.json({ 
            list: entity, 
            totalCount: totalCount || entity.length,
            hasNextPage: skip + take < (totalCount || entity.length),
            hasPreviousPage: skip > 0
        })

    } catch (error: any) {
        console.error("Error fetching users:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();
        // Suporte à criação em massa de usuários para um condomínio
        if (reqBody.createBulkUsersForComplex) {
            const { complexId, userNamePrefix, userPasswordPrefix, userEmailPrefix, userEmailDomain } = reqBody;
            if (!complexId || !userNamePrefix || !userPasswordPrefix || !userEmailPrefix || !userEmailDomain) {
                return NextResponse.json({ error: 'Parâmetros obrigatórios para criação em massa não informados.' }, { status: 400 });
            }

            // 1. Buscar todos os apartamentos do condomínio
            const blocks = await prisma.block.findMany({
                where: { complexId, deletedAt: null },
                include: {
                    apartments: { where: { deletedAt: null } },
                },
            });
            const allApartments = blocks.flatMap(block => block.apartments.map(ap => ({ block, apartment: ap })));
            const totalApartments = allApartments.length;
            
            if (!totalApartments) {
                return NextResponse.json({ error: 'Nenhum bloco/apartamento encontrado para este condomínio.' }, { status: 404 });
            }

            // 2. Verificar se já existe algum usuário associado ao condomínio
            const complexHasUsers = await prisma.roleAssignment.findFirst({
                where: {
                    OR: [
                        { contextType: 'complex', contextId: complexId },
                        { contextType: 'block', contextId: { in: blocks.map(block => block.id) } },
                        { contextType: 'apartment', contextId: { in: allApartments.map(a => a.apartment.id) } }
                    ],
                    deletedAt: null,
                },
            });
            
            if (complexHasUsers) {
                return NextResponse.json({ error: 'Já existem usuários associados a este condomínio.' }, { status: 409 });
            }

            // 3. Buscar role "Morador"
            const role = await prisma.role.findFirst({ where: { name: 'Morador', deletedAt: null } });
            if (!role) return NextResponse.json({ error: 'Role padrão "Morador" não encontrada.' }, { status: 500 });

            // 4. Preparar dados para criação em massa
            const usersData = allApartments.map(({ block, apartment }) => {
                const blockSlug = block.name.trim().toLowerCase().replace(/\s+/g, '');
                const apartmentSlug = apartment.name.trim().toLowerCase().replace(/\s+/g, '');
                const blockApartmentTag = `b${blockSlug}-a${apartmentSlug}`;

                // Garantir que o domínio seja válido (adiciona .com.br se não tiver ponto)
                const rawDomain = userEmailDomain.replace('@', '').trim();
                const domain = rawDomain.includes('.') ? rawDomain : `${rawDomain}.com.br`;

                // Criar email inicial com limpeza básica
                const rawEmail = `${userEmailPrefix}${blockApartmentTag}@${domain}`;
                
                // Aplicar normalização completa (remoção de acentos e caracteres especiais)
                const normalizedEmail = normalizeEmail(rawEmail);

                // Senha = prefixo + tag do apartamento (simples e sem duplicar o email)
                const password = `${userPasswordPrefix}${blockApartmentTag}`;
                
                return {
                    name: `${userNamePrefix}${blockApartmentTag}`,
                    email: normalizedEmail,
                    password,
                    apartmentId: apartment.id,
                    blockName: block.name,
                    apartmentName: apartment.name
                };
            });

            // 5. Criar usuários em massa
            try {
                console.time('------------- Creating bulk residents users');
                
                const result = await createBulkResidentsUsers(usersData, userId, role.id);
                
                console.timeEnd('------------- Creating bulk residents users');
                return NextResponse.json({
                    ...result,
                    totalApartments
                }, { status: 201 });
            } catch (error: any) {
                console.error('Error creating bulk users:', error);
                return NextResponse.json({ error: error.message || 'Erro ao criar usuários em massa' }, { status: 500 });
            }
        }

        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        const { user, error: creationError, status: creationStatus } = await createUser(body, userId);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!user) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });
        if ('password' in user) {
            user.password = undefined; // Remove password from the response
        }
        return NextResponse.json(user, { status: creationStatus });
    } catch (error: any) {
        console.error("Error creating user:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}