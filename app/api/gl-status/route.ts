/**
 * GET /api/gl-status?complexId=xxx
 *
 * Retorna:
 * - hasGL: se o condomínio tem medidores com glId vinculado
 * - lastImport: data da última leitura recebida via GroupLink
 * - daysSince: dias desde a última leitura
 *
 * Usado no dashboard do síndico/admin para mostrar status das leituras automáticas.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('session')?.value;
  const validSession = session ? await isSessionValid(session) : false;
  if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const complexId = req.nextUrl.searchParams.get('complexId');
  if (!complexId) return NextResponse.json({ error: 'complexId obrigatório' }, { status: 400 });

  // 1. Verificar se o condomínio tem medidores com GL vinculado
  const glMetersCount = await prisma.meter.count({
    where: {
      complexId,
      deletedAt: null,
      glId: { not: null },
    },
  });

  const hasGL = glMetersCount > 0;

  if (!hasGL) {
    // Sem GL — retorna hasGL=false, sem datas
    return NextResponse.json({ hasGL: false, lastImport: null, daysSince: null });
  }

  // 2. Buscar a leitura mais recente de medidores com GL deste condomínio
  const lastReading = await prisma.reading.findFirst({
    where: {
      deletedAt: null,
      meter: {
        complexId,
        deletedAt: null,
        glId: { not: null },
      },
    },
    orderBy: { readAt: 'desc' },
    select: { readAt: true },
  });

  if (!lastReading) {
    // Tem medidores GL mas nenhuma leitura recebida ainda
    return NextResponse.json({ hasGL: true, lastImport: null, daysSince: null });
  }

  const days = Math.floor((Date.now() - lastReading.readAt.getTime()) / (1000 * 60 * 60 * 24));
  return NextResponse.json({
    hasGL: true,
    lastImport: lastReading.readAt.toISOString().slice(0, 10),
    daysSince: days,
  });
}
