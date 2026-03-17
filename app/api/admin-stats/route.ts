// app/api/admin-stats/route.ts
// Retorna estatísticas gerais para o dashboard do administrador
// OTIMIZADO: queries paralelas, sem buscar todos os 285 condomínios com detalhes pesados
import { NextRequest, NextResponse } from 'next/server';
import { serverError } from '@/lib/safeError';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const sevenDaysAgo = startOfDay(subDays(today, 6));
    const thirtyDaysAgo = startOfDay(subDays(today, 29));

    // ─── Todas queries em paralelo ────────────────────────────────────────────
    const activeFilter = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

    const [
      totalComplexes,
      totalApartments,
      totalUsers,
      totalMeters,
      roleAssignments,
      todaySessions,
      recentSessions,
      monthlySessions,
      latestReportsRaw,
      topComplexes,
    ] = await Promise.all([
      prisma.complex.count({ where: activeFilter }),
      prisma.apartment.count({ where: activeFilter }),
      prisma.user.count({ where: activeFilter }),
      prisma.meter.count({ where: activeFilter }),

      // Apenas ids e tipos de contexto — sem detalhes pesados
      prisma.roleAssignment.findMany({
        where: activeFilter,
        select: { userId: true, contextType: true, contextId: true },
      }),

      // Sessões de hoje
      prisma.session.findMany({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
        select: { userId: true, createdAt: true },
        take: 5000,
      }),

      // Sessões últimos 7 dias
      prisma.session.findMany({
        where: { createdAt: { gte: sevenDaysAgo, lte: todayEnd } },
        select: { userId: true, createdAt: true },
        take: 20000,
      }),

      // Sessões últimos 30 dias
      prisma.session.findMany({
        where: { createdAt: { gte: thirtyDaysAgo, lte: todayEnd } },
        select: { userId: true },
        take: 50000,
      }),

      // Última filipeta por condomínio (usando distinct para pegar apenas uma por complexId)
      prisma.apartmentConsumptionReport.findMany({
        where: activeFilter,
        select: { complexId: true, yearRef: true, monthRef: true },
        orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
        distinct: ['complexId'],
      }),

      // Top 10 condomínios com contagens básicas (MUITO mais rápido que buscar todos)
      prisma.complex.findMany({
        where: activeFilter,
        select: {
          id: true,
          socialName: true,
          aliasName: true,
          _count: {
            select: { blocks: true },
          },
        },
        take: 300,
        orderBy: { socialName: 'asc' },
      }),
    ]);

    const topComplexIds = topComplexes.map((cx) => cx.id);
    const [apartmentsByComplex, metersByComplex] = topComplexIds.length > 0
      ? await Promise.all([
          prisma.apartment.groupBy({
            by: ['complexId'],
            where: { complexId: { in: topComplexIds }, ...activeFilter },
            _count: { id: true },
          }),
          prisma.meter.groupBy({
            by: ['complexId'],
            where: { complexId: { in: topComplexIds }, ...activeFilter },
            _count: { id: true },
          }),
        ])
      : [[], []];

    const apartmentsMap: Record<string, number> = {};
    apartmentsByComplex.forEach((row) => {
      if (row.complexId) apartmentsMap[row.complexId] = row._count.id;
    });

    const metersMap: Record<string, number> = {};
    metersByComplex.forEach((row) => {
      if (row.complexId) metersMap[row.complexId] = row._count.id;
    });

    // ─── Conjuntos de usuários por tipo ───────────────────────────────────────
    const systemUsers    = new Set(roleAssignments.filter(r => r.contextType === 'system').map(r => r.userId));
    const companyUsers   = new Set(roleAssignments.filter(r => r.contextType === 'company').map(r => r.userId));
    const complexUsers   = new Set(roleAssignments.filter(r => r.contextType === 'complex').map(r => r.userId));
    const apartmentUsers = new Set(roleAssignments.filter(r => r.contextType === 'apartment').map(r => r.userId));

    // ─── Logins de hoje por perfil ────────────────────────────────────────────
    const todayUserIds = [...new Set(todaySessions.map(s => s.userId))];
    const todayLoginsByType = { moradores: 0, sindicos: 0, administradoras: 0, programadores: 0 };
    for (const uid of todayUserIds) {
      if (systemUsers.has(uid))       todayLoginsByType.programadores++;
      else if (companyUsers.has(uid))  todayLoginsByType.administradoras++;
      else if (complexUsers.has(uid))  todayLoginsByType.sindicos++;
      else if (apartmentUsers.has(uid)) todayLoginsByType.moradores++;
    }

    // ─── Gráfico de logins últimos 7 dias ─────────────────────────────────────
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
      if (systemUsers.has(s.userId))       loginsByDay[key].programadores++;
      else if (companyUsers.has(s.userId))  loginsByDay[key].administradoras++;
      else if (complexUsers.has(s.userId))  loginsByDay[key].sindicos++;
      else if (apartmentUsers.has(s.userId)) loginsByDay[key].moradores++;
    }

    // ─── Última leitura por condomínio (índice) ───────────────────────────────
    const latestByComplex: Record<string, { year: number; month: number }> = {};
    for (const r of latestReportsRaw) {
      if (!r.complexId) continue;
      if (!latestByComplex[r.complexId]) {
        latestByComplex[r.complexId] = { year: Number(r.yearRef), month: Number(r.monthRef) };
      }
    }

    // ─── Condomínios com datas (sem busca pesada de blocos/aptos) ─────────────
    const complexesWithDates = topComplexes.map(cx => {
      const latest = latestByComplex[cx.id];
      const lastReadingDate = latest ? new Date(latest.year, latest.month - 1, 1) : null;
      return {
        id: cx.id,
        socialName: cx.socialName,
        aliasName: cx.aliasName,
        lastReadingDate,
        lastReadingLabel: latest ? `${String(latest.month).padStart(2, '0')}/${latest.year}` : null,
        totalApartments: apartmentsMap[cx.id] ?? 0,
        totalMeters: metersMap[cx.id] ?? 0,
      };
    });

    const withDates = complexesWithDates.filter(c => c.lastReadingDate !== null);
    const withoutDates = complexesWithDates.filter(c => c.lastReadingDate === null);
    withDates.sort((a, b) => b.lastReadingDate!.getTime() - a.lastReadingDate!.getTime());

    const mostUpdated  = withDates[0] ?? null;
    const leastUpdated = withDates.length > 1 ? withDates[withDates.length - 1] : (withoutDates[0] ?? null);

    // ─── Condomínios mais/menos acessados (30 dias) ───────────────────────────
    const monthlyUserIds = [...new Set(monthlySessions.map(s => s.userId))];
    const complexAccessTotal: Record<string, Set<string>> = {};

    if (monthlyUserIds.length > 0) {
      const monthlyAptRoles = roleAssignments.filter(
        r => r.contextType === 'apartment' && monthlyUserIds.includes(r.userId)
      );
      const monthlyAptIds = [...new Set(monthlyAptRoles.map(r => r.contextId))];

      if (monthlyAptIds.length > 0) {
        const monthlyApts = await prisma.apartment.findMany({
          where: { id: { in: monthlyAptIds } },
          select: { id: true, complexId: true },
        });
        const aptToComplex: Record<string, string> = {};
        monthlyApts.forEach(a => { if (a.complexId) aptToComplex[a.id] = a.complexId; });

        for (const ra of monthlyAptRoles) {
          const cxId = aptToComplex[ra.contextId];
          if (!cxId) continue;
          if (!complexAccessTotal[cxId]) complexAccessTotal[cxId] = new Set();
          complexAccessTotal[cxId].add(ra.userId);
        }
      }
    }

    const accessCounts = complexesWithDates.map(cx => ({
      ...cx,
      accessCount: complexAccessTotal[cx.id]?.size ?? 0,
    }));
    accessCounts.sort((a, b) => b.accessCount - a.accessCount);
    const mostAccessed  = accessCounts.length > 0 && accessCounts[0].accessCount > 0 ? accessCounts[0] : null;
    const leastAccessed = accessCounts.length > 1 ? accessCounts[accessCounts.length - 1] : null;

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
    return serverError('admin-stats', e);
  }
}
