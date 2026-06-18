/**
 * app/api/admin/gl/retroactive-import/route.ts
 *
 * Endpoint de importação retroativa dos arquivos GL no S3.
 *
 * Permite processar arquivos de dias anteriores (ex: 63 arquivos de Mai-12 a Jun-18, 2026).
 *
 * Método: POST
 * Auth:   sessão ativa
 * Body:
 *   { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }
 *   ou
 *   { dates: ["YYYY-MM-DD", ...] }
 *
 * Comportamento:
 *   - Chama GlImportService.runImport() para cada dia no range
 *   - Retorna métricas acumuladas + detalhes por dia
 *   - maxDuration = 300s (Vercel Pro) — para ranges maiores, chamar em batches
 *
 * Resposta:
 *   { success, daysProcessed, totalFilesFound, totalImported, totalSkipped, byDay: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { GlImportService } from '@/lib/services/gl-import-service';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min para importações maiores

interface RetroactiveBody {
  /** Data inicial do range (inclusivo) */
  fromDate?: string;  // "YYYY-MM-DD"
  /** Data final do range (inclusivo) */
  toDate?: string;    // "YYYY-MM-DD"
  /** Ou lista explícita de datas */
  dates?: string[];   // ["YYYY-MM-DD", ...]
}

function parseDateStr(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  // Cria no UTC noon para evitar problemas de fuso
  return new Date(Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0));
}

function buildDateRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── Autenticação ──────────────────────────────────────────────────────────
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: RetroactiveBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
    }

    // Montar lista de datas
    let datesToProcess: Date[] = [];

    if (body.dates && Array.isArray(body.dates)) {
      for (const ds of body.dates) {
        const d = parseDateStr(ds);
        if (d) datesToProcess.push(d);
      }
    } else if (body.fromDate && body.toDate) {
      const from = parseDateStr(body.fromDate);
      const to   = parseDateStr(body.toDate);
      if (!from || !to) {
        return NextResponse.json({ error: 'fromDate/toDate inválidos. Use YYYY-MM-DD.' }, { status: 400 });
      }
      if (from > to) {
        return NextResponse.json({ error: 'fromDate não pode ser depois de toDate.' }, { status: 400 });
      }
      datesToProcess = buildDateRange(from, to);
    } else {
      return NextResponse.json(
        { error: 'Informe { fromDate, toDate } ou { dates: [...] }.' },
        { status: 400 }
      );
    }

    // Limite de segurança: máximo 120 dias por chamada
    if (datesToProcess.length > 120) {
      return NextResponse.json(
        { error: `Máximo 120 dias por chamada. Solicitado: ${datesToProcess.length}` },
        { status: 400 }
      );
    }

    if (datesToProcess.length === 0) {
      return NextResponse.json({ error: 'Nenhuma data válida fornecida.' }, { status: 400 });
    }

    console.log(`[GL Retroactive] Iniciando importação retroativa para ${datesToProcess.length} dia(s)...`);

    // ── Importar dia a dia ────────────────────────────────────────────────────
    let totalFilesFound    = 0;
    let totalFilesProcessed = 0;
    let totalRowsTotal     = 0;
    let totalImported      = 0;
    let totalSkipped       = 0;
    let totalErrors        = 0;

    const byDay: Array<{
      date: string;
      filesFound: number;
      filesProcessed: number;
      rowsTotal: number;
      imported: number;
      skipped: number;
      errors: number;
      success: boolean;
      error?: string;
    }> = [];

    for (const date of datesToProcess) {
      const dateStr = date.toISOString().slice(0, 10);
      console.log(`[GL Retroactive] Processando: ${dateStr}`);

      try {
        const result = await GlImportService.runImport(date);

        totalFilesFound     += result.filesFound;
        totalFilesProcessed += result.filesProcessed;
        totalRowsTotal      += result.rowsTotal;
        totalImported       += result.imported;
        totalSkipped        += result.skipped;
        totalErrors         += result.errors;

        byDay.push({
          date: dateStr,
          filesFound: result.filesFound,
          filesProcessed: result.filesProcessed,
          rowsTotal: result.rowsTotal,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors,
          success: result.success,
          ...(result.error ? { error: result.error } : {}),
        });

        console.log(
          `[GL Retroactive] ${dateStr}: filesFound=${result.filesFound} ` +
          `imported=${result.imported} skipped=${result.skipped} errors=${result.errors}`
        );

      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[GL Retroactive] Erro no dia ${dateStr}: ${msg}`);
        byDay.push({
          date: dateStr,
          filesFound: 0,
          filesProcessed: 0,
          rowsTotal: 0,
          imported: 0,
          skipped: 0,
          errors: 1,
          success: false,
          error: msg,
        });
        totalErrors++;
      }
    }

    console.log(
      `[GL Retroactive] Concluído: ${datesToProcess.length} dias | ` +
      `filesFound=${totalFilesFound} | imported=${totalImported} | ` +
      `skipped=${totalSkipped} | errors=${totalErrors}`
    );

    return NextResponse.json({
      success: true,
      daysRequested: datesToProcess.length,
      daysProcessed: byDay.filter((d) => d.success).length,
      totalFilesFound,
      totalFilesProcessed,
      totalRowsTotal,
      totalImported,
      totalSkipped,
      totalErrors,
      byDay,
    });

  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GL Retroactive] Erro inesperado: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/gl/retroactive-import
 * Retorna informações sobre os logs de importação já registrados (GlImportLog).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Importar prisma aqui para evitar bundle issues
    const { default: prisma } = await import('@/lib/prisma');

    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200);

    const logs = await (prisma as any).glImportLog.findMany({
      orderBy: { executedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        executedAt: true,
        filesFound: true,
        filesProcessed: true,
        rowsTotal: true,
        imported: true,
        skipped: true,
        errors: true,
        errorMessage: true,
        createdAt: true,
      },
    });

    const total = await (prisma as any).glImportLog.count();

    return NextResponse.json({ logs, total, limit });

  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
