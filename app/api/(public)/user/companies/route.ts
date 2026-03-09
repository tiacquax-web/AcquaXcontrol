import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableCompaniesForEntity, getAvailableComplexesForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const documentCompany = req.nextUrl.searchParams.get('document_company') || undefined;

    // option - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { getAvailableForEntity, documentCompany, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // get query params
        const { getAvailableForEntity, companyId, documentCompany, search, take, skip, orderBy, orderDirection } = getQueryParams(req);

        // build where clause for filtering
        const where: any = {
            id: companyId || undefined,
            name: search ? { contains: search, mode: 'insensitive' } : undefined,
            documentCompany: documentCompany ? {contains: documentCompany} : undefined,
        };

        console.log("################################ getAvailableForEntity in company query:", getAvailableForEntity)
        console.log("################################ where:", where)
        
        // return available apartments for entity if requested
        if (getAvailableForEntity) {
            const availableApartments = await getAvailableCompaniesForEntity(userId, getAvailableForEntity, search, where); //TODO: skip, take, orderBy, orderDirection
            return NextResponse.json(availableApartments)
        }

        // get companies
        const { entity, error, status } = await getEntityListData(userId, 'company', undefined, undefined, search, where, take);
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 });

        console.log("######### Companies found:", entity.length);

        return NextResponse.json(entity);

    } catch (error: any) {
        console.error("Error fetching companies:", error);
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
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'company', body);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        console.log("######### Entity created:", entity);
        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating company:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
