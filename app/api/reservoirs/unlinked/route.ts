import { getEntityListData } from "@/lib/userData"
import { isSessionValid } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // get userId from session
        const userId = validSession.userId;

        // get query params
        const search = req.nextUrl.searchParams.get('search') || ''
        const take = parseInt(req.nextUrl.searchParams.get('take') || '50')
        const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
        const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
        const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

        // build where clause for unlinked reservoirs
        const where: any = {
            complexId: null, // Reservatórios sem vinculação
            name: search ? { contains: search, mode: 'insensitive' } : undefined,
        };

        console.log("Filtering unlinked reservoirs with where clause:", where);

        // get unlinked reservoirs
        const { entity, error, status, totalCount } = await getEntityListData(
            userId, 
            'reservoir', 
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

        console.log("Unlinked reservoirs found:", entity.length);

        return NextResponse.json({
            reservoirs: entity,
            totalCount: totalCount || entity.length
        });

    } catch (error: any) {
        console.error("Error fetching unlinked reservoirs:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
