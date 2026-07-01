/**
 * GET /api/admin/gl/alarms
 *
 * Lista os alarmes importados da GL (pasta alarms/ no S3).
 *
 * Query params:
 *   fromDate?: YYYY-MM-DD
 *   toDate?:   YYYY-MM-DD
 *   onlyLinked?: "true" — retorna só alarmes com meterId vinculado
 *   limit?: number (default 200, max 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const onlyLinked = searchParams.get('onlyLinked') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 500);

    const where: any = { deletedAt: null };
    if (fromDate || toDate) {
      where.alarmAt = {};
      if (fromDate) where.alarmAt.gte = new Date(fromDate + 'T00:00:00Z');
      if (toDate) where.alarmAt.lte = new Date(toDate + 'T23:59:59Z');
    }
    if (onlyLinked) where.meterId = { not: null };

    const [alarms, total, byCode] = await Promise.all([
      prisma.glAlarm.findMany({
        where,
        orderBy: { alarmAt: 'desc' },
        take: limit,
        include: {
          meter: {
            select: {
              id: true,
              register: true,
              apartment: { select: { id: true, blockId: true } },
            },
          },
        },
      }),
      prisma.glAlarm.count({ where }),
      prisma.glAlarm.groupBy({ by: ['alarmCode'], where, _count: true }),
    ]);

    return NextResponse.json({
      ok: true,
      total,
      returned: alarms.length,
      byCode: byCode.map((b) => ({ alarmCode: b.alarmCode, count: b._count })),
      alarms,
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
}
