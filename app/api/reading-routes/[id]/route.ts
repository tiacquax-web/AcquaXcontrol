import prisma from '@/lib/prisma'
import { isSessionValid } from '@/lib/users'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { id } = await params

        const route = await prisma.readingRoute.findFirst({
            where: { id, deletedAt: null },
            include: {
                complex: {
                    select: {
                        id: true, socialName: true, aliasName: true,
                        dealershipName: true, billingType: true
                    }
                },
                assignedToUser: { select: { id: true, name: true, email: true } },
                serviceOrders: {
                    where: { deletedAt: null },
                    include: {
                        serviceOrderItems: {
                            orderBy: { sortOrder: 'asc' }
                        },
                        assignedToUser: { select: { id: true, name: true, email: true } }
                    }
                }
            }
        })

        if (!route) return NextResponse.json({ error: 'Rota não encontrada' }, { status: 404 })

        return NextResponse.json(route)
    } catch (error) {
        console.error('[GET /api/reading-routes/[id]]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { id } = await params
        const body = await req.json()

        const route = await prisma.readingRoute.update({
            where: { id },
            data: {
                ...body,
                updatedByUserId: validSession.userId,
            }
        })

        return NextResponse.json(route)
    } catch (error) {
        console.error('[PATCH /api/reading-routes/[id]]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { id } = await params

        const route = await prisma.readingRoute.update({
            where: { id },
            data: { deletedAt: new Date(), updatedByUserId: validSession.userId }
        })

        return NextResponse.json(route)
    } catch (error) {
        console.error('[DELETE /api/reading-routes/[id]]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
