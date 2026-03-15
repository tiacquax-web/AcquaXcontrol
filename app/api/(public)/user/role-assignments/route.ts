import { cleanEntityBody } from "@/lib/prisma"
import { getEntityListData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { ContextType, Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const userId = req.nextUrl.searchParams.get('user_id') || undefined
    const roleId = req.nextUrl.searchParams.get('role_id') || undefined
    const userName = req.nextUrl.searchParams.get('user_name') || undefined
    const roleName = req.nextUrl.searchParams.get('role_name') || undefined
    const withRole = req.nextUrl.searchParams.get('with_role') || undefined
    const withUser = req.nextUrl.searchParams.get('with_user') || undefined
    const withContext = req.nextUrl.searchParams.get('with_context') || undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '15')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { withRole, withContext, withUser, userName, roleName, userId, roleId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError || !userId) return NextResponse.json({ error: 'Não autorizado' }, { status: sessionStatus || 401 });
        
        // get query params
        const { withRole, withUser, withContext, userId: filterUserId, roleId, userName, roleName, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType : ContextType | undefined = undefined
        const contextId = undefined

        // extra where
        const where = {
            userId: filterUserId,
            roleId: roleId,
            user: userName ? {
                name: userName,
            } : undefined,
            role: roleName ? {
                name: roleName,
            } : undefined,
        }

        // add withRole and withUser to where if they are defined
        const include:Prisma.RoleAssignmentInclude|undefined = withRole || withUser ? {
            Role: withRole ? {
                select: {
                    name: true,
                    id: true,
                },
            } : false,
            User: withUser ? {
                select: {
                    name: true,
                    id: true,
                },
            } : false
        } : undefined

        console.log("######### Role Assignments - GET params:", {
            userId: filterUserId,
            roleId,
            userName,
            roleName,
            withRole,
            withUser,
            search,
            take,
            skip,
            orderBy,
            orderDirection,
        })

        console.log("######### Role Assignments - GET where:", where)
        console.log("######### Role Assignments - GET include:", include)

        // get role assignments
        const {entity, error, status} = await getEntityListData(userId, 'roleAssignment', contextType, contextId, search, where, take, include)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 })

        let enriched = entity
        if (withContext) {
            const companyIds = new Set<string>()
            const complexIds = new Set<string>()
            const blockIds = new Set<string>()
            const apartmentIds = new Set<string>()

            for (const ra of entity as any[]) {
                if (!ra.contextId) continue
                switch (ra.contextType) {
                    case 'company': companyIds.add(ra.contextId); break
                    case 'complex': complexIds.add(ra.contextId); break
                    case 'block': blockIds.add(ra.contextId); break
                    case 'apartment': apartmentIds.add(ra.contextId); break
                }
            }

            const [companies, complexes, blocks, apartments] = await Promise.all([
                companyIds.size ? prisma.company.findMany({ where: { id: { in: [...companyIds] } }, select: { id: true, socialName: true, name: true } }) : Promise.resolve([]),
                complexIds.size ? prisma.complex.findMany({ where: { id: { in: [...complexIds] } }, select: { id: true, socialName: true, aliasName: true } }) : Promise.resolve([]),
                blockIds.size ? prisma.block.findMany({ where: { id: { in: [...blockIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
                apartmentIds.size ? prisma.apartment.findMany({ where: { id: { in: [...apartmentIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
            ])

            const companyMap = new Map((companies as any[]).map((c: any) => [c.id, c.socialName || c.name || c.id]))
            const complexMap = new Map((complexes as any[]).map((c: any) => [c.id, c.socialName || c.aliasName || c.id]))
            const blockMap = new Map((blocks as any[]).map((b: any) => [b.id, b.name || b.id]))
            const apartmentMap = new Map((apartments as any[]).map((a: any) => [a.id, a.name || a.id]))

            enriched = (entity as any[]).map(ra => {
                let contextName = '—'
                if (ra.contextType === 'system') contextName = 'Sistema'
                else if (ra.contextType === 'company') contextName = companyMap.get(ra.contextId) || ra.contextId
                else if (ra.contextType === 'complex') contextName = complexMap.get(ra.contextId) || ra.contextId
                else if (ra.contextType === 'block') contextName = blockMap.get(ra.contextId) || ra.contextId
                else if (ra.contextType === 'apartment') contextName = apartmentMap.get(ra.contextId) || ra.contextId
                return { ...ra, contextName }
            })
        }

        console.log("######### Role Assignments found:", enriched.length)

        return NextResponse.json(enriched)

    } catch (error: any) {
        console.error("Error fetching role assignments:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Check if user is a system-level user (or Programador/Administrador role anywhere)
        const privilegedAssignment = await prisma.roleAssignment.findFirst({
            where: {
                userId,
                AND: [
                    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                    {
                        OR: [
                            { contextType: ContextType.system },
                            { Role: { name: 'Programador' } },
                            { Role: { name: 'Administrador' } },
                        ]
                    }
                ]
            },
            select: { id: true },
        });
        if (!privilegedAssignment) {
            return NextResponse.json({ error: 'Não autorizado: apenas usuários do sistema podem gerenciar papéis.' }, { status: 401 });
        }

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        // Check for duplicate assignment (active - not deleted)
        const alreadyCreated = await prisma.roleAssignment.findFirst({
            where: {
                userId: body.userId,
                roleId: body.roleId,
                contextId: body.contextId,
                contextType: body.contextType,
                OR: [
                    { deletedAt: null },
                    { deletedAt: { isSet: false } },
                ],
            }
        });
        if (alreadyCreated) {
            return NextResponse.json({ error: 'Esta função já está atribuída ao usuário no contexto informado.' }, { status: 409 });
        }

        // Create role assignment
        const roleAssignment = await prisma.roleAssignment.create({
            data: {
                userId: body.userId,
                roleId: body.roleId,
                contextId: body.contextId,
                contextType: body.contextType,
                createdByUserId: userId,
                deletedAt: null,
            }
        });

        // Return the created entity data
        return NextResponse.json(roleAssignment, { status: 201 });

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating role assignment:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}