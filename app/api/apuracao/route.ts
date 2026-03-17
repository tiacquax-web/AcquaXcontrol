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

        // Base query for complexes (MongoDB-safe: deletedAt null OR not set)
        const activeFilter = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
        const where: any = { AND: [activeFilter] };
        if (search) {
            where.AND.push({
                OR: [
                    { socialName: { contains: search, mode: 'insensitive' } },
                    { aliasName: { contains: search, mode: 'insensitive' } },
                ],
            });
        }
        if (complexId) where.AND.push({ id: complexId });

        const [complexes, totalCount] = await Promise.all([
            prisma.complex.findMany({
                where,
                select: {
                    id: true,
                    socialName: true,
                    aliasName: true,
                    city: true,
                    state: true,
                    status: true,
                    // Count blocks via relation (Complex HAS blocks[])
                    _count: {
                        select: {
                            blocks: { where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } },
                        }
                    }
                },
                orderBy: { socialName: 'asc' },
                take,
                skip,
            }),
            prisma.complex.count({ where }),
        ]);

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

        // Get last reading date per complex
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

        // Get login counts per complex (last 30 days via RoleAssignments)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Complex-level role assignments
        const roleAssignments = await prisma.roleAssignment.findMany({
            where: { contextId: { in: complexIds }, contextType: 'complex', OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            select: { userId: true, contextId: true },
        });

        // Build apt→complex map only for apartments on current page complexes
        const aptComplexMap: Record<string, string> = {};
        const apartmentsInPageComplexes = await prisma.apartment.findMany({
            where: { complexId: { in: complexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            select: { id: true, complexId: true },
        });
        apartmentsInPageComplexes.forEach((apt) => {
            if (apt.complexId) aptComplexMap[apt.id] = apt.complexId;
        });

        // Apartment-level role assignments, restricted to apartments from current complexes
        const aptIds = apartmentsInPageComplexes.map((apt) => apt.id);
        const aptRoleAssignments = aptIds.length > 0 ? await prisma.roleAssignment.findMany({
            where: {
                contextType: 'apartment',
                contextId: { in: aptIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { userId: true, contextId: true },
        }) : [];

        // Get recent sessions for those users
        const allUserIds = [...new Set([...roleAssignments, ...aptRoleAssignments].map(ra => ra.userId))];
        const recentSessions = allUserIds.length > 0 ? await prisma.session.findMany({
            where: { userId: { in: allUserIds }, createdAt: { gte: thirtyDaysAgo } },
            select: { userId: true },
            distinct: ['userId'],
            take: 5000,
        }) : [];
        const recentUserSet = new Set(recentSessions.map(s => s.userId));

        // Build access count per complex
        const accessCountMap: Record<string, number> = {};
        for (const ra of roleAssignments) {
            if (recentUserSet.has(ra.userId)) {
                accessCountMap[ra.contextId] = (accessCountMap[ra.contextId] || 0) + 1;
            }
        }
        for (const ra of aptRoleAssignments) {
            const cxId = aptComplexMap[ra.contextId];
            if (cxId && recentUserSet.has(ra.userId)) {
                accessCountMap[cxId] = (accessCountMap[cxId] || 0) + 1;
            }
        }

        // Most active apartment per complex (login)
        const userCountPerApt: Record<string, Set<string>> = {};
        for (const ra of aptRoleAssignments) {
            const cxId = aptComplexMap[ra.contextId];
            if (cxId && recentUserSet.has(ra.userId)) {
                if (!userCountPerApt[ra.contextId]) userCountPerApt[ra.contextId] = new Set();
                userCountPerApt[ra.contextId].add(ra.userId);
            }
        }
        // Get apt names
        const activeAptIds = Object.keys(userCountPerApt);
        const aptNameMap: Record<string, { name: string; complexId: string | null }> = {};
        if (activeAptIds.length > 0) {
            const aptNames = await prisma.apartment.findMany({
                where: { id: { in: activeAptIds } },
                select: { id: true, name: true, complexId: true }
            });
            aptNames.forEach(a => { aptNameMap[a.id] = { name: a.name, complexId: a.complexId }; });
        }

        const topAptPerComplex: Record<string, { name: string; logins: number }> = {};
        for (const [aptId, userSet] of Object.entries(userCountPerApt)) {
            const aptInfo = aptNameMap[aptId];
            if (!aptInfo?.complexId) continue;
            const cxId = aptInfo.complexId;
            if (!topAptPerComplex[cxId] || userSet.size > topAptPerComplex[cxId].logins) {
                topAptPerComplex[cxId] = { name: aptInfo.name, logins: userSet.size };
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
            loginsLast30Days: accessCountMap[cx.id] || 0,
            topApartment: topAptPerComplex[cx.id] || null,
        }));

        return NextResponse.json({ list: result, totalCount });
    } catch (e: any) {
        return serverError('apuracao', e);
    }
}
