// app/api/apuracao/route.ts
// API de Apuração: retorna dados detalhados de um condomínio ou lista geral para o admin
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import { serverError } from '@/lib/safeError';

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function complexMatchesSearch(
    complex: { socialName: string; aliasName: string | null },
    rawSearch: string
): boolean {
    const normalizedSearch = normalizeText(rawSearch);
    if (!normalizedSearch) return true;
    const social = normalizeText(complex.socialName || '');
    const alias = normalizeText(complex.aliasName || '');
    return social.includes(normalizedSearch) || alias.includes(normalizedSearch);
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError } = await validateUserSession(req);
        if (sessionError || !userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const complexId = req.nextUrl.searchParams.get('complexId') || undefined;
        const search = (req.nextUrl.searchParams.get('search') || '').trim();
        const takeRaw = parseInt(req.nextUrl.searchParams.get('take') || '50', 10);
        const skipRaw = parseInt(req.nextUrl.searchParams.get('skip') || '0', 10);
        const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 200) : 50;
        const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0;

        const notDeletedWhere = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

        type ComplexRow = {
            id: string;
            socialName: string;
            aliasName: string | null;
            city: string | null;
            state: string | null;
            status: string;
            _count: { blocks: number };
        };

        let complexes: ComplexRow[] = [];
        let totalCount = 0;

        if (complexId) {
            complexes = await prisma.complex.findMany({
                where: {
                    AND: [notDeletedWhere, { id: complexId }],
                },
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
                take,
                skip,
            });
            totalCount = complexes.length;
        } else if (search) {
            const searchWhere = {
                OR: [
                    { socialName: { contains: search, mode: 'insensitive' as const } },
                    { aliasName: { contains: search, mode: 'insensitive' as const } },
                ],
            };
            const where = { AND: [notDeletedWhere, searchWhere] };

            const [directComplexes, directCount] = await Promise.all([
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

            if (directCount > 0) {
                complexes = directComplexes;
                totalCount = directCount;
            } else {
                // Fallback para busca tolerante a acentos/diacríticos.
                const allComplexes = await prisma.complex.findMany({
                    where: notDeletedWhere,
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
                    take: 3000,
                });
                const filtered = allComplexes.filter((cx) => complexMatchesSearch(cx, search));
                totalCount = filtered.length;
                complexes = filtered.slice(skip, skip + take);
            }
        } else {
            const where = notDeletedWhere;
            const [baseComplexes, baseCount] = await Promise.all([
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
            complexes = baseComplexes;
            totalCount = baseCount;
        }

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

        const aptCountMap = new Map<string, number>();
        aptCounts.forEach((a) => { if (a.complexId) aptCountMap.set(a.complexId, a._count.id); });

        const meterCountMap = new Map<string, number>();
        meterCounts.forEach((m) => { if (m.complexId) meterCountMap.set(m.complexId, m._count.id); });

        // Get last reading date per complex
        const lastReadings = await prisma.apartmentConsumptionReport.findMany({
            where: { complexId: { in: complexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            select: { complexId: true, yearRef: true, monthRef: true },
            orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
            distinct: ['complexId'],
        });
        const lastReadingMap = new Map<string, string>();
        lastReadings.forEach(r => {
            if (r.complexId) {
                lastReadingMap.set(r.complexId, `${String(r.monthRef).padStart(2, '0')}/${r.yearRef}`);
            }
        });

        // Get login counts per complex (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const complexRoleAssignments = await prisma.roleAssignment.findMany({
            where: { contextId: { in: complexIds }, contextType: 'complex', OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            select: { userId: true, contextId: true },
        });

        const apartmentsInPage = await prisma.apartment.findMany({
            where: {
                complexId: { in: complexIds },
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { id: true, name: true, complexId: true },
            take: 30000,
        });
        const apartmentIdsInPage = apartmentsInPage.map((apt) => apt.id);

        const apartmentRoleAssignments = apartmentIdsInPage.length > 0
            ? await prisma.roleAssignment.findMany({
                where: {
                    contextType: 'apartment',
                    contextId: { in: apartmentIdsInPage },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { userId: true, contextId: true },
            })
            : [];

        // Get recent sessions for those users
        const allUserIds = [...new Set([...complexRoleAssignments, ...apartmentRoleAssignments].map(ra => ra.userId))];
        const recentSessions = allUserIds.length > 0 ? await prisma.session.findMany({
            where: { userId: { in: allUserIds }, createdAt: { gte: thirtyDaysAgo } },
            select: { userId: true },
            distinct: ['userId'],
            take: 5000,
        }) : [];
        const recentUserSet = new Set(recentSessions.map(s => s.userId));

        const apartmentToComplexMap = new Map<string, string>();
        const apartmentNameMap = new Map<string, string>();
        apartmentsInPage.forEach((apt) => {
            if (apt.complexId) apartmentToComplexMap.set(apt.id, apt.complexId);
            apartmentNameMap.set(apt.id, apt.name);
        });

        const accessUsersByComplex = new Map<string, Set<string>>();
        for (const ra of complexRoleAssignments) {
            if (!ra.contextId || !recentUserSet.has(ra.userId)) continue;
            const set = accessUsersByComplex.get(ra.contextId) ?? new Set<string>();
            set.add(ra.userId);
            accessUsersByComplex.set(ra.contextId, set);
        }

        const accessUsersByApartment = new Map<string, Set<string>>();
        for (const ra of apartmentRoleAssignments) {
            if (!ra.contextId || !recentUserSet.has(ra.userId)) continue;
            const cxId = apartmentToComplexMap.get(ra.contextId);
            if (!cxId) continue;

            const complexSet = accessUsersByComplex.get(cxId) ?? new Set<string>();
            complexSet.add(ra.userId);
            accessUsersByComplex.set(cxId, complexSet);

            const aptSet = accessUsersByApartment.get(ra.contextId) ?? new Set<string>();
            aptSet.add(ra.userId);
            accessUsersByApartment.set(ra.contextId, aptSet);
        }

        const topApartmentByComplex = new Map<string, { name: string; logins: number }>();
        for (const apt of apartmentsInPage) {
            const cxId = apt.complexId;
            if (!cxId) continue;
            const logins = accessUsersByApartment.get(apt.id)?.size ?? 0;
            if (logins === 0) continue;
            const currentTop = topApartmentByComplex.get(cxId);
            if (!currentTop || logins > currentTop.logins) {
                topApartmentByComplex.set(cxId, { name: apartmentNameMap.get(apt.id) || apt.name, logins });
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
            totalApartments: aptCountMap.get(cx.id) ?? 0,
            totalMeters: meterCountMap.get(cx.id) ?? 0,
            lastReading: lastReadingMap.get(cx.id) ?? null,
            loginsLast30Days: accessUsersByComplex.get(cx.id)?.size ?? 0,
            topApartment: topApartmentByComplex.get(cx.id) ?? null,
        }));

        return NextResponse.json({ list: result, totalCount });
    } catch (e: unknown) {
        return serverError('apuracao', e);
    }
}
