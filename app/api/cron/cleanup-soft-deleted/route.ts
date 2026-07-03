/**
 * POST /api/cron/cleanup-soft-deleted
 *
 * Remove permanentemente registros soft-deletados há mais de 90 dias
 * que não possuem vínculos ativos. Roda mensalmente (dia 1º).
 *
 * Models limpos: User, Complex, Block, Apartment, Meter, Reading,
 *                ApartmentConsumptionReport, DealershipReading
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CUTOFF_DAYS = 90;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
  const results: Record<string, number> = {};

  // 1. Readings soft-deletados há +90 dias
  const deletedReadings = await prisma.reading.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  results.readings = deletedReadings.count;

  // 2. ApartmentConsumptionReport soft-deletados há +90 dias
  const deletedReports = await prisma.apartmentConsumptionReport.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  results.consumptionReports = deletedReports.count;

  // 3. DealershipReading soft-deletados há +90 dias
  const deletedDealership = await prisma.dealershipReading.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  results.dealershipReadings = deletedDealership.count;

  // 4. Meters soft-deletados há +90 dias (sem leituras ativas)
  const metersToDelete = await prisma.meter.findMany({
    where: {
      deletedAt: { lt: cutoff },
      readings: { none: { where: { deletedAt: null } } },
    },
    select: { id: true },
  });
  if (metersToDelete.length > 0) {
    const deletedMeters = await prisma.meter.deleteMany({
      where: { id: { in: metersToDelete.map(m => m.id) } },
    });
    results.meters = deletedMeters.count;
  } else {
    results.meters = 0;
  }

  // 5. Apartments soft-deletados há +90 dias (sem medidores ativos)
  const aptsToDelete = await prisma.apartment.findMany({
    where: {
      deletedAt: { lt: cutoff },
      meters: { none: { where: { deletedAt: null } } },
    },
    select: { id: true },
  });
  if (aptsToDelete.length > 0) {
    const deletedApts = await prisma.apartment.deleteMany({
      where: { id: { in: aptsToDelete.map(a => a.id) } },
    });
    results.apartments = deletedApts.count;
  } else {
    results.apartments = 0;
  }

  // 6. Blocks soft-deletados há +90 dias (sem apartments ativos)
  const blocksToDelete = await prisma.block.findMany({
    where: {
      deletedAt: { lt: cutoff },
      apartments: { none: { where: { deletedAt: null } } },
    },
    select: { id: true },
  });
  if (blocksToDelete.length > 0) {
    const deletedBlocks = await prisma.block.deleteMany({
      where: { id: { in: blocksToDelete.map(b => b.id) } },
    });
    results.blocks = deletedBlocks.count;
  } else {
    results.blocks = 0;
  }

  // 7. Complexes soft-deletados há +90 dias (sem blocks ativos)
  const complexesToDelete = await prisma.complex.findMany({
    where: {
      deletedAt: { lt: cutoff },
      blocks: { none: { where: { deletedAt: null } } },
    },
    select: { id: true },
  });
  if (complexesToDelete.length > 0) {
    const deletedComplexes = await prisma.complex.deleteMany({
      where: { id: { in: complexesToDelete.map(c => c.id) } },
    });
    results.complexes = deletedComplexes.count;
  } else {
    results.complexes = 0;
  }

  // 8. Users soft-deletados há +90 dias (sem roleAssignments ativos)
  const usersToDelete = await prisma.user.findMany({
    where: {
      deletedAt: { lt: cutoff },
      roleAssignments: { none: { where: { deletedAt: null } } },
    },
    select: { id: true },
  });
  if (usersToDelete.length > 0) {
    const deletedUsers = await prisma.user.deleteMany({
      where: { id: { in: usersToDelete.map(u => u.id) } },
    });
    results.users = deletedUsers.count;
  } else {
    results.users = 0;
  }

  // 9. EmailJobs concluídos há +90 dias
  const deletedJobs = await prisma.emailJob.deleteMany({
    where: {
      status: { in: ['sent', 'failed', 'skipped'] },
      updatedAt: { lt: cutoff },
    },
  });
  results.emailJobs = deletedJobs.count;

  // 10. GlAlarms acknowledged há +90 dias
  const deletedAlarms = await prisma.glAlarm.deleteMany({
    where: {
      acknowledged: true,
      alarmAt: { lt: cutoff },
    },
  });
  results.glAlarms = deletedAlarms.count;

  const totalDeleted = Object.values(results).reduce((s, n) => s + n, 0);

  return NextResponse.json({
    success: true,
    cutoffDate: cutoff.toISOString().slice(0, 10),
    totalDeleted,
    details: results,
  });
}
