/**
 * POST /api/admin/gl/update-meter-glids
 *
 * Atualiza em lote apenas o campo glId dos medidores existentes,
 * sem alterar nenhum outro dado do medidor.
 *
 * Body: { rows: Array<{ chassi: string; gl_id: string }> }
 *
 * Resposta:
 *   { updated: number, notFound: string[], errors: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verifica permissão (system = admin/programador)
    const contexts = await getUserContextsForActionOnEntity(userId, 'system', 'create');
    if (!contexts.system) {
      return NextResponse.json({ error: 'Apenas administradores podem atualizar glIds em lote.' }, { status: 403 });
    }

    const { default: prisma } = await import('@/lib/prisma');

    const body = await req.json();
    const rows: Array<{ chassi: string; gl_id: string }> = body?.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha informada.' }, { status: 400 });
    }

    // Validação básica
    const validationErrors: string[] = [];
    const validRows: Array<{ chassi: string; glId: string }> = [];

    rows.forEach((row, idx) => {
      const chassi = row.chassi !== undefined && row.chassi !== null ? String(row.chassi).trim().toUpperCase() : '';
      const glId = (row as any).gl_id !== undefined && (row as any).gl_id !== null
        ? String((row as any).gl_id).trim()
        : (row as any).glId !== undefined && (row as any).glId !== null
        ? String((row as any).glId).trim()
        : '';

      if (!chassi) {
        validationErrors.push(`Linha ${idx + 2}: chassi não informado`);
        return;
      }
      if (!glId) {
        validationErrors.push(`Linha ${idx + 2}: gl_id não informado para chassi '${chassi}'`);
        return;
      }
      validRows.push({ chassi, glId });
    });

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'Erros de validação', details: validationErrors }, { status: 400 });
    }

    // Busca todos os medidores pelos chassi informados
    const allChassis = validRows.map((r) => r.chassi);
    const existingMeters = await prisma.meter.findMany({
      where: { register: { in: allChassis }, deletedAt: null },
      select: { id: true, register: true, glId: true },
    });

    const existingMap = new Map(existingMeters.map((m) => [m.register, m]));

    const notFound: string[] = [];
    const updatePromises: Promise<any>[] = [];
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of validRows) {
      const existing = existingMap.get(row.chassi);
      if (!existing) {
        notFound.push(row.chassi);
        continue;
      }
      if (existing.glId === row.glId) {
        skippedCount++;
        continue; // já está correto, sem necessidade de update
      }
      updatePromises.push(
        prisma.meter.update({
          where: { id: existing.id },
          data: { glId: row.glId },
        })
      );
      updatedCount++;
    }

    // Executa todos os updates em paralelo
    const errors: string[] = [];
    const results = await Promise.allSettled(updatePromises);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        errors.push(`Erro ao atualizar medidor: ${r.reason?.message ?? r.reason}`);
      }
    });

    return NextResponse.json({
      message: 'Atualização concluída',
      updated: updatedCount - errors.length,
      skipped: skippedCount,
      notFound,
      notFoundCount: notFound.length,
      errors,
    });
  } catch (err: any) {
    console.error('[update-meter-glids] erro:', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
