/**
 * GET /api/v1/meters — Lista medidores
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão: meters:read
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
    const ua = req.headers.get('user-agent') || '';
    const endpoint = '/api/v1/meters';

    const auth = await authenticateApiKey(req, ['meters:read']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const sp = req.nextUrl.searchParams;
        const take = Math.min(parseInt(sp.get('take') || '20'), 100);
        const skip = parseInt(sp.get('skip') || '0');
        const complexId = sp.get('complex_id') || undefined;
        const blockId = sp.get('block_id') || undefined;
        const search = sp.get('search') || '';

        const where: any = { ...buildNotDeleted() };

        if (auth.apiKey!.scopeComplexId) {
            where.apartment = { complexId: auth.apiKey!.scopeComplexId };
        } else if (complexId) {
            where.apartment = { complexId };
        }
        if (blockId) where.apartment = { ...where.apartment, blockId };
        if (search) where.register = { contains: search, mode: 'insensitive' };

        const [meters, totalCount] = await Promise.all([
            prisma.meter.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    register: true,
                    status: true,
                    createdAt: true,
                    apartment: {
                        select: {
                            id: true,
                            name: true,
                            block: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.meter.count({ where }),
        ]);

        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'GET',
            endpoint,
            statusCode: 200,
            ipAddress: ip,
            userAgent: ua,
            responseTimeMs: Date.now() - start,
            queryParams: req.nextUrl.search,
        });

        return NextResponse.json({
            data: meters,
            meta: { total: totalCount, take, skip, hasNextPage: skip + take < totalCount, hasPreviousPage: skip > 0 },
        });
    } catch (error: any) {
        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'GET',
            endpoint,
            statusCode: 500,
            ipAddress: ip,
            errorMessage: error?.message,
            responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
