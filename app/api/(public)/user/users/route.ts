import prisma, { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { createUser, createBulkResidentsUsers, isSessionValid, validateUserSession } from "@/lib/users"
import { getAccessibleUserIdsForAction } from "@/lib/userAccess"
import { ContextType } from "@prisma/client"
import { hash } from "bcryptjs"
import { randomBytes } from "crypto"
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
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const roleId = req.nextUrl.searchParams.get('role_id') || undefined

    return { getAvailableForEntity, userId, roleName, contextType, contextId, search, take, skip, orderBy, orderDirection, complexId, blockId, apartmentId, roleId }
}

const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }

function mergeUserIdScope(current: Set<string> | null, nextIds: string[]) {
    if (current === null) return new Set(nextIds)
    const nextSet = new Set(nextIds)
    return new Set([...current].filter((id) => nextSet.has(id)))
}

async function getUserIdsByContextFilter(complexId?: string, blockId?: string, apartmentId?: string): Promise<string[] | null> {
    if (!complexId && !blockId && !apartmentId) return null

    if (apartmentId) {
        const apartment = await prisma.apartment.findFirst({
            where: {
                id: apartmentId,
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { blockId: true, complexId: true },
        })
        if (!apartment || (blockId && apartment.blockId !== blockId) || (complexId && apartment.complexId !== complexId)) {
            return []
        }
        const assignments = await prisma.roleAssignment.findMany({
            where: {
                AND: [
                    NOT_DELETED,
                    { contextId: apartmentId, contextType: ContextType.apartment },
                ],
            },
            select: { userId: true },
        })
        return [...new Set(assignments.map((assignment) => assignment.userId))]
    }

    const blockIds = blockId
        ? [blockId]
        : (await prisma.block.findMany({
            where: { ...NOT_DELETED, ...(complexId ? { complexId } : {}) },
            select: { id: true }
        })).map((b) => b.id)

    const aptIds = (await prisma.apartment.findMany({
        where: {
            AND: [
                NOT_DELETED,
                {
                    OR: [
                        ...(complexId ? [{ complexId }] : []),
                        ...(blockId ? [{ blockId }] : []),
                    ]
                }
            ]
        },
        select: { id: true }
    })).map((a) => a.id)

    const assigns = await prisma.roleAssignment.findMany({
        where: {
            AND: [
                NOT_DELETED,
                {
                    OR: [
                        ...(complexId ? [{ contextId: complexId, contextType: ContextType.complex }] : []),
                        ...(blockIds.length > 0 ? [{ contextId: { in: blockIds }, contextType: ContextType.block }] : []),
                        ...(aptIds.length > 0 ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }] : []),
                    ]
                }
            ]
        },
        select: { userId: true }
    })

    return [...new Set(assigns.map((a) => a.userId))]
}

async function getUserIdsByRoleFilter(roleId?: string): Promise<string[] | null> {
    if (!roleId) return null
    const assigns = await prisma.roleAssignment.findMany({
        where: { ...NOT_DELETED, roleId },
        select: { userId: true }
    })
    return [...new Set(assigns.map((a) => a.userId))]
}

async function getScopedUserIdsForReset(
    actingUserId: string,
    filters: { userIds?: string[]; complexId?: string; blockId?: string; apartmentId?: string; roleId?: string; }
) {
    const access = await getAccessibleUserIdsForAction(actingUserId, 'update')
    if (!access.hasPermission) {
        return { error: 'Não autorizado', status: 401 as const, userIds: [] as string[] | null }
    }

    let scopedIds: Set<string> | null = access.isSystem ? null : new Set(access.userIds)

    const idsByContext = await getUserIdsByContextFilter(filters.complexId, filters.blockId, filters.apartmentId)
    if (idsByContext) scopedIds = mergeUserIdScope(scopedIds, idsByContext)

    const idsByRole = await getUserIdsByRoleFilter(filters.roleId)
    if (idsByRole) scopedIds = mergeUserIdScope(scopedIds, idsByRole)

    if (filters.userIds && filters.userIds.length > 0) {
        scopedIds = mergeUserIdScope(scopedIds, filters.userIds)
    }

    return { error: null, status: 200 as const, userIds: scopedIds ? [...scopedIds] : null }
}

function generateTemporaryPassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
    const bytes = randomBytes(length * 2)
    let password = ''
    for (const b of bytes) {
        password += chars[b % chars.length]
        if (password.length >= length) break
    }
    return password
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
    const workers = Array.from({ length: Math.min(limit, items.length) }, async (_, workerIndex) => {
        for (let index = workerIndex; index < items.length; index += limit) {
            await task(items[index])
        }
    })
    await Promise.all(workers)
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
        const { userId: searchUserId, search, take, contextId: roleContextId, contextType: roleContextType, roleName, skip, orderBy, orderDirection, complexId, blockId, apartmentId, roleId } = getQueryParams(req)

        // Filtrar por complexo/bloco via RoleAssignment
        let userIdsByContext: string[] | undefined = undefined;
        if (complexId || blockId || apartmentId) {
            let blockIds: string[] = [];
            let aptIds: string[] = [];
            if (apartmentId) {
                const apartment = await prisma.apartment.findFirst({
                    where: {
                        id: apartmentId,
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                    },
                    select: { id: true, blockId: true, complexId: true },
                });
                if (!apartment || (blockId && apartment.blockId !== blockId) || (complexId && apartment.complexId !== complexId)) {
                    userIdsByContext = [];
                } else {
                    aptIds = [apartment.id];
                    blockIds = apartment.blockId ? [apartment.blockId] : [];
                }
            } else {
                blockIds = blockId ? [blockId] : (await prisma.block.findMany({
                    where: { complexId, deletedAt: null }, select: { id: true }
                })).map(b => b.id);
                aptIds = (await prisma.apartment.findMany({
                    where: { OR: [
                        ...(complexId ? [{ complexId, deletedAt: null }] : []),
                        ...(blockId ? [{ blockId, deletedAt: null }] : []),
                    ]}, select: { id: true }
                })).map(a => a.id);
            }
            const contextFilters = apartmentId
                ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }]
                : blockId
                    ? [
                        ...(blockIds.length ? [{ contextId: { in: blockIds }, contextType: ContextType.block }] : []),
                        ...(aptIds.length ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }] : []),
                    ]
                    : [
                        ...(complexId ? [{ contextId: complexId, contextType: ContextType.complex }] : []),
                        ...(blockIds.length ? [{ contextId: { in: blockIds }, contextType: ContextType.block }] : []),
                        ...(aptIds.length ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }] : []),
                    ];

            const assigns = await prisma.roleAssignment.findMany({
                where: {
                    deletedAt: null,
                    OR: contextFilters
                },
                select: { userId: true }
            });
            userIdsByContext = userIdsByContext ?? [...new Set(assigns.map(a => a.userId))];
        }

        // Filtrar por papel
        let userIdsByRole: string[] | undefined = undefined;
        if (roleId) {
            const assigns = await prisma.roleAssignment.findMany({
                where: { roleId, deletedAt: null }, select: { userId: true }
            });
            userIdsByRole = [...new Set(assigns.map(a => a.userId))];
        }

        // identify context
        const contextType: ContextType | undefined = undefined
        const contextId = undefined

        // Build AND filters for userIds
        const andFilters: any[] = [];
        if (userIdsByContext !== undefined) andFilters.push({ id: { in: userIdsByContext } });
        if (userIdsByRole !== undefined) andFilters.push({ id: { in: userIdsByRole } });

        // extra where
        const where: any = {
            id: searchUserId ?? undefined,
            ...(andFilters.length > 0 ? { AND: andFilters } : {}),
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
        if (reqBody.bulkAction === 'resetAllUsers') {
            const filters = {
                search: reqBody.search || '',
                userIds: Array.isArray(reqBody.userIds) ? reqBody.userIds : [],
                complexId: reqBody.complexId || undefined,
                blockId: reqBody.blockId || undefined,
                apartmentId: reqBody.apartmentId || undefined,
                roleId: reqBody.roleId || undefined,
            }

            const scope = await getScopedUserIdsForReset(userId, {
                userIds: filters.userIds,
                complexId: filters.complexId,
                blockId: filters.blockId,
                apartmentId: filters.apartmentId,
                roleId: filters.roleId,
            })
            if (scope.error) return NextResponse.json({ error: scope.error }, { status: scope.status })

            const targetUsersWhere: any = {
                AND: [
                    NOT_DELETED,
                    ...(scope.userIds ? [{ id: { in: scope.userIds } }] : []),
                    ...(filters.search ? [{
                        OR: [
                            { name: { contains: filters.search, mode: 'insensitive' } },
                            { email: { contains: filters.search, mode: 'insensitive' } },
                        ]
                    }] : []),
                ]
            }

            const targetUsers = await prisma.user.findMany({
                where: targetUsersWhere,
                select: { id: true, email: true, preferences: true },
            })

            const filteredTargets = targetUsers.filter((u) => u.email !== 'admin@acquax.com' && u.id !== userId)
            if (filteredTargets.length === 0) {
                return NextResponse.json({ error: 'Nenhum usuário elegível encontrado para redefinição.' }, { status: 404 })
            }

            const updatedAt = new Date()
            await runWithConcurrency(filteredTargets, 4, async (targetUser) => {
                const temporaryPassword = generateTemporaryPassword(12)
                const hashedPassword = await hash(temporaryPassword, 10)
                const basePreferences =
                    targetUser.preferences &&
                    typeof targetUser.preferences === 'object' &&
                    !Array.isArray(targetUser.preferences)
                        ? (targetUser.preferences as Record<string, unknown>)
                        : {}

                await prisma.user.update({
                    where: { id: targetUser.id },
                    data: {
                        password: hashedPassword,
                        mustUpdateCredentials: true,
                        resetToken: null,
                        resetTokenExpiry: null,
                        preferences: {
                            ...basePreferences,
                            temporaryPassword,
                            temporaryPasswordUpdatedAt: updatedAt.toISOString(),
                        },
                        updatedByUserId: userId,
                    },
                })
            })

            await prisma.session.updateMany({
                where: { userId: { in: filteredTargets.map((u) => u.id) }, ...NOT_DELETED },
                data: { deletedAt: updatedAt },
            })

            return NextResponse.json({
                message: 'Senhas redefinidas com sucesso.',
                usersAffected: filteredTargets.length,
            })
        }

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