import { cleanEntityBody } from "@/lib/prisma";
import { createEntity, getEntityListData } from "@/lib/userData";
import { isSessionValid, validateUserSession } from "@/lib/users";
import { NextRequest, NextResponse } from "next/server";

function getQueryParams(req: NextRequest) {
    // query params - default
    const search = req.nextUrl.searchParams.get('search') || '';
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10');
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt';
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc';

    return { search, take, skip, orderBy, orderDirection };
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // get userId from session
        const userId = validSession.userId;

        // get query params
        const { search, take, skip, orderBy, orderDirection } = getQueryParams(req);

        // build where clause for filtering
        const where: any = {
            name: search ? { contains: search, mode: 'insensitive' } : undefined,
        };

        console.log("################################ where:", where);

        // get dealerships
        const { entity, error, status } = await getEntityListData(userId, 'dealership', undefined, undefined, search, where, take, undefined, skip, orderBy, orderDirection as 'asc' | 'desc');
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 });

        console.log("######### Dealerships found:", entity.length);

        return NextResponse.json(entity);

    } catch (error: any) {
        console.error("Error fetching dealerships:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

        console.log("######### Request body:", body);

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        console.log("######### Body after cleaning:", body);

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'dealership', body);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        console.log("######### Entity created:", entity);

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating dealership:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
