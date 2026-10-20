/**
 * GET /api/health
 *
 * Endpoint de health check para monitoramento externo (UptimeRobot, BetterStack,
 * DO App Platform health check, etc).
 *
 * POR QUÊ:
 *   No incidente de 2026-10-20 o MongoDB do DigitalOcean saiu do ar e o site
 *   continuou respondendo 200 em /login (é página estática com cache), então
 *   nenhum monitor percebeu que o banco estava morto — só o usuário final,
 *   ao tentar logar, recebia "erro interno".
 *   Este endpoint toca o banco de propósito, para que o monitor acuse a falha.
 *
 * CONTRATO:
 *   200 → banco respondeu  ({"status":"ok"})
 *   503 → banco inacessível ({"status":"degraded"}) — use isto como alerta
 *
 * SEGURANÇA: não expõe host, usuário, senha, nem contagem de registros.
 * Apenas o estado e a duração do ping.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Sempre executa no Node (o Prisma não roda no edge runtime).
export const runtime = 'nodejs';
// Health check precisa ser rápido; se estourar, é sinal de problema.
export const maxDuration = 15;
// Nunca cachear: monitoramento precisa do estado real a cada chamada.
export const dynamic = 'force-dynamic';

// Ping com teto de tempo próprio, para não depender só do driver.
const PING_TIMEOUT_MS = 6000;

async function pingDatabase(): Promise<void> {
  // `$runCommandRaw` é o caminho mais barato: não passa pelo middleware de
  // soft-delete nem resolve relations. `ping` responde mesmo com réplica em
  // eleição, mas falha na hora se o servidor não estiver alcançável.
  await Promise.race([
    prisma.$runCommandRaw({ ping: 1 }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout de ${PING_TIMEOUT_MS}ms no ping ao banco`)),
        PING_TIMEOUT_MS
      )
    ),
  ]);
}

export async function GET() {
  const startedAt = Date.now();

  try {
    await pingDatabase();
    return NextResponse.json(
      {
        status: 'ok',
        database: 'up',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // Log completo no servidor para o time conseguir diagnosticar.
    console.error(
      '[health] banco inacessível:',
      error instanceof Error ? error.message : error
    );

    // Resposta enxuta: quem consome o health check não precisa do stack trace,
    // e detalhes internos em endpoint público são vetor de reconhecimento.
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'down',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// Alguns monitores usam HEAD para checagem leve.
export async function HEAD() {
  const res = await GET();
  return new NextResponse(null, { status: res.status });
}
