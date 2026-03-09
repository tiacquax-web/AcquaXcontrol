import prisma from '@/lib/prisma'
import { isSessionValid } from '@/lib/users'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { id } = await params

        const order = await prisma.serviceOrder.findFirst({
            where: { id, deletedAt: null },
            include: {
                readingRoute: { select: { id: true, name: true, status: true } },
                assignedToUser: { select: { id: true, name: true, email: true } },
                serviceOrderItems: { orderBy: { sortOrder: 'asc' } }
            }
        })

        if (!order) return NextResponse.json({ error: 'Ordem de serviço não encontrada' }, { status: 404 })

        return NextResponse.json(order)
    } catch (error) {
        console.error('[GET /api/service-orders/[id]]', error)
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

        const {
            status,
            notes,
            leiturnistaSignature,
            syndicSignature,
            syndicName,
            syndicRole,
            pdfUrl,
            readingSummary,
            itemUpdates, // Array of { id, currentReading, photoUrl, photoSource, status, skipReason }
        } = body

        // Prepare order update
        const orderData: any = {
            updatedByUserId: validSession.userId,
        }
        if (status !== undefined) orderData.status = status
        if (notes !== undefined) orderData.notes = notes
        if (leiturnistaSignature !== undefined) orderData.leiturnistaSignature = leiturnistaSignature
        if (syndicSignature !== undefined) orderData.syndicSignature = syndicSignature
        if (syndicName !== undefined) orderData.syndicName = syndicName
        if (syndicRole !== undefined) orderData.syndicRole = syndicRole
        if (pdfUrl !== undefined) orderData.pdfUrl = pdfUrl
        if (readingSummary !== undefined) orderData.readingSummary = readingSummary

        // Set timestamps based on status
        if (status === 'IN_PROGRESS') orderData.startedAt = new Date()
        if (status === 'COMPLETED') orderData.completedAt = new Date()

        // Update order
        const order = await prisma.serviceOrder.update({
            where: { id },
            data: orderData,
        })

        // Update individual items if provided
        if (itemUpdates && Array.isArray(itemUpdates)) {
            await Promise.all(
                itemUpdates.map((item: any) =>
                    prisma.serviceOrderItem.update({
                        where: { id: item.id },
                        data: {
                            ...(item.currentReading !== undefined && { currentReading: item.currentReading }),
                            ...(item.consumption !== undefined && { consumption: item.consumption }),
                            ...(item.photoUrl !== undefined && { photoUrl: item.photoUrl }),
                            ...(item.photoSource !== undefined && { photoSource: item.photoSource }),
                            ...(item.photoUploadedAt !== undefined && { photoUploadedAt: new Date(item.photoUploadedAt) }),
                            ...(item.status !== undefined && { status: item.status }),
                            ...(item.skipReason !== undefined && { skipReason: item.skipReason }),
                            ...(item.readAt !== undefined && { readAt: new Date(item.readAt) }),
                        }
                    })
                )
            )
        }

        // If completed, also update the route status
        if (status === 'COMPLETED') {
            const fullOrder = await prisma.serviceOrder.findUnique({ where: { id }, select: { readingRouteId: true } })
            if (fullOrder) {
                await prisma.readingRoute.update({
                    where: { id: fullOrder.readingRouteId },
                    data: { status: 'COMPLETED', completedAt: new Date() }
                })
            }
        }

        return NextResponse.json(order)
    } catch (error) {
        console.error('[PATCH /api/service-orders/[id]]', error)
        return NextResponse.json({ error: 'Erro interno ao atualizar ordem de serviço' }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { id } = await params

        const order = await prisma.serviceOrder.update({
            where: { id },
            data: { deletedAt: new Date(), updatedByUserId: validSession.userId }
        })

        return NextResponse.json(order)
    } catch (error) {
        console.error('[DELETE /api/service-orders/[id]]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
