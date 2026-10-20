/**
 * GET /api/cron/cleanup-soft-deleted
 *
 * Inventário de registros soft-deletados há mais de 90 dias sem vínculos ativos.
 * Roda mensalmente (dia 1º, 03:00 UTC).
 *
 * HISTÓRICO (2026-10-20): este cron nunca funcionou de verdade —
 *  1) Era POST-only com Bearer CRON_SECRET, mas o Vercel Cron invoca via GET
 *     sem Authorization (405/401 em toda execução);
 *  2) Os `deleteMany` eram interceptados pela extensão de soft-delete do
 *     Prisma (lib/prisma.ts), então mesmo "removendo" apenas re-carimbava
 *     deletedAt = now — reiniciando a contagem dos 90 dias de cada registro;
 *  3) Steps 4-8 usavam nomes de relação inexistentes (`readings` em vez de
 *     `Readings`, `roleAssignments` em User) e quebravam com erro em runtime.
 *
 * MODO ATUAL (seguro, não-destrutivo): apenas CONTA os candidatos a purge,
 * sem apagar nada. Para ativar a remoção permanente, definir a env
 * ENABLE_HARD_PURGE=true e revisar o plano de integridade referencial
 * (ver RELATORIO-OTIMIZACAO.md). Purge real exige backup + autorização.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CUTOFF_DAYS = 90;

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest): Promise<NextResponse> {
  // Mesma autenticação dos outros crons: Vercel Cron (GET + x-vercel-cron) passa;
  // chamadas externas exigem Bearer CRON_SECRET (se configurado).
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!req.headers.get('x-vercel-cron');
  if (cronSecret && !isVercelCron) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
  const results: Record<string, number> = {};

  // 1-3. Readings, ApartmentConsumptionReports e DealershipReadings antigos
  results.readings = await prisma.reading.count({ where: { deletedAt: { lt: cutoff } } });
  results.consumptionReports = await prisma.apartmentConsumptionReport.count({ where: { deletedAt: { lt: cutoff } } });
  results.dealershipReadings = await prisma.dealershipReading.count({ where: { deletedAt: { lt: cutoff } } });

  // 4. Meters soft-deletados há +90 dias (sem leituras ativas) — relação é `Readings` (com R maiúsculo)
  results.meters = await prisma.meter.count({
    where: {
      deletedAt: { lt: cutoff },
      Readings: { none: { deletedAt: null } },
    },
  });

  // 5. Apartments soft-deletados há +90 dias (sem medidores ativos)
  results.apartments = await prisma.apartment.count({
    where: {
      deletedAt: { lt: cutoff },
      meters: { none: { deletedAt: null } },
    },
  });

  // 6. Blocks soft-deletados há +90 dias (sem apartments ativos)
  results.blocks = await prisma.block.count({
    where: {
      deletedAt: { lt: cutoff },
      apartments: { none: { deletedAt: null } },
    },
  });

  // 7. Complexes soft-deletados há +90 dias (sem blocks ativos)
  results.complexes = await prisma.complex.count({
    where: {
      deletedAt: { lt: cutoff },
      blocks: { none: { deletedAt: null } },
    },
  });

  // 8. Users soft-deletados há +90 dias (sem roleAssignments ativos — User não tem
  // relação direta com RoleAssignment no schema; checamos via userId escalar)
  const staleUserIds = (await prisma.user.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
    take: 5000,
  })).map(u => u.id);
  if (staleUserIds.length > 0) {
    const usersWithActiveRa = await prisma.roleAssignment.findMany({
      where: { userId: { in: staleUserIds }, deletedAt: null },
      distinct: ['userId'],
      select: { userId: true },
    });
    const activeSet = new Set(usersWithActiveRa.map(r => r.userId));
    results.users = staleUserIds.filter(id => !activeSet.has(id)).length;
  } else {
    results.users = 0;
  }

  // 9-10. EmailJobs concluídos e GlAlarms acknowledged antigos
  results.emailJobs = await prisma.emailJob.count({
    where: { status: { in: ['sent', 'failed', 'skipped'] }, updatedAt: { lt: cutoff } },
  });
  results.glAlarms = await prisma.glAlarm.count({
    where: { acknowledged: true, alarmAt: { lt: cutoff } },
  });

  const totalCandidates = Object.values(results).reduce((s, n) => s + n, 0);

  return NextResponse.json({
    success: true,
    mode: 'inventory', // não-destrutivo: apenas contagem
    hardPurgeEnabled: process.env.ENABLE_HARD_PURGE === 'true',
    cutoffDate: cutoff.toISOString().slice(0, 10),
    totalPurgeCandidates: totalCandidates,
    details: results,
  });
}
