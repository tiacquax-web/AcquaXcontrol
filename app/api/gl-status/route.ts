/**
 * GET /api/gl-status?complexId=xxx
 *
 * Retorna a data da última leitura automática recebida do GroupLink
 * para um condomínio específico. Usado no dashboard do síndico.
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

  // Buscar a leitura mais recente de medidores deste condomínio
  // que tenham glId (ou seja, recebidas via GroupLink)
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
    // Fallback: buscar última leitura de qualquer medidor do condomínio
    const lastAny = await prisma.reading.findFirst({
      where: {
        deletedAt: null,
        meter: { complexId, deletedAt: null },
      },
      orderBy: { readAt: 'desc' },
      select: { readAt: true },
    });

    if (!lastAny) {
      return NextResponse.json({ lastImport: null, daysSince: null });
    }

    const days = Math.floor((Date.now() - lastAny.readAt.getTime()) / (1000 * 60 * 60 * 24));
    return NextResponse.json({
      lastImport: lastAny.readAt.toISOString().slice(0, 10),
      daysSince: days,
    });
  }

  const days = Math.floor((Date.now() - lastReading.readAt.getTime()) / (1000 * 60 * 60 * 24));
  return NextResponse.json({
    lastImport: lastReading.readAt.toISOString().slice(0, 10),
    daysSince: days,
  });
}
