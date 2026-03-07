// app/api/admin-stats/route.ts
// Retorna estatísticas gerais para o dashboard do administrador
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Contagens gerais ─────────────────────────────────────────────────────
    const [
      totalComplexes,
      totalApartments,
      totalUsers,
      totalMeters,
    ] = await Promise.all([
      prisma.complex.count({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } }),
      prisma.apartment.count({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } }),
      prisma.user.count({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } }),
      prisma.meter.count({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } }),
    ]);

    // ─── Condomínios com última leitura ───────────────────────────────────────
    const complexes = await prisma.complex.findMany({
      where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: {
        id: true,
        socialName: true,
        aliasName: true,
        blocks: {
          where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          select: {
            apartments: {
              where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
              select: {
                id: true,
                _count: { select: { meters: true } },
              },
            },
          },
        },
      },
    });

    // Get last reading date per complex via apartmentConsumptionReport
    const latestReports = await prisma.apartmentConsumptionReport.findMany({
      where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: {
        complexId: true,
        yearRef: true,
        monthRef: true,
      },
      orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
    });

    // Index latest report date per complex
    const latestByComplex: Record<string, { year: number; month: number }> = {};
    for (const r of latestReports) {
      if (!r.complexId) continue;
      if (!latestByComplex[r.complexId]) {
        latestByComplex[r.complexId] = {
          year: Number(r.yearRef),
          month: Number(r.monthRef),
        };
      }
    }

    // ─── Role assignments by context type for user-type counts ───────────────
    const roleAssignments = await prisma.roleAssignment.findMany({
      where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: {
        userId: true,
        contextType: true,
        contextId: true,
        role: { select: { name: true } },
      },
    });

    // Count unique users per context type
    const systemUsers = new Set(roleAssignments.filter(r => r.contextType === 'system').map(r => r.userId));
    const companyUsers = new Set(roleAssignments.filter(r => r.contextType === 'company').map(r => r.userId));
    const complexUsers = new Set(roleAssignments.filter(r => r.contextType === 'complex').map(r => r.userId));
    const apartmentUsers = new Set(roleAssignments.filter(r => r.contextType === 'apartment').map(r => r.userId));

    // ─── Logins de hoje por perfil ────────────────────────────────────────────
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    // Get all sessions created today
    const todaySessions = await prisma.session.findMany({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      select: { userId: true, createdAt: true },
    });

    const todayUserIds = [...new Set(todaySessions.map(s => s.userId))];

    // Classify each user that logged in today by their context type
    const todayLoginsByType = { moradores: 0, sindicos: 0, administradoras: 0, programadores: 0 };
    for (const uid of todayUserIds) {
      if (systemUsers.has(uid)) {
        todayLoginsByType.programadores++;
      } else if (companyUsers.has(uid)) {
        todayLoginsByType.administradoras++;
      } else if (complexUsers.has(uid)) {
        todayLoginsByType.sindicos++;
      } else if (apartmentUsers.has(uid)) {
        todayLoginsByType.moradores++;
      }
    }

    // ─── Logins dos últimos 7 dias (gráfico) ─────────────────────────────────
    const sevenDaysAgo = startOfDay(subDays(today, 6));
    const recentSessions = await prisma.session.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo, lte: todayEnd },
      },
      select: { userId: true, createdAt: true },
    });

    // Group by day
    const loginsByDay: Record<string, { date: string; total: number; moradores: number; sindicos: number; administradoras: number; programadores: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = subDays(today, i);
      const key = format(d, 'dd/MM');
      loginsByDay[key] = { date: key, total: 0, moradores: 0, sindicos: 0, administradoras: 0, programadores: 0 };
    }

    for (const s of recentSessions) {
      const key = format(s.createdAt, 'dd/MM');
      if (!loginsByDay[key]) continue;
      loginsByDay[key].total++;
      if (systemUsers.has(s.userId)) loginsByDay[key].programadores++;
      else if (companyUsers.has(s.userId)) loginsByDay[key].administradoras++;
      else if (complexUsers.has(s.userId)) loginsByDay[key].sindicos++;
      else if (apartmentUsers.has(s.userId)) loginsByDay[key].moradores++;
    }

    // ─── Condomínio mais/menos atualizado ────────────────────────────────────
    const complexesWithDates = complexes.map(cx => {
      const latest = latestByComplex[cx.id];
      const lastReadingDate = latest ? new Date(latest.year, latest.month - 1, 1) : null;
      const totalApts = cx.blocks.reduce((s, b) => s + b.apartments.length, 0);
      const totalMtrs = cx.blocks.reduce((s, b) => s + b.apartments.reduce((ss, a) => ss + a._count.meters, 0), 0);
      return {
        id: cx.id,
        socialName: cx.socialName,
        aliasName: cx.aliasName,
        lastReadingDate,
        lastReadingLabel: latest ? `${String(latest.month).padStart(2, '0')}/${latest.year}` : null,
        totalApartments: totalApts,
        totalMeters: totalMtrs,
      };
    });

    const withDates = complexesWithDates.filter(c => c.lastReadingDate !== null);
    const withoutDates = complexesWithDates.filter(c => c.lastReadingDate === null);

    withDates.sort((a, b) => (b.lastReadingDate!.getTime() - a.lastReadingDate!.getTime()));

    const mostUpdated = withDates[0] ?? null;
    const leastUpdated = withDates.length > 1 ? withDates[withDates.length - 1] : (withoutDates[0] ?? null);

    // ─── Condomínio que mais/menos acessa (por sessões dos moradores vinculados) ──
    // Build map: complexId → set of userIds that accessed today
    const complexAccessToday: Record<string, Set<string>> = {};
    const complexAccessTotal: Record<string, Set<string>> = {};

    // Get apartment → complexId mapping for users in sessions
    if (todayUserIds.length > 0) {
      const aptUserRoles = roleAssignments.filter(
        r => r.contextType === 'apartment' && todayUserIds.includes(r.userId)
      );
      const aptIds = [...new Set(aptUserRoles.map(r => r.contextId))];

      if (aptIds.length > 0) {
        const apts = await prisma.apartment.findMany({
          where: { id: { in: aptIds } },
          select: { id: true, complexId: true },
        });
        const aptToComplex: Record<string, string> = {};
        apts.forEach(a => { if (a.complexId) aptToComplex[a.id] = a.complexId; });

        for (const ra of aptUserRoles) {
          const cxId = aptToComplex[ra.contextId];
          if (!cxId) continue;
          if (!complexAccessToday[cxId]) complexAccessToday[cxId] = new Set();
          complexAccessToday[cxId].add(ra.userId);
        }
      }
    }

    // For total access (all sessions last 30 days)
    const thirtyDaysAgo = startOfDay(subDays(today, 29));
    const monthlySessions = await prisma.session.findMany({
      where: { createdAt: { gte: thirtyDaysAgo, lte: todayEnd } },
      select: { userId: true },
    });
    const monthlyUserIds = [...new Set(monthlySessions.map(s => s.userId))];
    const monthlyAptRoles = roleAssignments.filter(
      r => r.contextType === 'apartment' && monthlyUserIds.includes(r.userId)
    );
    const monthlyAptIds = [...new Set(monthlyAptRoles.map(r => r.contextId))];

    if (monthlyAptIds.length > 0) {
      const monthlyApts = await prisma.apartment.findMany({
        where: { id: { in: monthlyAptIds } },
        select: { id: true, complexId: true },
      });
      const aptToComplex2: Record<string, string> = {};
      monthlyApts.forEach(a => { if (a.complexId) aptToComplex2[a.id] = a.complexId; });

      for (const ra of monthlyAptRoles) {
        const cxId = aptToComplex2[ra.contextId];
        if (!cxId) continue;
        if (!complexAccessTotal[cxId]) complexAccessTotal[cxId] = new Set();
        complexAccessTotal[cxId].add(ra.userId);
      }
    }

    // Find most/least accessed complex (last 30 days)
    const accessCounts = complexesWithDates.map(cx => ({
      ...cx,
      accessCount: complexAccessTotal[cx.id]?.size ?? 0,
    }));
    accessCounts.sort((a, b) => b.accessCount - a.accessCount);
    const mostAccessed = accessCounts[0]?.accessCount > 0 ? accessCounts[0] : null;
    const leastAccessed = accessCounts.length > 1 && accessCounts[accessCounts.length - 1].accessCount >= 0
      ? accessCounts[accessCounts.length - 1]
      : null;

    // ─── Resposta ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      totals: {
        complexes: totalComplexes,
        apartments: totalApartments,
        users: totalUsers,
        meters: totalMeters,
      },
      usersByType: {
        programadores: systemUsers.size,
        administradoras: companyUsers.size,
        sindicos: complexUsers.size,
        moradores: apartmentUsers.size,
      },
      todayLogins: todayLoginsByType,
      loginsByDay: Object.values(loginsByDay),
      mostUpdated,
      leastUpdated,
      mostAccessed,
      leastAccessed,
      complexes: complexesWithDates,
    });
  } catch (e: any) {
    console.error('[admin-stats]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
