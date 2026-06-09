/**
 * GET /api/user/api-keys/logs
 * Retorna os logs recentes de todas as chaves do usuário (ou todas, se admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'read');
        const isAdmin = contexts.system;

        const take = Math.min(parseInt(req.nextUrl.searchParams.get('take') || '100'), 500);

        // Busca as chaves do usuário (ou todas se admin)
        const keysWhere: any = {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        };
        if (!isAdmin) keysWhere.ownerId = userId;

        const keyIds = (await prisma.apiKey.findMany({
            where: keysWhere,
            select: { id: true },
        })).map((k) => k.id);

        if (keyIds.length === 0) {
            return NextResponse.json({ logs: [] });
        }

        const logs = await prisma.apiLog.findMany({
            where: { apiKeyId: { in: keyIds } },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
                id: true,
                apiKeyId: true,
                method: true,
                endpoint: true,
                statusCode: true,
                ipAddress: true,
                responseTimeMs: true,
                errorMessage: true,
                createdAt: true,
                apiKey: { select: { name: true, keyPrefix: true } },
            },
        });

        return NextResponse.json({ logs, total: logs.length });
    } catch (error: any) {
        console.error('[api-keys/logs/GET]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
