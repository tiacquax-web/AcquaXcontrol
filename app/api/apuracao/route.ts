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

        // Base query for complexes
        const where: any = { deletedAt: null };
        if (search) {
            where.OR = [
                { socialName: { contains: search, mode: 'insensitive' } },
                { aliasName: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (complexId) where.id = complexId;

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
                    _count: {
                        select: {
                            blocks: { where: { deletedAt: null } },
                            Apartment: { where: { deletedAt: null } },
                            meters: { where: { deletedAt: null } },
                        }
                    }
                },
                orderBy: { socialName: 'asc' },
                take,
                skip,
            }),
            prisma.complex.count({ where }),
        ]);

        // Get last reading date per complex
        const complexIds = complexes.map(c => c.id);
        const lastReadings = await prisma.apartmentConsumptionReport.findMany({
            where: { complexId: { in: complexIds }, deletedAt: null },
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
        const roleAssignments = await prisma.roleAssignment.findMany({
            where: { contextId: { in: complexIds }, contextType: 'complex', deletedAt: null },
            select: { userId: true, contextId: true },
        });
        // Also apartment-level role assignments
        const apartmentIds = (await prisma.apartment.findMany({
            where: { complexId: { in: complexIds }, deletedAt: null },
            select: { id: true, complexId: true }
        }));
        const aptToComplex: Record<string, string> = {};
        apartmentIds.forEach(a => { if (a.complexId) aptToComplex[a.id] = a.complexId; });

        const aptRoleAssignments = await prisma.roleAssignment.findMany({
            where: { contextId: { in: apartmentIds.map(a => a.id) }, contextType: 'apartment', deletedAt: null },
            select: { userId: true, contextId: true },
        });

        // Get recent sessions for those users
        const allUserIds = [...new Set([...roleAssignments, ...aptRoleAssignments].map(ra => ra.userId))];
        const recentSessions = allUserIds.length > 0 ? await prisma.session.findMany({
            where: { userId: { in: allUserIds }, createdAt: { gte: thirtyDaysAgo } },
            select: { userId: true },
            distinct: ['userId'],
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
            const cxId = aptToComplex[ra.contextId];
            if (cxId && recentUserSet.has(ra.userId)) {
                accessCountMap[cxId] = (accessCountMap[cxId] || 0) + 1;
            }
        }

        // Most active apartment per complex (login)
        const topAptPerComplex: Record<string, { name: string; logins: number }> = {};
        const userCountPerApt: Record<string, Set<string>> = {};
        for (const ra of aptRoleAssignments) {
            if (recentUserSet.has(ra.userId)) {
                if (!userCountPerApt[ra.contextId]) userCountPerApt[ra.contextId] = new Set();
                userCountPerApt[ra.contextId].add(ra.userId);
            }
        }
        // Get apt names
        const aptNames = await prisma.apartment.findMany({
            where: { id: { in: Object.keys(userCountPerApt) } },
            select: { id: true, name: true, complexId: true }
        });
        const aptNameMap: Record<string, { name: string; complexId: string | null }> = {};
        aptNames.forEach(a => { aptNameMap[a.id] = { name: a.name, complexId: a.complexId }; });

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
            totalApartments: cx._count.Apartment,
            totalMeters: cx._count.meters,
            lastReading: lastReadingMap[cx.id] || null,
            loginsLast30Days: accessCountMap[cx.id] || 0,
            topApartment: topAptPerComplex[cx.id] || null,
        }));

        return NextResponse.json({ list: result, totalCount });
    } catch (e: any) {
        return serverError('apuracao', e);
    }
}
