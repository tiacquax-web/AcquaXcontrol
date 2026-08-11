/**
 * app/api/cron/gl-import/route.ts
 *
 * Rota interna chamada pelo Vercel Cron Job.
 *
 * Horários (vercel.json):
 *   - 0 10 * * *  →  07:00 BRT  (10:00 UTC)
 *   - 0 22 * * *  →  19:00 BRT  (22:00 UTC)
 *
 * Autenticação:
 *   - NÃO usa Bearer token / API key (é uma rota interna, não pública)
 *   - Protegida pelo header "Authorization: Bearer <CRON_SECRET>"
 *     enviado automaticamente pelo Vercel Cron
 *   - Em desenvolvimento local, a variável CRON_SECRET pode ser omitida
 *     para facilitar testes (a validação é pulada se CRON_SECRET não estiver definido)
 *
 * Resposta:
 *   200 — importação concluída (com ou sem leituras)
 *   401 — CRON_SECRET inválido
 *   500 — erro inesperado
 */

import { NextRequest, NextResponse } from 'next/server';
import { GlImportService } from '@/lib/services/gl-import-service';
import { GlAlarmImportService } from '@/lib/services/gl-alarm-import-service';

export const runtime = 'nodejs';
// Crons podem demorar — timeout máximo do Vercel Pro é 300s
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Autenticação por CRON_SECRET ──────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token !== cronSecret) {
      console.warn('[GL Cron] Requisição rejeitada: CRON_SECRET inválido.');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }
  } else {
    // Em produção, CRON_SECRET deve sempre estar configurado
    if (process.env.NODE_ENV === 'production') {
      console.error('[GL Cron] CRON_SECRET não configurado em produção!');
      return NextResponse.json(
        { error: 'Internal configuration error: CRON_SECRET not set' },
        { status: 500 },
      );
    }
    console.warn('[GL Cron] CRON_SECRET não definido — validação ignorada (ambiente de desenvolvimento).');
  }

  // ── Execução da importação ────────────────────────────────────────────────
  const now = new Date();
  const configuredLookback = Number.parseInt(process.env.GL_IMPORT_LOOKBACK_DAYS ?? '7', 10);
  const lookbackDays = Math.min(Math.max(Number.isFinite(configuredLookback) ? configuredLookback : 7, 0), 14);
  const dates: Date[] = [];
  for (let offset = lookbackDays; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(date);
  }
  console.log(`[GL Cron] Iniciando importação GL em ${now.toISOString()} | janela=${lookbackDays + 1} dias`);

  try {
    let success = true;
    let filesFound = 0;
    let filesProcessed = 0;
    let rowsTotal = 0;
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let alarmFilesFound = 0;
    let alarmImported = 0;
    let alarmErrors = 0;
    const byDay: Array<Record<string, unknown>> = [];

    for (const date of dates) {
      const dateLabel = date.toISOString().slice(0, 10);
      const result = await GlImportService.runImport(date);
      filesFound += result.filesFound;
      filesProcessed += result.filesProcessed;
      rowsTotal += result.rowsTotal;
      imported += result.imported;
      skipped += result.skipped;
      errors += result.errors;
      if (!result.success) success = false;

      let alarmResult;
      try {
        alarmResult = await GlAlarmImportService.runImport(date);
        alarmFilesFound += alarmResult.filesFound;
        alarmImported += alarmResult.imported;
        alarmErrors += alarmResult.errors;
        if (!alarmResult.success) success = false;
      } catch (alarmError: any) {
        alarmErrors += 1;
        success = false;
        alarmResult = { success: false, filesFound: 0, imported: 0, errors: 1, error: alarmError.message };
      }

      byDay.push({
        date: dateLabel,
        success: result.success && alarmResult.success,
        filesFound: result.filesFound,
        filesProcessed: result.filesProcessed,
        rowsTotal: result.rowsTotal,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        alarms: {
          filesFound: alarmResult.filesFound,
          imported: alarmResult.imported,
          errors: alarmResult.errors,
          ...(alarmResult.error ? { error: alarmResult.error } : {}),
        },
        ...(result.error ? { error: result.error } : {}),
      });
    }

    console.log(
      `[GL Cron] Importação finalizada | success=${success} | days=${dates.length} | ` +
        `filesFound=${filesFound} | imported=${imported} | errors=${errors} | alarmsImported=${alarmImported}`,
    );

    return NextResponse.json(
      {
        success,
        executedAt: now.toISOString(),
        lookbackDays,
        daysProcessed: dates.length,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        alarms: { filesFound: alarmFilesFound, imported: alarmImported, errors: alarmErrors },
        byDay,
      },
      { status: success ? 200 : 500 },
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GL Cron] Erro inesperado: ${message}`);
    return NextResponse.json(
      { success: false, error: message, executedAt: now.toISOString() },
      { status: 500 },
    );
  }
}
