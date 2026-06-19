/**
 * GET /api/v1/readings — Lista leituras
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão: readings:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiUsage } from '@/lib/api/apiKeyAuth';
import prisma from '@/lib/prisma';

function buildNotDeleted() {
    return { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
}

export async function GET(req: NextRequest): Promise<Response> {
    const start = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const endpoint = '/api/v1/readings';

    const auth = await authenticateApiKey(req, ['readings:read']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const sp = req.nextUrl.searchParams;
        const take = Math.min(parseInt(sp.get('take') || '20'), 100);
        const skip = parseInt(sp.get('skip') || '0');
        const meterId = sp.get('meter_id') || undefined;
        const from = sp.get('from') || undefined;
        const to = sp.get('to') || undefined;

        const where: any = { ...buildNotDeleted() };
        if (meterId) where.meterId = meterId;
        if (from || to) {
            where.readingDate = {};
            if (from) where.readingDate.gte = new Date(from);
            if (to) where.readingDate.lte = new Date(to);
        }

        // Restrição de escopo
        if (auth.apiKey!.scopeComplexId) {
            where.meter = { apartment: { complexId: auth.apiKey!.scopeComplexId } };
        }

        const [readings, totalCount] = await Promise.all([
            prisma.reading.findMany({
                where,
                take,
                skip,
                orderBy: { readingDate: 'desc' },
                select: {
                    id: true,
                    reading: true,
                    readingDate: true,
                    createdAt: true,
                    meter: {
                        select: {
                            id: true,
                            register: true,
                            apartment: {
                                select: {
                                    id: true,
                                    name: true,
                                    block: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.reading.count({ where }),
        ]);

        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'GET',
            endpoint,
            statusCode: 200,
            ipAddress: ip,
            responseTimeMs: Date.now() - start,
            queryParams: req.nextUrl.search,
        });

        return NextResponse.json({
            data: readings,
            meta: { total: totalCount, take, skip, hasNextPage: skip + take < totalCount, hasPreviousPage: skip > 0 },
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
