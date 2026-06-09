/**
 * GET  /api/user/webhooks  — Lista webhooks
 * POST /api/user/webhooks  — Cria webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import { WebhookStatus } from '@prisma/client';

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'webhook', 'read');
        const isAdmin = contexts.system;

        const where: any = {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        };
        if (!isAdmin) where.ownerId = userId;

        const webhooks = await prisma.webhook.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                url: true,
                status: true,
                events: true,
                description: true,
                maxRetries: true,
                createdAt: true,
                ownerId: true,
                scopeComplexId: true,
                scopeCompanyId: true,
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { deliveries: true } },
            },
        });

        const list = webhooks.map((w) => ({
            ...w,
            events: (() => { try { return JSON.parse(w.events); } catch { return []; } })(),
            deliveryCount: w._count.deliveries,
        }));

        return NextResponse.json({ list, total: list.length });
    } catch (error: any) {
        console.error('[webhooks/GET]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { name, url, events = [], description, maxRetries = 3, secret, headers = {} } = body;

        if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 });
        if (!url?.trim()) return NextResponse.json({ error: 'URL é obrigatória.' }, { status: 400 });
        if (!url.startsWith('http')) return NextResponse.json({ error: 'URL deve ser http ou https.' }, { status: 400 });
        if (!Array.isArray(events) || events.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos um evento.' }, { status: 400 });
        }

        const webhook = await prisma.webhook.create({
            data: {
                name: name.trim(),
                url: url.trim(),
                description: description?.trim() || null,
                ownerId: userId,
                status: WebhookStatus.active,
                events: JSON.stringify(events),
                secret: secret?.trim() || null,
                headers: Object.keys(headers).length > 0 ? JSON.stringify(headers) : null,
                maxRetries: Math.min(parseInt(maxRetries) || 3, 10),
                createdByUserId: userId,
            },
        });

        return NextResponse.json({ webhook }, { status: 201 });
    } catch (error: any) {
        console.error('[webhooks/POST]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
