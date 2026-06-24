/**
 * GET  /api/admin/dealership-readings/duplicates
 *   Lists all groups of duplicate DealershipReading records
 *   (same complexId + monthRef + yearRef + type, deletedAt IS NULL).
 *   Returns each group with all its records so the caller can decide
 *   which ones to soft-delete.
 *
 * POST /api/admin/dealership-readings/duplicates
 *   Body: { keepId: string } — keeps ONE record and soft-deletes all others
 *     in the same duplicate group (same complexId+monthRef+yearRef+type).
 *   OR
 *   Body: { deleteIds: string[] } — soft-deletes the specified IDs directly.
 *
 * Access: admin/system users only (isSystem check via getUserContextsForActionOnEntity).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: sessionStatus ?? 401 });

    // Only system/admin users
    const contexts = await getUserContextsForActionOnEntity(userId, 'dealershipReading', 'read');
    if (!contexts.system && contexts.companyIds.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all non-deleted dealership readings with complex name for context
    const all = await prisma.dealershipReading.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        complexId: true,
        monthRef: true,
        yearRef: true,
        type: true,
        readingDate: true,
        createdAt: true,
        complex: { select: { socialName: true, aliasName: true } },
      },
      orderBy: [{ complexId: 'asc' }, { yearRef: 'asc' }, { monthRef: 'asc' }, { createdAt: 'asc' }],
    });

    // Group by complexId+monthRef+yearRef+type
    const groupMap = new Map<string, typeof all>();
    for (const dr of all) {
      const key = `${dr.complexId}__${dr.monthRef}__${dr.yearRef}__${dr.type}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(dr);
    }

    // Keep only groups that have more than 1 record (actual duplicates)
    const duplicateGroups = Array.from(groupMap.entries())
      .filter(([, records]) => records.length > 1)
      .map(([key, records]) => ({
        key,
        complexId: records[0].complexId,
        complexName: records[0].complex?.socialName || records[0].complex?.aliasName || records[0].complexId,
        monthRef: records[0].monthRef,
        yearRef: records[0].yearRef,
        type: records[0].type,
        count: records.length,
        records: records.map(r => ({
          id: r.id,
          readingDate: r.readingDate,
          createdAt: r.createdAt,
        })),
        // Suggest keeping the most recently created one
        suggestedKeepId: records[records.length - 1].id,
      }));

    return NextResponse.json({
      totalDuplicateGroups: duplicateGroups.length,
      totalExtraRecords: duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0),
      groups: duplicateGroups,
    });
  } catch (e: any) {
    console.error('[admin/dealership-readings/duplicates GET]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: sessionStatus ?? 401 });

    // Only system/admin users
    const contexts = await getUserContextsForActionOnEntity(userId, 'dealershipReading', 'delete');
    if (!contexts.system && contexts.companyIds.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // ── Mode 1: keepId — find all sibling duplicates and soft-delete them ──────
    if (body.keepId) {
      const keepId: string = body.keepId;
      const keeper = await prisma.dealershipReading.findFirst({
        where: { id: keepId, deletedAt: null },
        select: { id: true, complexId: true, monthRef: true, yearRef: true, type: true },
      });
      if (!keeper) {
        return NextResponse.json({ error: 'Registro não encontrado ou já deletado.' }, { status: 404 });
      }

      // Soft-delete all siblings (same complex+month+year+type, but NOT the keeper)
      const result = await prisma.dealershipReading.updateMany({
        where: {
          complexId: keeper.complexId,
          monthRef: keeper.monthRef,
          yearRef: keeper.yearRef,
          type: keeper.type,
          deletedAt: null,
          id: { not: keepId },
        },
        data: { deletedAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        keptId: keepId,
        deletedCount: result.count,
        message: `${result.count} registro(s) duplicado(s) removido(s). Mantido: ${keepId}`,
      });
    }

    // ── Mode 2: deleteIds — soft-delete specific IDs ───────────────────────────
    if (Array.isArray(body.deleteIds) && body.deleteIds.length > 0) {
      const deleteIds: string[] = body.deleteIds;
      const result = await prisma.dealershipReading.updateMany({
        where: {
          id: { in: deleteIds },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        deletedCount: result.count,
        message: `${result.count} registro(s) removido(s).`,
      });
    }

    return NextResponse.json({ error: 'Informe keepId ou deleteIds no corpo da requisição.' }, { status: 400 });
  } catch (e: any) {
    console.error('[admin/dealership-readings/duplicates POST]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
