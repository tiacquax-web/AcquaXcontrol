/**
 * GET  /api/v1/users  — Lista usuários (paginado, filtrado)
 * POST /api/v1/users  — Cria usuário
 *
 * Autenticação: Bearer Token (API Key)
 * Permissão GET:  users:read
 * Permissão POST: users:create
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiUsage } from '@/lib/api/apiKeyAuth';
import prisma from '@/lib/prisma';

// Helper para resposta padronizada
function apiResponse(data: any, status = 200) {
    return NextResponse.json(data, { status });
}

function buildNotDeleted() {
    return { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
    const start = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const ua = req.headers.get('user-agent') || '';
    const endpoint = '/api/v1/users';

    const auth = await authenticateApiKey(req, ['users:read']);
    if (auth.error) {
        await logApiUsage({ apiKeyId: '', method: 'GET', endpoint, statusCode: auth.status, ipAddress: ip, errorMessage: auth.error });
        return apiResponse({ error: auth.error, code: 'UNAUTHORIZED' }, auth.status);
    }

    try {
        const sp = req.nextUrl.searchParams;
        const search = sp.get('search') || '';
        const take = Math.min(parseInt(sp.get('take') || '20'), 100);
        const skip = parseInt(sp.get('skip') || '0');
        const complexId = sp.get('complex_id') || undefined;

        const where: any = { ...buildNotDeleted() };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Escopo por complexo (respeita scope da chave)
        const scopeComplexId = auth.apiKey!.scopeComplexId;
        if (scopeComplexId) {
            // Chave restrita a um condomínio: filtra apartamentos desse condomínio
            const aptIds = (await prisma.apartment.findMany({
                where: { complexId: scopeComplexId, ...buildNotDeleted() },
                select: { id: true },
            })).map((a) => a.id);

            const userIds = (await prisma.roleAssignment.findMany({
                where: { contextId: { in: [scopeComplexId, ...aptIds] }, ...buildNotDeleted() },
                select: { userId: true },
            })).map((r) => r.userId);

            where.id = { in: [...new Set(userIds)] };
        } else if (complexId) {
            // Chave global com filtro de complexo do cliente
            const aptIds = (await prisma.apartment.findMany({
                where: { complexId, ...buildNotDeleted() },
                select: { id: true },
            })).map((a) => a.id);

            const userIds = (await prisma.roleAssignment.findMany({
                where: { contextId: { in: [complexId, ...aptIds] }, ...buildNotDeleted() },
                select: { userId: true },
            })).map((r) => r.userId);

            where.id = { in: [...new Set(userIds)] };
        }

        const [users, totalCount] = await Promise.all([
            prisma.user.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    telephone: true,
                    cell: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.user.count({ where }),
        ]);

        const responseData = {
            data: users,
            meta: {
                total: totalCount,
                take,
                skip,
                hasNextPage: skip + take < totalCount,
                hasPreviousPage: skip > 0,
            },
        };

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

        return apiResponse(responseData);
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
        return apiResponse({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }, 500);
    }
}
