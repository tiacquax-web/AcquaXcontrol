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
  console.log(`[GL Cron] Iniciando importação GL em ${now.toISOString()}`);

  try {
    const result = await GlImportService.runImport(now);

    const status = result.success ? 200 : 500;

    console.log(
      `[GL Cron] Importação finalizada | success=${result.success} | ` +
        `filesFound=${result.filesFound} | filesProcessed=${result.filesProcessed} | ` +
        `rowsTotal=${result.rowsTotal} | imported=${result.imported} | ` +
        `skipped=${result.skipped} | errors=${result.errors}`,
    );

    // ── Alarmes GL (pasta alarms/) — independente do resultado das leituras ──────
    let alarmResult;
    try {
      alarmResult = await GlAlarmImportService.runImport(now);
      console.log(
        `[GL Alarm Cron] Importação finalizada | success=${alarmResult.success} | ` +
          `filesFound=${alarmResult.filesFound} | imported=${alarmResult.imported} | errors=${alarmResult.errors}`,
      );
    } catch (alarmError: any) {
      console.error(`[GL Alarm Cron] Falha: ${alarmError.message}`);
      alarmResult = { success: false, filesFound: 0, filesProcessed: 0, rowsTotal: 0, imported: 0, errors: 1, skipLog: [], error: alarmError.message };
    }

    return NextResponse.json(
      {
        success: result.success,
        executedAt: now.toISOString(),
        filesFound: result.filesFound,
        filesProcessed: result.filesProcessed,
        rowsTotal: result.rowsTotal,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        ...(result.error ? { error: result.error } : {}),
        alarms: {
          filesFound: alarmResult.filesFound,
          imported: alarmResult.imported,
          errors: alarmResult.errors,
          ...(alarmResult.error ? { error: alarmResult.error } : {}),
        },
      },
      { status },
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
