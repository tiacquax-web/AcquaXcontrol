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
        const month = req.nextUrl.searchParams.get('month') ? parseInt(req.nextUrl.searchParams.get('month')!) : undefined
        const year = req.nextUrl.searchParams.get('year') ? parseInt(req.nextUrl.searchParams.get('year')!) : undefined
        const search = req.nextUrl.searchParams.get('search') || ''
        const take = parseInt(req.nextUrl.searchParams.get('take') || '50')
        const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')

        const where: any = {
            deletedAt: null,
            ...(complexId && { complexId }),
            ...(companyId && { companyId }),
            ...(status && { status }),
            ...(month !== undefined && { month }),
            ...(year !== undefined && { year }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { complexName: { contains: search, mode: 'insensitive' } },
                    { complexSocialName: { contains: search, mode: 'insensitive' } },
                ]
            })
        }

        const [routes, totalCount] = await Promise.all([
            prisma.readingRoute.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    complex: { select: { id: true, socialName: true, aliasName: true } },
                    assignedToUser: { select: { id: true, name: true, email: true } },
                    serviceOrders: {
                        where: { deletedAt: null },
                        select: { id: true, orderNumber: true, status: true }
                    },
                    _count: { select: { serviceOrders: true } }
                }
            }),
            prisma.readingRoute.count({ where })
        ])

        return NextResponse.json({ data: routes, total: totalCount, take, skip })
    } catch (error) {
        console.error('[GET /api/reading-routes]', error)
        return NextResponse.json({ error: 'Erro interno ao buscar rotas' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const body = await req.json()
        const {
            name,
            description,
            month,
            year,
            complexId,
            assignedToUserId,
            plannedStartDate,
            plannedEndDate,
        } = body

        if (!name || !month || !year || !complexId) {
            return NextResponse.json({ error: 'Campos obrigatórios: name, month, year, complexId' }, { status: 400 })
        }

        // Fetch complex details for denormalized fields
        const complex = await prisma.complex.findUnique({
            where: { id: complexId },
            include: { company: { select: { id: true, socialName: true } } }
        })

        if (!complex) {
            return NextResponse.json({ error: 'Condomínio não encontrado' }, { status: 404 })
        }

        const route = await prisma.readingRoute.create({
            data: {
                name,
                description,
                month,
                year,
                complexId,
                companyId: complex.companyId || undefined,
                companyName: complex.company?.socialName || undefined,
                complexName: complex.aliasName || undefined,
                complexSocialName: complex.socialName,
                assignedToUserId: assignedToUserId || undefined,
                plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
                plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : undefined,
                status: 'DRAFT',
                createdByUserId: validSession.userId,
            }
        })

        // Auto-generate a service order for this route
        const orderNumber = `OS-${year}-${String(month).padStart(2, '0')}-${route.id.substring(0, 6).toUpperCase()}`

        // Get all apartments with meters for this complex
        const apartments = await prisma.apartment.findMany({
            where: { complexId, deletedAt: null },
            include: {
                meters: { where: { deletedAt: null, status: 'Ativo', main: true } },
                block: { select: { id: true, name: true } }
            },
            orderBy: [{ block: { name: 'asc' } }, { name: 'asc' }]
        })

        const serviceOrder = await prisma.serviceOrder.create({
            data: {
                orderNumber,
                readingRouteId: route.id,
                complexId,
                companyId: complex.companyId || undefined,
                companyName: complex.company?.socialName || undefined,
                complexName: complex.aliasName || undefined,
                complexSocialName: complex.socialName,
                month,
                year,
                assignedToUserId: assignedToUserId || undefined,
                plannedDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
                status: 'PENDING',
                createdByUserId: validSession.userId,
                serviceOrderItems: {
                    create: apartments.flatMap((apt, aptIdx) =>
                        apt.meters.map((meter, meterIdx) => ({
                            apartmentId: apt.id,
                            apartmentName: apt.name,
                            blockId: apt.blockId || undefined,
                            blockName: apt.block?.name || undefined,
                            meterId: meter.id,
                            meterRegister: meter.register,
                            sortOrder: aptIdx * 10 + meterIdx,
                            status: 'PENDING',
                        }))
                    )
                }
            },
            include: { serviceOrderItems: true }
        })

        return NextResponse.json({ route, serviceOrder }, { status: 201 })
    } catch (error) {
        console.error('[POST /api/reading-routes]', error)
        return NextResponse.json({ error: 'Erro interno ao criar rota' }, { status: 500 })
    }
}
