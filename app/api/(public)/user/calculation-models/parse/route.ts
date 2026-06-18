/**
 * POST /api/user/calculation-models/parse
 * Recebe um arquivo .xlsx (multipart), extrai o modelo de cálculo e retorna o draft para revisão.
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateUserSession } from '@/lib/users'
import { parseCalculationModel } from '@/lib/services/calculation-model-parser'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req)
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Apenas arquivos .xlsx ou .xls são suportados.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const draft = await parseCalculationModel(buffer, file.name)

    return NextResponse.json({ draft })
  } catch (e: any) {
    console.error('[API calculation-models/parse]', e)
    return NextResponse.json({ error: 'Erro ao processar planilha.' }, { status: 500 })
  }
}
