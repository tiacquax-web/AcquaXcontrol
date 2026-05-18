/**
 * GET /api/v1/complexes — Lista condomínios
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão: complexes:read
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
    const endpoint = '/api/v1/complexes';

    const auth = await authenticateApiKey(req, ['complexes:read']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const sp = req.nextUrl.searchParams;
        const take = Math.min(parseInt(sp.get('take') || '20'), 100);
        const skip = parseInt(sp.get('skip') || '0');
        const search = sp.get('search') || '';

        const where: any = { ...buildNotDeleted() };

        // Escopo: chave restrita a um condomínio só vê ele mesmo
        if (auth.apiKey!.scopeComplexId) {
            where.id = auth.apiKey!.scopeComplexId;
        }

        if (search) where.name = { contains: search, mode: 'insensitive' };

        const [complexes, totalCount] = await Promise.all([
            prisma.complex.findMany({
                where,
                take,
                skip,
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    city: true,
                    state: true,
                    createdAt: true,
                    _count: { select: { blocks: true } },
                },
            }),
            prisma.complex.count({ where }),
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
            data: complexes,
            meta: { total: totalCount, take, skip, hasNextPage: skip + take < totalCount, hasPreviousPage: skip > 0 },
        });
    } catch (error: any) {
        return NextResponse.json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
