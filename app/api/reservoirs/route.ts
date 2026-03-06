import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, getEntityListData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const type = req.nextUrl.searchParams.get('type') || undefined
    const isActive = req.nextUrl.searchParams.get('is_active') || undefined
    const includeReadings = req.nextUrl.searchParams.get('includeReadings') === 'true'
    const includeStats = req.nextUrl.searchParams.get('includeStats') === 'true'
    const dateFrom = req.nextUrl.searchParams.get('dateFrom') || undefined
    const dateTo = req.nextUrl.searchParams.get('dateTo') || undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '50')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { companyId, complexId, type, isActive, includeReadings, includeStats, dateFrom, dateTo, search, take, skip, orderBy, orderDirection }
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
        const { companyId, complexId, type, isActive, includeReadings, includeStats, dateFrom, dateTo, search, take, skip, orderBy, orderDirection } = getQueryParams(req);

        // build where clause for filtering
        const where: any = {
            companyId: companyId || undefined,
            complexId: complexId || undefined,
            type: type || undefined,
            name: search ? { contains: search, mode: 'insensitive' } : undefined,
        };

        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }

        // build include clause for readings
        const include = includeReadings ? {
            readings: {
                where: dateFrom || dateTo ? {
                    readingDate: {
                        ...(dateFrom && { gte: new Date(dateFrom) }),
                        ...(dateTo && { lte: new Date(dateTo) })
                    }
                } : undefined,
                orderBy: { readingDate: 'desc' as const },
                take: includeStats ? 100 : 1 // Mais leituras se incluir stats para cálculos
            }
        } : undefined;

        console.log("Filtering reservoirs with where clause:", where);

        // get reservoirs
        const { entity, error, status, totalCount } = await getEntityListData(
            userId, 
            'reservoir', 
            undefined, 
            undefined, 
            search, 
            where, 
            take, 
            include, 
            skip, 
            orderBy, 
            orderDirection as 'asc' | 'desc'
        );
        
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not found' }, { status: 500 });

        console.log("Reservoirs found:", entity.length);

        return NextResponse.json({
            reservoirs: entity,
            totalCount: totalCount || entity.length
        });

    } catch (error: any) {
        console.error("Error fetching reservoirs:", error);
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
        if (!body.name || !body.type || !body.companyId) {
            return NextResponse.json({ 
                error: 'Nome, tipo e companyId são obrigatórios' 
            }, { status: 400 });
        }

        // Validar tipo de reservatório
        const validTypes = ['WATER', 'FUEL', 'CHEMICAL', 'OTHER'];
        if (!validTypes.includes(body.type)) {
            return NextResponse.json({ 
                error: 'Tipo de reservatório inválido. Tipos válidos: ' + validTypes.join(', ') 
            }, { status: 400 });
        }

        // Clean and prepare data
        const cleanedData = cleanEntityBody(body);
        
        // Set default values
        if (cleanedData.isActive === undefined) {
            cleanedData.isActive = true;
        }

        // Create reservoir
        const { entity, error, status } = await createEntity(userId, 'reservoir', cleanedData);
        
        if (error) return NextResponse.json({ error }, { status });
        if (!entity) return NextResponse.json({ error: 'Falha ao criar reservatório' }, { status: 500 });

        return NextResponse.json({ 
            reservoir: entity,
            message: 'Reservatório criado com sucesso' 
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error in POST /api/reservoirs:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
