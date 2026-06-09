/**
 * GET    /api/user/webhooks/[webhookId]  — Detalhes + entregas recentes
 * PATCH  /api/user/webhooks/[webhookId]  — Atualiza webhook
 * DELETE /api/user/webhooks/[webhookId]  — Remove webhook (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import { WebhookStatus } from '@prisma/client';

async function getWebhookOrFail(webhookId: string, userId: string, isAdmin: boolean) {
    const webhook = await prisma.webhook.findFirst({
        where: {
            id: webhookId,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
    });
    if (!webhook) return { webhook: null, error: 'Webhook não encontrado.', status: 404 };
    if (!isAdmin && webhook.ownerId !== userId) return { webhook: null, error: 'Acesso negado.', status: 403 };
    return { webhook, error: null, status: 200 };
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }): Promise<Response> {
    try {
        const { webhookId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'webhook', 'read');
        const isAdmin = contexts.system;

        const { webhook, error, status } = await getWebhookOrFail(webhookId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        const deliveries = await prisma.webhookDelivery.findMany({
            where: { webhookId },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });

        return NextResponse.json({
            ...webhook,
            events: (() => { try { return JSON.parse(webhook!.events); } catch { return []; } })(),
            headers: (() => { try { return webhook!.headers ? JSON.parse(webhook!.headers) : {}; } catch { return {}; } })(),
            deliveries,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }): Promise<Response> {
    try {
        const { webhookId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'webhook', 'update');
        const isAdmin = contexts.system;

        const { webhook, error, status } = await getWebhookOrFail(webhookId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        const body = await req.json();
        const { name, url, events, description, status: newStatus, maxRetries, secret, headers } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (url !== undefined) updateData.url = url.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (events !== undefined) updateData.events = JSON.stringify(events);
        if (newStatus !== undefined) {
            const validStatuses = [WebhookStatus.active, WebhookStatus.inactive];
            if (!validStatuses.includes(newStatus)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
            updateData.status = newStatus;
        }
        if (maxRetries !== undefined) updateData.maxRetries = Math.min(parseInt(maxRetries) || 3, 10);
        if (secret !== undefined) updateData.secret = secret?.trim() || null;
        if (headers !== undefined) updateData.headers = Object.keys(headers).length > 0 ? JSON.stringify(headers) : null;

        const updated = await prisma.webhook.update({ where: { id: webhookId }, data: updateData });
        return NextResponse.json({ webhook: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }): Promise<Response> {
    try {
        const { webhookId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'webhook', 'delete');
        const isAdmin = contexts.system;

        const { webhook, error, status } = await getWebhookOrFail(webhookId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        await prisma.webhook.update({
            where: { id: webhookId },
            data: { deletedAt: new Date(), status: WebhookStatus.inactive },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
