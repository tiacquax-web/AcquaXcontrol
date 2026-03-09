import prisma from '@/lib/prisma'
import { isSessionValid } from '@/lib/users'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
        const companyId = req.nextUrl.searchParams.get('company_id') || undefined
        const status = req.nextUrl.searchParams.get('status') || undefined
        const routeId = req.nextUrl.searchParams.get('route_id') || undefined
        const month = req.nextUrl.searchParams.get('month') ? parseInt(req.nextUrl.searchParams.get('month')!) : undefined
        const year = req.nextUrl.searchParams.get('year') ? parseInt(req.nextUrl.searchParams.get('year')!) : undefined
        const take = parseInt(req.nextUrl.searchParams.get('take') || '50')
        const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')

        const where: any = {
            deletedAt: null,
            ...(complexId && { complexId }),
            ...(companyId && { companyId }),
            ...(status && { status }),
            ...(routeId && { readingRouteId: routeId }),
            ...(month !== undefined && { month }),
            ...(year !== undefined && { year }),
        }

        const [orders, totalCount] = await Promise.all([
            prisma.serviceOrder.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    readingRoute: { select: { id: true, name: true, status: true } },
                    assignedToUser: { select: { id: true, name: true, email: true } },
                    serviceOrderItems: {
                        orderBy: { sortOrder: 'asc' },
                    },
                    _count: { select: { serviceOrderItems: true } }
                }
            }),
            prisma.serviceOrder.count({ where })
        ])

        return NextResponse.json({ data: orders, total: totalCount, take, skip })
    } catch (error) {
        console.error('[GET /api/service-orders]', error)
        return NextResponse.json({ error: 'Erro interno ao buscar ordens de serviço' }, { status: 500 })
    }
}
