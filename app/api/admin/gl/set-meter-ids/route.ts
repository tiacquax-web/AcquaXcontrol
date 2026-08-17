/**
 * app/api/admin/gl/set-meter-ids/route.ts
 *
 * Endpoint de vinculação em massa do glId nos medidores.
 *
 * Recebe um array de { unidade, bloco, glId } e faz update de meter.glId
 * fazendo match por: Apartment.name = unidade  +  Block.name contendo bloco.
 *
 * Método: POST
 * Auth:   sessão ativa (qualquer usuário autenticado com acesso admin)
 * Body:   { complexId: string, mappings: Array<{ unidade: string|number, bloco: number, glId: string }> }
 *
 * Resposta:
 *   { updated: number, notFound: Array<{unidade, bloco}>, alreadySet: number, errors: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

interface GlMapping {
  unidade: string | number;
  bloco: number;
  glId: string;
}

interface SetMeterIdsBody {
  /** ID do condomínio no banco (para filtrar medidores) */
  complexId: string;
  /** Mapeamento planilha → glId */
  mappings: GlMapping[];
  /** Se true, sobrescreve glIds já preenchidos */
  overwrite?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── Autenticação ──────────────────────────────────────────────────────────
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validação do body ─────────────────────────────────────────────────────
    let body: SetMeterIdsBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
    }

    const { complexId, mappings, overwrite = false } = body;

    if (!complexId || typeof complexId !== 'string') {
      return NextResponse.json({ error: 'complexId é obrigatório.' }, { status: 400 });
    }
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json({ error: 'mappings deve ser um array não-vazio.' }, { status: 400 });
    }

    // ── Buscar todos os blocos do condomínio ──────────────────────────────────
    const blocks = await prisma.block.findMany({
      where: { complexId, deletedAt: null },
      select: { id: true, name: true },
    });

    // Mapa auxiliar: nome normalizado do bloco → blockId
    // Aceita "Bloco 1", "1", "bloco1", "BLOCO 1", etc.
    const blockMap = new Map<string, string>();
    for (const block of blocks) {
      // Normaliza: extrai apenas o número do nome do bloco
      const num = block.name.replace(/\D/g, '');
      if (num) blockMap.set(num, block.id);
      blockMap.set(block.name.trim().toLowerCase(), block.id);
    }

    // ── Processar cada mapeamento ─────────────────────────────────────────────
    let updated = 0;
    let alreadySet = 0;
    let errors = 0;
    const notFound: Array<{ unidade: string | number; bloco: number; reason: string }> = [];

    for (const mapping of mappings) {
      const { unidade, bloco, glId } = mapping;

      // Validação básica
      if (!glId || glId.trim() === '' || glId.toLowerCase() === 'xxx') continue;
      const cleanGlId = glId.trim();

      // Encontrar blockId
      const blockNum = String(bloco);
      const blockId = blockMap.get(blockNum) ?? blockMap.get(`bloco ${blockNum}`.toLowerCase());

      if (!blockId) {
        notFound.push({ unidade, bloco, reason: `Bloco ${bloco} não encontrado no condomínio` });
        continue;
      }

      // Nome do apartamento (número como string, ex: "101")
      const aptName = String(unidade);

      // Buscar apartamento
      const apartment = await prisma.apartment.findFirst({
        where: {
          name: aptName,
          blockId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!apartment) {
        notFound.push({ unidade, bloco, reason: `Apartamento ${aptName} não encontrado no Bloco ${bloco}` });
        continue;
      }

      // Buscar medidor ativo do apartamento
      const meter = await prisma.meter.findFirst({
        where: {
          apartmentId: apartment.id,
          deletedAt: null,
          status: 'Ativo',
        },
        select: { id: true, glId: true, register: true },
      });

      if (!meter) {
        notFound.push({ unidade, bloco, reason: `Nenhum medidor ativo no Ap ${aptName} Bloco ${bloco}` });
        continue;
      }

      // Verificar se já tem glId
      if (meter.glId && !overwrite) {
        alreadySet++;
        continue;
      }

      // Atualizar glId
      try {
        await prisma.meter.update({
          where: { id: meter.id },
          data: {
            glId: cleanGlId,
            updatedByUserId: userId,
          },
        });
        updated++;
      } catch (e: any) {
        errors++;
        console.error(`[GL SetMeterIds] Erro ao atualizar medidor ${meter.id}: ${e.message}`);
      }
    }

    console.log(
      `[GL SetMeterIds] Resultado: updated=${updated} alreadySet=${alreadySet} ` +
      `notFound=${notFound.length} errors=${errors}`
    );

    return NextResponse.json({
      success: true,
      updated,
      alreadySet,
      notFound,
      errors,
      total: mappings.length,
    });

  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GL SetMeterIds] Erro inesperado: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/gl/set-meter-ids?complexId=xxx
 *
 * Retorna um preview: quantos medidores do condomínio já têm glId,
 * quantos estão sem, e lista os blocos disponíveis para ajudar no mapeamento.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const complexId = req.nextUrl.searchParams.get('complexId');
    if (!complexId) {
      return NextResponse.json({ error: 'complexId é obrigatório.' }, { status: 400 });
    }

    // Buscar condomínio
    const complex = await prisma.complex.findFirst({
      where: { id: complexId, deletedAt: null },
      select: { id: true, socialName: true },
    });
    if (!complex) {
      return NextResponse.json({ error: 'Condomínio não encontrado.' }, { status: 404 });
    }

    // Buscar blocos
    const blocks = await prisma.block.findMany({
      where: { complexId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Contar medidores com/sem glId
    const [withGlId, withoutGlId] = await Promise.all([
      prisma.meter.count({
        where: { complexId, deletedAt: null, glId: { not: null } },
      }),
      prisma.meter.count({
        where: { complexId, deletedAt: null, glId: null },
      }),
    ]);

    return NextResponse.json({
      complex: { id: complex.id, name: complex.socialName },
      blocks: blocks.map((b) => ({ id: b.id, name: b.name })),
      meters: { withGlId, withoutGlId, total: withGlId + withoutGlId },
    });

  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
