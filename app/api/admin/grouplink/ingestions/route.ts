import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminOrCompanyContext } from '@/lib/admin-auth';
import { serverError } from '@/lib/safeError';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const auth = await requireAdminOrCompanyContext(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get('take') || 20), 1), 200);
    const skip = Math.max(Number(req.nextUrl.searchParams.get('skip') || 0), 0);
    const search = (req.nextUrl.searchParams.get('search') || '').trim();

    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { objectKey: { contains: search, mode: 'insensitive' } },
        { correlationId: { contains: search, mode: 'insensitive' } },
        { bucket: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.storageFileProcessing.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        include: {
          _count: { select: { errors: true } },
        },
      }),
      prisma.storageFileProcessing.count({ where }),
    ]);

    return NextResponse.json({
      list: items,
      total,
      pagination: {
        take,
        skip,
        hasMore: total > skip + take,
      },
    });
  } catch (error) {
    return serverError('admin-grouplink-ingestions-list', error);
  }
}
