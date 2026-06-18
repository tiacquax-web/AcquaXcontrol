/**
 * GET    /api/user/calculation-models/[modelId]
 * PATCH  /api/user/calculation-models/[modelId]
 * DELETE /api/user/calculation-models/[modelId]
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateUserSession } from '@/lib/users'
import prisma from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { modelId: string } }
): Promise<Response> {
  try {
    const { userId, error } = await validateUserSession(req)
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const model = await prisma.calculationModel.findFirst({
      where: { id: params.modelId, deletedAt: null },
      include: {
        complexModels: {
          where: { isActive: true },
          include: { complex: { select: { id: true, socialName: true, aliasName: true } } },
        },
      },
    })

    if (!model) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })
    return NextResponse.json({ model })
  } catch (e: any) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { modelId: string } }
): Promise<Response> {
  try {
    const { userId, error } = await validateUserSession(req)
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      name, description, tariffTiers, tariffMode,
      sewagePercent, commonAreaType,
      kiteCarEnabled, kiteCarType,
      extraColumns, complexIds,
    } = body

    const updateData: any = { updatedByUserId: userId }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (tariffTiers !== undefined) updateData.tariffTiers = JSON.stringify(tariffTiers)
    if (tariffMode !== undefined) updateData.tariffMode = tariffMode
    if (sewagePercent !== undefined) updateData.sewagePercent = Number(sewagePercent)
    if (commonAreaType !== undefined) updateData.commonAreaType = commonAreaType
    if (kiteCarEnabled !== undefined) updateData.kiteCarEnabled = kiteCarEnabled
    if (kiteCarType !== undefined) updateData.kiteCarType = kiteCarType
    if (extraColumns !== undefined) updateData.extraColumns = JSON.stringify(extraColumns)

    const model = await prisma.calculationModel.update({
      where: { id: params.modelId },
      data: updateData,
    })

    // Atualizar vínculos de condomínios
    if (Array.isArray(complexIds)) {
      await prisma.complexCalculationModel.updateMany({
        where: { calculationModelId: params.modelId },
        data: { isActive: false },
      })
      for (const c of complexIds as { complexId: string; utilityType?: string }[]) {
        await prisma.complexCalculationModel.upsert({
          where: {
            complexId_calculationModelId_utilityType: {
              complexId: c.complexId,
              calculationModelId: params.modelId,
              utilityType: c.utilityType || 'water',
            },
          },
          update: { isActive: true },
          create: {
            complexId: c.complexId,
            calculationModelId: params.modelId,
            utilityType: c.utilityType || 'water',
            isActive: true,
          },
        })
      }
    }

    return NextResponse.json({ model })
  } catch (e: any) {
    console.error('[PATCH calculation-models]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { modelId: string } }
): Promise<Response> {
  try {
    const { userId, error } = await validateUserSession(req)
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await prisma.calculationModel.update({
      where: { id: params.modelId },
      data: { deletedAt: new Date(), updatedByUserId: userId, isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
