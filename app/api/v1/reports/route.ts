/**
 * GET /api/v1/reports — Status do levantamento de consumo por mês/condomínio
 * (equivalente ao "meter-report" usado na tela de Levantamento)
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão: reports:read
 *
 * Query obrigatória: month (MM), year (AAAA)
 * Query opcional: complex_id, apartment_id
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
    const endpoint = '/api/v1/reports';

    const auth = await authenticateApiKey(req, ['reports:read']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const sp = req.nextUrl.searchParams;
        const month = sp.get('month') || '';
        const year = sp.get('year') || '';
        const apartmentId = sp.get('apartment_id') || undefined;
        const complexId = sp.get('complex_id') || undefined;
        const take = Math.min(parseInt(sp.get('take') || '50'), 200);
        const skip = parseInt(sp.get('skip') || '0');

        if (!month || !year) {
            return NextResponse.json({ error: 'Parâmetros obrigatórios: month e year.' }, { status: 400 });
        }

        const where: any = {
            monthRef: month.padStart(2, '0'),
            yearRef: year,
            ...buildNotDeleted(),
        };
        if (apartmentId) where.apartmentId = apartmentId;

        if (auth.apiKey!.scopeComplexId) {
            where.complexId = auth.apiKey!.scopeComplexId;
        } else if (complexId) {
            where.complexId = complexId;
        }

        const [reports, totalCount] = await Promise.all([
            prisma.apartmentConsumptionReport.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    monthRef: true,
                    yearRef: true,
                    consumption: true,
                    totalConsumption: true,
                    consumptionCost: true,
                    sewageCost: true,
                    totalUnit: true,
                    apartmentId: true,
                    blockId: true,
                    complexId: true,
                    apartment: { select: { id: true, name: true, block: { select: { id: true, name: true } } } },
                },
            }),
            prisma.apartmentConsumptionReport.count({ where }),
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
            data: reports,
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
