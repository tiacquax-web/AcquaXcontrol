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
        const takeRaw = parseInt(req.nextUrl.searchParams.get('take') || '50');
        const skipRaw = parseInt(req.nextUrl.searchParams.get('skip') || '0');
        const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, 100) : 50;
        const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;

        // Query estável para complexos (evita filtros frágeis para documentos legados)
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
            // Limite de segurança para não estourar CPU em listagens amplas
            take: complexId ? 1 : Math.min(Math.max(skip + take, 200), 1000),
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

        // Contagens base por condomínio
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

        // Usuários por condomínio (modo leve para listagem geral)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const complexAssignments = await prisma.roleAssignment.findMany({
            where: {
                contextType: 'complex',
                contextId: { in: complexIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { userId: true, contextId: true },
            take: 20000,
        });

        const registeredUsersByComplex: Record<string, Set<string>> = {};
        complexIds.forEach(id => {
            registeredUsersByComplex[id] = new Set<string>();
        });

        complexAssignments.forEach(ra => {
            if (!registeredUsersByComplex[ra.contextId]) registeredUsersByComplex[ra.contextId] = new Set<string>();
            registeredUsersByComplex[ra.contextId].add(ra.userId);
        });

        const allUserIds = [...new Set(complexAssignments.map(a => a.userId))];
        const recentSessions = allUserIds.length > 0
            ? await prisma.session.findMany({
                where: { userId: { in: allUserIds }, createdAt: { gte: thirtyDaysAgo } },
                select: { userId: true },
                distinct: ['userId'],
                take: 5000,
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

        const topAptPerComplex: Record<string, { name: string; logins: number }> = {};
        // Modo detalhado apenas quando um condomínio específico foi selecionado.
        // Isso evita varreduras globais de roleAssignment (principal causa de CPU alta).
        if (complexId && complexIds.length === 1) {
            const targetComplexId = complexIds[0];
            const apartments = await prisma.apartment.findMany({
                where: {
                    complexId: targetComplexId,
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { id: true, name: true },
                take: 20000,
            });
            const apartmentIds = apartments.map((a) => a.id);
            const aptNameMap = new Map(apartments.map((a) => [a.id, a.name]));

            if (apartmentIds.length > 0) {
                const apartmentAssignments = await prisma.roleAssignment.findMany({
                    where: {
                        contextType: 'apartment',
                        contextId: { in: apartmentIds },
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                    },
                    select: { userId: true, contextId: true },
                    take: 50000,
                });

                const aptUsers: Record<string, Set<string>> = {};
                apartmentAssignments.forEach((ra) => {
                    registeredUsersByComplex[targetComplexId].add(ra.userId);
                    if (!aptUsers[ra.contextId]) aptUsers[ra.contextId] = new Set<string>();
                    aptUsers[ra.contextId].add(ra.userId);
                });

                const registeredUsers = [...registeredUsersByComplex[targetComplexId]];
                const recentForComplex = registeredUsers.length > 0
                    ? await prisma.session.findMany({
                        where: { userId: { in: registeredUsers }, createdAt: { gte: thirtyDaysAgo } },
                        select: { userId: true },
                        distinct: ['userId'],
                        take: 10000,
                    })
                    : [];
                const recentForComplexSet = new Set(recentForComplex.map((s) => s.userId));
                usersAccessedByComplex[targetComplexId] = registeredUsers.filter((uid) => recentForComplexSet.has(uid)).length;

                for (const [aptId, usersSet] of Object.entries(aptUsers)) {
                    let activeUsers = 0;
                    usersSet.forEach((uid) => { if (recentForComplexSet.has(uid)) activeUsers++; });
                    if (!topAptPerComplex[targetComplexId] || activeUsers > topAptPerComplex[targetComplexId].logins) {
                        topAptPerComplex[targetComplexId] = { name: aptNameMap.get(aptId) || aptId, logins: activeUsers };
                    }
                }
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
