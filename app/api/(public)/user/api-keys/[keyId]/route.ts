/**
 * GET    /api/user/api-keys/[keyId]  — Detalhes de uma chave
 * PATCH  /api/user/api-keys/[keyId]  — Atualiza nome/descrição/permissões/status
 * DELETE /api/user/api-keys/[keyId]  — Revoga (soft-delete) a chave
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import { ApiKeyStatus } from '@prisma/client';

async function getKeyOrFail(keyId: string, userId: string, isAdmin: boolean) {
    const key = await prisma.apiKey.findFirst({
        where: {
            id: keyId,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
    });
    if (!key) return { key: null, error: 'Chave não encontrada.', status: 404 };
    if (!isAdmin && key.ownerId !== userId) return { key: null, error: 'Acesso negado.', status: 403 };
    return { key, error: null, status: 200 };
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ keyId: string }> }): Promise<Response> {
    try {
        const { keyId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'read');
        const isAdmin = contexts.system;

        const { key, error, status } = await getKeyOrFail(keyId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        // Logs recentes (últimos 50)
        const logs = await prisma.apiLog.findMany({
            where: { apiKeyId: keyId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json({
            ...key,
            permissions: (() => { try { return JSON.parse(key!.permissions); } catch { return {}; } })(),
            allowedIps: (() => { try { return key!.allowedIps ? JSON.parse(key!.allowedIps) : []; } catch { return []; } })(),
            logs,
        });
    } catch (error: any) {
        console.error('[api-keys/[keyId]/GET]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ keyId: string }> }): Promise<Response> {
    try {
        const { keyId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'update');
        const isAdmin = contexts.system;

        const { key, error, status } = await getKeyOrFail(keyId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        const body = await req.json();
        const { name, description, permissions, status: newStatus, rateLimit, allowedIps } = body;

        // Validar transições de status
        const validStatuses = [ApiKeyStatus.active, ApiKeyStatus.suspended, ApiKeyStatus.revoked];
        if (newStatus && !validStatuses.includes(newStatus)) {
            return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);
        if (newStatus !== undefined) {
            updateData.status = newStatus;
            if (newStatus === ApiKeyStatus.revoked) {
                updateData.revokedByUserId = userId;
                updateData.revokedAt = new Date();
            }
        }
        if (rateLimit !== undefined) updateData.rateLimit = rateLimit ? parseInt(rateLimit) : null;
        if (allowedIps !== undefined) updateData.allowedIps = allowedIps?.length > 0 ? JSON.stringify(allowedIps) : null;

        const updated = await prisma.apiKey.update({
            where: { id: keyId },
            data: updateData,
        });

        return NextResponse.json({ apiKey: updated });
    } catch (error: any) {
        console.error('[api-keys/[keyId]/PATCH]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── DELETE (revogar) ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ keyId: string }> }): Promise<Response> {
    try {
        const { keyId } = await params;
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'delete');
        const isAdmin = contexts.system;

        const { key, error, status } = await getKeyOrFail(keyId, userId, isAdmin);
        if (error) return NextResponse.json({ error }, { status });

        // Soft delete + revogar
        await prisma.apiKey.update({
            where: { id: keyId },
            data: {
                status: ApiKeyStatus.revoked,
                revokedByUserId: userId,
                revokedAt: new Date(),
                deletedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true, message: 'Chave revogada com sucesso.' });
    } catch (error: any) {
        console.error('[api-keys/[keyId]/DELETE]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
