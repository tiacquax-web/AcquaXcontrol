// app/api/apuracao/route.ts
// API de Apuração: retorna dados detalhados de um condomínio ou lista geral para o admin
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import { serverError } from '@/lib/safeError';

export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError } = await validateUserSession(req);
        if (sessionError || !userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const complexId = req.nextUrl.searchParams.get('complexId') || undefined;
        const search = req.nextUrl.searchParams.get('search') || '';
        const take = parseInt(req.nextUrl.searchParams.get('take') || '50');
        const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');

        // Query estável para complexos (evita filtros que podem quebrar em alguns documentos legados)
        const where: any = {
            AND: [
                { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                complexId ? { id: complexId } : {},
            ]
        };

        let complexes = await prisma.complex.findMany({
            where,
            select: {
                id: true,
                socialName: true,
                aliasName: true,
                city: true,
                state: true,
                status: true,
                _count: {
                    select: {
                        blocks: { where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } },
                    }
                }
            },
            orderBy: { socialName: 'asc' },
            take: Math.min(skip + take, 5000),
            skip: 0,
        });
        const normalizedSearch = String(search || '').trim().toLowerCase();
        if (normalizedSearch) {
            complexes = complexes.filter((cx) =>
                String(cx.socialName || '').toLowerCase().includes(normalizedSearch) ||
                String(cx.aliasName || '').toLowerCase().includes(normalizedSearch)
            );
        }
        const totalCount = complexes.length;
        complexes = complexes.slice(skip, skip + take);

        const complexIds = complexes.map(c => c.id);
        if (complexIds.length === 0) {
            return NextResponse.json({ list: [], totalCount });
        }

        // Count apartments and meters per complex via denormalized complexId field
        const [aptCounts, meterCounts] = await Promise.all([
            prisma.apartment.groupBy({
                by: ['complexId'],
                where: { complexId: { in: complexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                _count: { id: true },
            }),
            prisma.meter.groupBy({
                by: ['complexId'],
                where: { complexId: { in: complexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                _count: { id: true },
            }),
        ]);
        const aptCountMap: Record<string, number> = {};
        aptCounts.forEach(a => { if (a.complexId) aptCountMap[a.complexId] = a._count.id; });
        const meterCountMap: Record<string, number> = {};
        meterCounts.forEach(m => { if (m.complexId) meterCountMap[m.complexId] = m._count.id; });

        // Last reading per complex
        const lastReadings = await prisma.apartmentConsumptionReport.findMany({
            where: { complexId: { in: complexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            select: { complexId: true, yearRef: true, monthRef: true },
            orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
            distinct: ['complexId'],
        });
        const lastReadingMap: Record<string, string> = {};
        lastReadings.forEach(r => {
            if (r.complexId) {
                lastReadingMap[r.complexId] = `${String(r.monthRef).padStart(2, '0')}/${r.yearRef}`;
            }
        });

        // Users per complex (registered) and users with access in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [complexAssignments, apartmentAssignments] = await Promise.all([
            prisma.roleAssignment.findMany({
                where: {
                    contextType: 'complex',
                    contextId: { in: complexIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { userId: true, contextId: true },
            }),
            prisma.roleAssignment.findMany({
                where: {
                    contextType: 'apartment',
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { userId: true, contextId: true },
                take: 50000,
            }),
        ]);

        const aptIds = [...new Set(apartmentAssignments.map(a => a.contextId))];
        const aptComplexRows = aptIds.length > 0
            ? await prisma.apartment.findMany({
                where: { id: { in: aptIds }, complexId: { in: complexIds } },
                select: { id: true, complexId: true, name: true }
            })
            : [];
        const aptToComplex: Record<string, string> = {};
        const aptNameMap: Record<string, string> = {};
        aptComplexRows.forEach(a => {
            if (a.complexId) aptToComplex[a.id] = a.complexId;
            aptNameMap[a.id] = a.name;
        });

        const registeredUsersByComplex: Record<string, Set<string>> = {};
        const aptUsersByComplex: Record<string, Set<string>> = {};
        const aptUserSets: Record<string, Set<string>> = {};
        complexIds.forEach(id => {
            registeredUsersByComplex[id] = new Set<string>();
            aptUsersByComplex[id] = new Set<string>();
        });

        complexAssignments.forEach(ra => {
            if (!registeredUsersByComplex[ra.contextId]) registeredUsersByComplex[ra.contextId] = new Set<string>();
            registeredUsersByComplex[ra.contextId].add(ra.userId);
        });
        apartmentAssignments.forEach(ra => {
            const cxId = aptToComplex[ra.contextId];
            if (!cxId) return;
            registeredUsersByComplex[cxId].add(ra.userId);
            aptUsersByComplex[cxId].add(ra.userId);
            if (!aptUserSets[ra.contextId]) aptUserSets[ra.contextId] = new Set<string>();
            aptUserSets[ra.contextId].add(ra.userId);
        });

        const allUserIds = [...new Set([
            ...complexAssignments.map(a => a.userId),
            ...apartmentAssignments.map(a => a.userId),
        ])];
        const recentSessions = allUserIds.length > 0
            ? await prisma.session.findMany({
                where: { userId: { in: allUserIds }, createdAt: { gte: thirtyDaysAgo } },
                select: { userId: true },
                distinct: ['userId'],
                take: 20000,
            })
            : [];
        const recentUserSet = new Set(recentSessions.map(s => s.userId));

        const usersAccessedByComplex: Record<string, number> = {};
        complexIds.forEach(id => { usersAccessedByComplex[id] = 0; });
        for (const cxId of complexIds) {
            const users = registeredUsersByComplex[cxId] || new Set<string>();
            let count = 0;
            users.forEach((uid) => { if (recentUserSet.has(uid)) count++; });
            usersAccessedByComplex[cxId] = count;
        }

        // Most active apartment by distinct users that logged in in last 30 days
        const topAptPerComplex: Record<string, { name: string; logins: number }> = {};
        for (const [aptId, usersSet] of Object.entries(aptUserSets)) {
            const cxId = aptToComplex[aptId];
            if (!cxId) continue;
            let activeUsers = 0;
            usersSet.forEach((uid) => { if (recentUserSet.has(uid)) activeUsers++; });
            if (!topAptPerComplex[cxId] || activeUsers > topAptPerComplex[cxId].logins) {
                topAptPerComplex[cxId] = { name: aptNameMap[aptId] || aptId, logins: activeUsers };
            }
        }

        const result = complexes.map(cx => ({
            id: cx.id,
            socialName: cx.socialName,
            aliasName: cx.aliasName,
            city: cx.city,
            state: cx.state,
            status: cx.status,
            totalBlocks: cx._count.blocks,
            totalApartments: aptCountMap[cx.id] || 0,
            totalMeters: meterCountMap[cx.id] || 0,
            lastReading: lastReadingMap[cx.id] || null,
            usersRegistered: (registeredUsersByComplex[cx.id] || new Set()).size,
            usersAccessed: usersAccessedByComplex[cx.id] || 0,
            loginsLast30Days: usersAccessedByComplex[cx.id] || 0, // compatibilidade com front atual
            topApartment: topAptPerComplex[cx.id] || null,
        }));

        return NextResponse.json({ list: result, totalCount });
    } catch (e: any) {
        return serverError('apuracao', e);
    }
}
