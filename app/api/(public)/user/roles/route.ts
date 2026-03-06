import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const roleId = req.nextUrl.searchParams.get('role_id') || undefined
    const roleName = req.nextUrl.searchParams.get('role_name') || undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '15')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { roleId, roleName, search, take, skip, orderBy, orderDirection }
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
        const { roleId, roleName, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType : ContextType | undefined = undefined
        const contextId = undefined

        // extra where
        const where = {
            roleId: roleId,
            role: roleName ? {
                name: roleName,
            } : undefined,
        }

        // get roles
        const {entity, totalCount, error, status} = await getEntityListData(userId, 'role', contextType, contextId, search, where, take, {}, skip, orderBy, orderDirection as 'asc' | 'desc')
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 })

        console.log("######### Roles found:", entity.length)

        return NextResponse.json({
            list: entity,
            totalCount: totalCount || entity.length
        })

    } catch (error: any) {
        console.error("Error fetching roles:", error)
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
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'role', body);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating role:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}