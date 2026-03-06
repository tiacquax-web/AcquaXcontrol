import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, getEntityListData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const reservoirId = req.nextUrl.searchParams.get('reservoir_id') || undefined
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const startDate = req.nextUrl.searchParams.get('start_date') || undefined
    const endDate = req.nextUrl.searchParams.get('end_date') || undefined
    const minLevel = req.nextUrl.searchParams.get('min_level') || undefined
    const maxLevel = req.nextUrl.searchParams.get('max_level') || undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '100')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'readingDate'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { reservoirId, companyId, startDate, endDate, minLevel, maxLevel, search, take, skip, orderBy, orderDirection }
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
        const { reservoirId, companyId, startDate, endDate, minLevel, maxLevel, search, take, skip, orderBy, orderDirection } = getQueryParams(req);

        console.log("Query params received:", { reservoirId, companyId, startDate, endDate, minLevel, maxLevel, search, take, skip, orderBy, orderDirection });

        // build where clause for filtering
        const where: any = {
            reservoirId: reservoirId || undefined,
        };

        // Filter by date range
        if (startDate || endDate) {
            where.readingDate = {};
            if (startDate) {
                const startDateTime = new Date(startDate);
                console.log("Start date parsed:", startDateTime);
                where.readingDate.gte = startDateTime;
            }
            if (endDate) {
                const endDateTime = new Date(endDate);
                // Adicionar 23:59:59 para incluir todo o dia final
                endDateTime.setHours(23, 59, 59, 999);
                console.log("End date parsed:", endDateTime);
                where.readingDate.lte = endDateTime;
            }
        }

        // Filter by level range
        if (minLevel || maxLevel) {
            where.level = {};
            if (minLevel) {
                where.level.gte = parseFloat(minLevel);
            }
            if (maxLevel) {
                where.level.lte = parseFloat(maxLevel);
            }
        }

        // Filter by company through reservoir relation
        if (companyId) {
            where.reservoir = {
                companyId: companyId
            };
        }

        console.log("Filtering reservoir readings with where clause:", where);

        // get reservoir readings
        const { entity, error, status, totalCount } = await getEntityListData(
            userId, 
            'reservoirReading', 
            undefined, 
            undefined, 
            search, 
            where, 
            take, 
            undefined, // include
            skip, 
            orderBy, 
            orderDirection as 'asc' | 'desc'
        );
        
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 });

        console.log("Reservoir readings found:", entity.length);

        return NextResponse.json({
            reservoirReadings: entity,
            totalCount: totalCount || entity.length
        });

    } catch (error: any) {
        console.error("Error fetching reservoir readings:", error);
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
        const body = await req.json();
        
        // Validar dados obrigatórios
        if (!body.reservoirId || body.level === undefined || !body.readingDate) {
            return NextResponse.json({ 
                error: 'reservoirId, level e readingDate são obrigatórios' 
            }, { status: 400 });
        }

        // Validar tipos de dados
        if (typeof body.level !== 'number') {
            return NextResponse.json({ 
                error: 'Level deve ser um número' 
            }, { status: 400 });
        }

        // Validar readingDate
        const readingDate = new Date(body.readingDate);
        if (isNaN(readingDate.getTime())) {
            return NextResponse.json({ 
                error: 'readingDate inválido. Use formato ISO 8601' 
            }, { status: 400 });
        }

        // Clean and prepare data
        const cleanedData = cleanEntityBody(body);
        
        // Ensure readingDate is a Date object
        cleanedData.readingDate = readingDate;

        // Create reservoir reading
        const { entity, error, status } = await createEntity(userId, 'reservoirReading', cleanedData);
        
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Falha ao criar leitura do reservatório' }, { status: 500 });

        return NextResponse.json({ 
            reservoirReading: entity,
            message: 'Leitura do reservatório criada com sucesso' 
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error in POST /api/reservoir-readings:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
