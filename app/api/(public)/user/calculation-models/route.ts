/**
 * GET  /api/user/calculation-models   → lista modelos
 * POST /api/user/calculation-models   → salva novo modelo (após revisão do draft)
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateUserSession } from '@/lib/users'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error } = await validateUserSession(req)
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const models = await prisma.calculationModel.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        complexModels: {
          where: { isActive: true },
          include: { complex: { select: { id: true, socialName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ models })
  } catch (e: any) {
    console.error('[GET calculation-models]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userId, error } = await validateUserSession(req)
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      name, description, tariffTiers, tariffMode,
      sewagePercent, commonAreaType,
      kiteCarEnabled, kiteCarType,
      extraColumns, sourceFile, complexIds,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome do modelo é obrigatório.' }, { status: 400 })
    }
    if (!tariffTiers || !Array.isArray(tariffTiers) || tariffTiers.length === 0) {
      return NextResponse.json({ error: 'Pelo menos uma faixa de tarifa é obrigatória.' }, { status: 400 })
    }

    const model = await prisma.calculationModel.create({
      data: {
        name: name.trim(),
        description: description || '',
        tariffTiers: JSON.stringify(tariffTiers),
        tariffMode: tariffMode || 'SINGLE',
        sewagePercent: Number(sewagePercent) || 0,
        commonAreaType: commonAreaType || 'NONE',
        kiteCarEnabled: !!kiteCarEnabled,
        kiteCarType: kiteCarType || null,
        extraColumns: extraColumns ? JSON.stringify(extraColumns) : null,
        sourceFile: sourceFile || null,
        createdByUserId: userId,
      },
    })

    // Vincular condomínios
    if (Array.isArray(complexIds) && complexIds.length > 0) {
      for (const c of complexIds as { complexId: string; utilityType?: string }[]) {
        try {
          await prisma.complexCalculationModel.upsert({
            where: {
              complexId_calculationModelId_utilityType: {
                complexId: c.complexId,
                calculationModelId: model.id,
                utilityType: c.utilityType || 'water',
              },
            },
            update: { isActive: true },
            create: {
              complexId: c.complexId,
              calculationModelId: model.id,
              utilityType: c.utilityType || 'water',
              isActive: true,
            },
          })
        } catch (_) {}
      }
    }

    const created = await prisma.calculationModel.findUnique({
      where: { id: model.id },
      include: {
        complexModels: {
          include: { complex: { select: { id: true, socialName: true } } },
        },
      },
    })

    return NextResponse.json({ model: created }, { status: 201 })
  } catch (e: any) {
    console.error('[POST calculation-models]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
