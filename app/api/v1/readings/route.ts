/**
 * GET  /api/v1/readings — Lista leituras
 * POST /api/v1/readings — Cria leitura(s) (unitária ou em lote)
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão GET:  readings:read
 * Permissão POST: readings:create
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiUsage } from '@/lib/api/apiKeyAuth';
import prisma from '@/lib/prisma';

function buildNotDeleted() {
    return { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
}

// ── GET ────────────────────────────────────────────────────────────────────────
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
        const apartmentId = sp.get('apartment_id') || undefined;
        const complexId = sp.get('complex_id') || undefined;
        const from = sp.get('from') || undefined;
        const to = sp.get('to') || undefined;

        const where: any = { ...buildNotDeleted() };
        if (meterId) where.meterId = meterId;
        if (apartmentId) where.apartmentId = apartmentId;
        // NOTA: o campo de data da leitura no schema é "readAt" (DateTime), não "readingDate".
        if (from || to) {
            where.readAt = {};
            if (from) where.readAt.gte = new Date(from);
            if (to) where.readAt.lte = new Date(to);
        }

        // Restrição de escopo
        if (auth.apiKey!.scopeComplexId) {
            where.complexId = auth.apiKey!.scopeComplexId;
        } else if (complexId) {
            where.complexId = complexId;
        }

        const [readings, totalCount] = await Promise.all([
            prisma.reading.findMany({
                where,
                take,
                skip,
                orderBy: { readAt: 'desc' },
                select: {
                    id: true,
                    reading: true,
                    readAt: true,
                    readAtDate: true,
                    monthRef: true,
                    yearRef: true,
                    isPreReading: true,
                    isManualReading: true,
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

// ── POST ───────────────────────────────────────────────────────────────────────
// Body aceito:
//   { "meterId": "...", "reading": 123.45, "readAt": "2026-07-01" }              (unitária)
//   { "readings": [ { "meterId": "...", "reading": 123.45, "readAt": "..." } ] } (em lote, até 200 itens)
export async function POST(req: NextRequest): Promise<Response> {
    const start = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const endpoint = '/api/v1/readings';

    const auth = await authenticateApiKey(req, ['readings:create']);
    if (auth.error) {
        return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: auth.status });
    }

    try {
        const body = await req.json().catch(() => null);
        if (!body) return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });

        const rows: Array<{ meterId?: string; reading?: number; readAt?: string }> = Array.isArray(body.readings)
            ? body.readings
            : [body];

        if (rows.length === 0) return NextResponse.json({ error: 'Nenhuma leitura informada.' }, { status: 400 });
        if (rows.length > 200) return NextResponse.json({ error: 'Máximo de 200 leituras por requisição.' }, { status: 400 });

        const created: any[] = [];
        const errors: Array<{ index: number; error: string }> = [];

        for (const [index, row] of rows.entries()) {
            if (!row.meterId || row.reading === undefined || row.reading === null) {
                errors.push({ index, error: 'Campos obrigatórios: meterId, reading.' });
                continue;
            }

            const meter = await prisma.meter.findFirst({
                where: { id: row.meterId, ...buildNotDeleted() },
                select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true, register: true },
            });
            if (!meter) {
                errors.push({ index, error: `Medidor não encontrado: ${row.meterId}` });
                continue;
            }

            // Escopo da chave: se restrita a um condomínio, o medidor precisa pertencer a ele
            if (auth.apiKey!.scopeComplexId && meter.complexId !== auth.apiKey!.scopeComplexId) {
                errors.push({ index, error: 'Medidor fora do escopo desta API Key.' });
                continue;
            }

            const readAt = row.readAt ? new Date(row.readAt) : new Date();
            if (isNaN(readAt.getTime())) {
                errors.push({ index, error: `Data inválida: ${row.readAt}` });
                continue;
            }
            const readAtDate = readAt.toISOString().slice(0, 10);
            const monthRef = String(readAt.getMonth() + 1).padStart(2, '0');
            const yearRef = String(readAt.getFullYear());

            // Evita duplicidade: mesma leitura para o mesmo medidor no mesmo mês/ano
            const existing = await prisma.reading.findFirst({
                where: { meterId: meter.id, monthRef, yearRef, ...buildNotDeleted() },
                select: { id: true },
            });
            if (existing) {
                errors.push({ index, error: `Já existe leitura para este medidor em ${monthRef}/${yearRef} (id: ${existing.id}).` });
                continue;
            }

            const newReading = await prisma.reading.create({
                data: {
                    reading: row.reading,
                    readAt,
                    readAtDate,
                    monthRef,
                    yearRef,
                    isManualReading: true,
                    registerName: meter.register,
                    meterId: meter.id,
                    apartmentId: meter.apartmentId,
                    blockId: meter.blockId,
                    complexId: meter.complexId,
                    companyId: meter.companyId,
                },
                select: { id: true, reading: true, readAt: true, monthRef: true, yearRef: true, meterId: true },
            });
            created.push(newReading);
        }

        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'POST',
            endpoint,
            statusCode: errors.length && created.length === 0 ? 400 : 201,
            ipAddress: ip,
            responseTimeMs: Date.now() - start,
        });

        return NextResponse.json(
            {
                created,
                errors,
                summary: `${created.length} leitura(s) criada(s), ${errors.length} erro(s).`,
            },
            { status: errors.length && created.length === 0 ? 400 : 201 }
        );
    } catch (error: any) {
        await logApiUsage({
            apiKeyId: auth.apiKey!.id,
            method: 'POST',
            endpoint,
            statusCode: 500,
            ipAddress: ip,
            errorMessage: error?.message,
            responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
