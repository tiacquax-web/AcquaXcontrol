import prisma, { cleanEntityBody } from "@/lib/prisma"
import { getEntityListData } from "@/lib/userData"
import { createUser, createBulkResidentsUsers, validateUserSession } from "@/lib/users"
import { getAccessibleUserIdsForAction, userHasRestrictedManagerProfile } from "@/lib/userAccess"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { randomBytes } from "crypto"

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
    const userId = req.nextUrl.searchParams.get('id') || undefined
    const roleName = req.nextUrl.searchParams.get('role_name') || undefined
    const contextType = req.nextUrl.searchParams.get('role_context_type') || undefined
    const contextId = req.nextUrl.searchParams.get('role_context_id') || undefined
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const roleId = req.nextUrl.searchParams.get('role_id') || undefined
    return { userId, roleName, contextType, contextId, search, take, skip, orderBy, orderDirection, complexId, blockId, roleId }
}

const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as const
type UserAction = 'read' | 'update' | 'delete' | 'create'

function mergeUserIdScope(current: Set<string> | null, nextIds: string[]) {
    if (current === null) return new Set(nextIds)
    const nextSet = new Set(nextIds)
    return new Set([...current].filter((id) => nextSet.has(id)))
}

async function getUserIdsByContextFilter(complexId?: string, blockId?: string): Promise<string[] | null> {
    if (!complexId && !blockId) return null

    const blockIds = blockId
        ? [blockId]
        : (await prisma.block.findMany({
            where: { ...NOT_DELETED, ...(complexId ? { complexId } : {}) },
            select: { id: true }
        })).map((b) => b.id)

    const aptIds = (await prisma.apartment.findMany({
        where: {
            ...NOT_DELETED,
            OR: [
                ...(complexId ? [{ complexId }] : []),
                ...(blockId ? [{ blockId }] : []),
            ]
        },
        select: { id: true }
    })).map((a) => a.id)

    const assigns = await prisma.roleAssignment.findMany({
        where: {
            ...NOT_DELETED,
            OR: [
                ...(complexId ? [{ contextId: complexId, contextType: ContextType.complex }] : []),
                ...(blockIds.length > 0 ? [{ contextId: { in: blockIds }, contextType: ContextType.block }] : []),
                ...(aptIds.length > 0 ? [{ contextId: { in: aptIds }, contextType: ContextType.apartment }] : []),
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

async function getScopedUserIdsForAction(
    actingUserId: string,
    action: UserAction,
    filters: { userIds?: string[]; complexId?: string; blockId?: string; roleId?: string; }
) {
    const access = await getAccessibleUserIdsForAction(actingUserId, action)
    if (!access.hasPermission) {
        return { error: 'Não autorizado', status: 401 as const, userIds: [] as string[] | null }
    }

    let scopedIds: Set<string> | null = access.isSystem ? null : new Set(access.userIds)

    const idsByContext = await getUserIdsByContextFilter(filters.complexId, filters.blockId)
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

export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req)
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus })
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { userId: searchUserId, search, take, contextId: roleContextId, contextType: roleContextType, roleName, skip, orderBy, orderDirection, complexId, blockId, roleId } = getQueryParams(req)

        const scope = await getScopedUserIdsForAction(userId, 'read', {
            userIds: searchUserId ? [searchUserId] : undefined,
            complexId,
            blockId,
            roleId,
        })
        if (scope.error) return NextResponse.json({ error: scope.error }, { status: scope.status })

        const contextType: ContextType | undefined = undefined
        const contextId = undefined

        const where: any = {
            ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
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

        const { entity, error, status, totalCount } = await getEntityListData(userId, 'user', contextType, contextId, search, where, take, {}, skip, orderBy, orderDirection as 'asc' | 'desc')
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 })

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
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req)
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus })
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        // Parse request body
        const reqBody = await req.json()

        if (reqBody.bulkAction === 'deleteAllUsers' || reqBody.bulkAction === 'resetAllUsers') {
            const filters = {
                search: reqBody.search || '',
                userIds: Array.isArray(reqBody.userIds) ? reqBody.userIds : [],
                complexId: reqBody.complexId || undefined,
                blockId: reqBody.blockId || undefined,
                roleId: reqBody.roleId || undefined,
            }

            const actionType: UserAction = reqBody.bulkAction === 'deleteAllUsers' ? 'delete' : 'update'
            const scope = await getScopedUserIdsForAction(userId, actionType, {
                userIds: filters.userIds,
                complexId: filters.complexId,
                blockId: filters.blockId,
                roleId: filters.roleId,
            })
            if (scope.error) return NextResponse.json({ error: scope.error }, { status: scope.status })

            if (reqBody.bulkAction === 'deleteAllUsers') {
                const restrictedManager = await userHasRestrictedManagerProfile(userId)
                if (restrictedManager) {
                    return NextResponse.json({ error: 'Síndico e administradora não podem excluir usuários.' }, { status: 403 })
                }
            }

            const targetUsers = await prisma.user.findMany({
                where: {
                    ...NOT_DELETED,
                    ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
                    ...(filters.search ? {
                        OR: [
                            { name: { contains: filters.search, mode: 'insensitive' } },
                            { email: { contains: filters.search, mode: 'insensitive' } },
                        ]
                    } : {}),
                },
                select: { id: true, email: true, preferences: true },
            })

            const filteredTargets = targetUsers.filter((u) => u.email !== 'admin@acquax.com' && u.id !== userId)
            if (filteredTargets.length === 0) {
                return NextResponse.json({ error: 'Nenhum usuário elegível encontrado para esta ação.' }, { status: 404 })
            }

            if (reqBody.bulkAction === 'deleteAllUsers') {
                const now = new Date()
                const targetIds = filteredTargets.map((u) => u.id)

                const [usersUpdated, roleAssignmentsUpdated, sessionsUpdated] = await prisma.$transaction([
                    prisma.user.updateMany({
                        where: { id: { in: targetIds }, ...NOT_DELETED },
                        data: { deletedAt: now, updatedByUserId: userId, updatedAt: now },
                    }),
                    prisma.roleAssignment.updateMany({
                        where: { userId: { in: targetIds }, ...NOT_DELETED },
                        data: { deletedAt: now, updatedByUserId: userId, updatedAt: now },
                    }),
                    prisma.session.updateMany({
                        where: { userId: { in: targetIds }, ...NOT_DELETED },
                        data: { deletedAt: now },
                    }),
                ])

                return NextResponse.json({
                    message: 'Usuários excluídos com sucesso.',
                    usersAffected: usersUpdated.count,
                    roleAssignmentsAffected: roleAssignmentsUpdated.count,
                    sessionsAffected: sessionsUpdated.count,
                })
            }

            const updates = filteredTargets.map(async (targetUser) => {
                const temporaryPassword = generateTemporaryPassword(12)
                const hashedPassword = await hash(temporaryPassword, 10)
                const basePreferences =
                    targetUser.preferences &&
                    typeof targetUser.preferences === 'object' &&
                    !Array.isArray(targetUser.preferences)
                        ? (targetUser.preferences as Record<string, unknown>)
                        : {}

                const preferences = {
                    ...basePreferences,
                    temporaryPassword,
                    temporaryPasswordUpdatedAt: new Date().toISOString(),
                }

                await prisma.user.update({
                    where: { id: targetUser.id },
                    data: {
                        password: hashedPassword,
                        mustUpdateCredentials: true,
                        resetToken: null,
                        resetTokenExpiry: null,
                        preferences,
                        updatedByUserId: userId,
                    },
                })
            })
            await Promise.all(updates)
            await prisma.session.updateMany({
                where: { userId: { in: filteredTargets.map((u) => u.id) }, ...NOT_DELETED },
                data: { deletedAt: new Date() },
            })

            return NextResponse.json({
                message: 'Senhas redefinidas com sucesso.',
                usersAffected: filteredTargets.length,
            })
        }

        // Suporte à criação em massa de usuários para um condomínio
        if (reqBody.createBulkUsersForComplex) {
            const { complexId, userNamePrefix, userPasswordPrefix, userEmailPrefix, userEmailDomain } = reqBody
            if (!complexId || !userNamePrefix || !userPasswordPrefix || !userEmailPrefix || !userEmailDomain) {
                return NextResponse.json({ error: 'Parâmetros obrigatórios para criação em massa não informados.' }, { status: 400 })
            }

            // 1. Buscar todos os apartamentos do condomínio
            const blocks = await prisma.block.findMany({
                where: { complexId, deletedAt: null },
                include: {
                    apartments: { where: { deletedAt: null } },
                },
            })
            const allApartments = blocks.flatMap(block => block.apartments.map(ap => ({ block, apartment: ap })))
            const totalApartments = allApartments.length
            
            if (!totalApartments) {
                return NextResponse.json({ error: 'Nenhum bloco/apartamento encontrado para este condomínio.' }, { status: 404 })
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
            })
            
            if (complexHasUsers) {
                return NextResponse.json({ error: 'Já existem usuários associados a este condomínio.' }, { status: 409 })
            }

            // 3. Buscar role "Morador"
            const role = await prisma.role.findFirst({ where: { name: 'Morador', deletedAt: null } })
            if (!role) return NextResponse.json({ error: 'Role padrão "Morador" não encontrada.' }, { status: 500 })

            // 4. Preparar dados para criação em massa
            const usersData = allApartments.map(({ block, apartment }) => {
                const blockSlug = block.name.trim().toLowerCase().replace(/\s+/g, '')
                const apartmentSlug = apartment.name.trim().toLowerCase().replace(/\s+/g, '')
                const blockApartmentTag = `b${blockSlug}-a${apartmentSlug}`

                // Garantir que o domínio seja válido (adiciona .com.br se não tiver ponto)
                const rawDomain = userEmailDomain.replace('@', '').trim()
                const domain = rawDomain.includes('.') ? rawDomain : `${rawDomain}.com.br`

                // Criar email inicial com limpeza básica
                const rawEmail = `${userEmailPrefix}${blockApartmentTag}@${domain}`
                
                // Aplicar normalização completa (remoção de acentos e caracteres especiais)
                const normalizedEmail = normalizeEmail(rawEmail)

                // Senha = prefixo + tag do apartamento (simples e sem duplicar o email)
                const password = `${userPasswordPrefix}${blockApartmentTag}`
                
                return {
                    name: `${userNamePrefix}${blockApartmentTag}`,
                    email: normalizedEmail,
                    password,
                    apartmentId: apartment.id,
                    blockName: block.name,
                    apartmentName: apartment.name
                }
            })

            // 5. Criar usuários em massa
            try {
                console.time('------------- Creating bulk residents users')
                const result = await createBulkResidentsUsers(usersData, userId, role.id)
                console.timeEnd('------------- Creating bulk residents users')
                return NextResponse.json({
                    ...result,
                    totalApartments
                }, { status: 201 })
            } catch (error: any) {
                console.error('Error creating bulk users:', error)
                return NextResponse.json({ error: error.message || 'Erro ao criar usuários em massa' }, { status: 500 })
            }
        }

        const body = cleanEntityBody(reqBody)
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 })
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 })
        const { user, error: creationError, status: creationStatus } = await createUser(body, userId)
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus })
        if (!user) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 })
        if ('password' in user) {
            user.password = undefined
        }
        return NextResponse.json(user, { status: creationStatus })
    } catch (error: any) {
        console.error("Error creating user:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}