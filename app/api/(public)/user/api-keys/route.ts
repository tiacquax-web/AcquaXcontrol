/**
 * GET  /api/user/api-keys  — Lista as API Keys do usuário autenticado
 * POST /api/user/api-keys  — Cria uma nova API Key
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { generateApiKeyPair } from '@/lib/api/apiKeyAuth';
import prisma from '@/lib/prisma';
import { ApiKeyStatus, ApiKeyType } from '@prisma/client';

// Tipos de expiração pré-definidos em horas (0 = permanente)
const EXPIRY_PRESETS: Record<string, number> = {
    '1h': 1,
    '24h': 24,
    '7d': 168,
    '30d': 720,
    'permanent': 0,
};

function computeExpiry(expiryPreset?: string, expiresAt?: string): Date | null {
    if (expiryPreset && expiryPreset !== 'permanent') {
        const hours = EXPIRY_PRESETS[expiryPreset];
        if (hours) {
            const d = new Date();
            d.setHours(d.getHours() + hours);
            return d;
        }
    }
    if (expiresAt) {
        const d = new Date(expiresAt);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'read');
        const isAdmin = contexts.system;

        // Admin vê todas; outros veem apenas as próprias
        const where: any = {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        };
        if (!isAdmin) {
            where.ownerId = userId;
        }

        const keys = await prisma.apiKey.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                status: true,
                keyType: true,
                expiresAt: true,
                lastUsedAt: true,
                permissions: true,
                description: true,
                scopeComplexId: true,
                scopeCompanyId: true,
                rateLimit: true,
                allowedIps: true,
                createdAt: true,
                ownerId: true,
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { logs: true } },
            },
        });

        // Parse permissions JSON para facilitar no frontend
        const list = keys.map((k) => ({
            ...k,
            permissions: (() => { try { return JSON.parse(k.permissions); } catch { return {}; } })(),
            allowedIps: (() => { try { return k.allowedIps ? JSON.parse(k.allowedIps) : []; } catch { return []; } })(),
            logCount: k._count.logs,
        }));

        return NextResponse.json({ list, total: list.length });
    } catch (error: any) {
        console.error('[api-keys/GET]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apiKey', 'create');
        const isAdmin = contexts.system;

        const body = await req.json();
        const {
            name,
            description,
            expiryPreset,
            expiresAt: expiresAtRaw,
            permissions = {},
            rateLimit,
            allowedIps = [],
            scopeComplexId,
            scopeCompanyId,
        } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Nome da chave é obrigatório.' }, { status: 400 });
        }

        // Somente admins podem criar chaves globais (sem escopo)
        const finalScopeComplexId = isAdmin ? (scopeComplexId || null) : null;
        const finalScopeCompanyId = isAdmin ? (scopeCompanyId || null) : null;

        // Permissões: admin pode definir qualquer coisa; usuário comum só pode permissões de leitura
        let finalPermissions = permissions;
        if (!isAdmin) {
            // Filtra: remove create/update/delete de qualquer recurso se não for admin
            const filtered: Record<string, string[]> = {};
            for (const [resource, actions] of Object.entries(permissions as Record<string, string[]>)) {
                filtered[resource] = (actions as string[]).filter((a) => a === 'read');
            }
            finalPermissions = filtered;
        }

        const expiry = computeExpiry(expiryPreset, expiresAtRaw);
        const keyType: ApiKeyType = expiry ? ApiKeyType.temporary : ApiKeyType.permanent;

        // Gera ID antecipadamente para usar na geração do token
        const keyId = crypto.randomUUID();

        const { token, hash: keyHash, prefix: keyPrefix } = await generateApiKeyPair(keyId);

        const apiKey = await prisma.apiKey.create({
            data: {
                id: keyId,
                name: name.trim(),
                description: description?.trim() || null,
                keyPrefix,
                keyHash,
                ownerId: userId,
                keyType,
                status: ApiKeyStatus.active,
                expiresAt: expiry,
                permissions: JSON.stringify(finalPermissions),
                rateLimit: rateLimit ? parseInt(rateLimit) : null,
                allowedIps: allowedIps.length > 0 ? JSON.stringify(allowedIps) : null,
                scopeComplexId: finalScopeComplexId,
                scopeCompanyId: finalScopeCompanyId,
                createdByUserId: userId,
            },
        });

        return NextResponse.json({
            apiKey: {
                id: apiKey.id,
                name: apiKey.name,
                keyPrefix: apiKey.keyPrefix,
                status: apiKey.status,
                keyType: apiKey.keyType,
                expiresAt: apiKey.expiresAt,
                createdAt: apiKey.createdAt,
            },
            // Token em texto puro — exibir UMA VEZ e nunca mais
            token,
            message: 'Guarde este token agora. Ele não será exibido novamente.',
        }, { status: 201 });
    } catch (error: any) {
        console.error('[api-keys/POST]', error);
        return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
    }
}
