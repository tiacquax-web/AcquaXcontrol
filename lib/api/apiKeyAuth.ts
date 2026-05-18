/**
 * lib/api/apiKeyAuth.ts
 *
 * Middleware de autenticação por API Key (Bearer Token).
 *
 * Uso em rotas /api/v1/*:
 *   const { apiKey, error, status } = await authenticateApiKey(req, ['users:read']);
 *   if (error) return NextResponse.json({ error }, { status });
 *
 * Formato do token: ak_<keyId>_<secret32chars>
 * Ex: ak_550e8400-e29b-41d4-a716-446655440000_Abc3Def4Ghi5Jkl6Mno7Pqr8Stu9Vwx0
 */

import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { ApiKeyStatus } from '@prisma/client';

export interface AuthenticatedApiKey {
    id: string;
    ownerId: string;
    name: string;
    permissions: Record<string, string[]>; // { "users": ["read", "create"], ... }
    scopeComplexId: string | null;
    scopeCompanyId: string | null;
    rateLimit: number | null;
    allowedIps: string[] | null;
}

export interface ApiKeyAuthResult {
    apiKey: AuthenticatedApiKey | null;
    error: string | null;
    status: number;
}

/**
 * Extrai o Bearer token do header Authorization.
 */
export function extractBearerToken(req: NextRequest): string | null {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim() || null;
}

/**
 * Autentica uma API Key e verifica as permissões requeridas.
 *
 * @param req - NextRequest
 * @param requiredPermissions - Array de "resource:action" (ex: ["users:read"])
 */
export async function authenticateApiKey(
    req: NextRequest,
    requiredPermissions: string[] = []
): Promise<ApiKeyAuthResult> {
    const token = extractBearerToken(req);

    if (!token) {
        return { apiKey: null, error: 'Token de autenticação não fornecido. Use Authorization: Bearer <token>', status: 401 };
    }

    // Formato: ak_<keyId>_<secret>
    // O keyId está entre o primeiro e segundo underscore após "ak_"
    const parts = token.split('_');
    if (parts.length < 3 || parts[0] !== 'ak') {
        return { apiKey: null, error: 'Formato de token inválido.', status: 401 };
    }

    // keyId é o UUID (parte 1), secret é tudo após "ak_<uuid>_"
    const keyId = parts[1];
    const secret = parts.slice(2).join('_');

    if (!keyId || !secret) {
        return { apiKey: null, error: 'Token malformado.', status: 401 };
    }

    // Busca a chave no banco pelo ID
    const record = await prisma.apiKey.findFirst({
        where: {
            id: keyId,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        select: {
            id: true,
            ownerId: true,
            name: true,
            keyHash: true,
            status: true,
            expiresAt: true,
            permissions: true,
            scopeComplexId: true,
            scopeCompanyId: true,
            rateLimit: true,
            allowedIps: true,
        },
    });

    if (!record) {
        return { apiKey: null, error: 'API Key não encontrada ou revogada.', status: 401 };
    }

    // Verifica status
    if (record.status === ApiKeyStatus.revoked) {
        return { apiKey: null, error: 'API Key revogada.', status: 401 };
    }
    if (record.status === ApiKeyStatus.suspended) {
        return { apiKey: null, error: 'API Key suspensa temporariamente.', status: 403 };
    }

    // Verifica expiração
    if (record.expiresAt && new Date() > record.expiresAt) {
        // Atualiza status para expired assincronamente (não bloqueia a resposta)
        void prisma.apiKey.update({
            where: { id: keyId },
            data: { status: ApiKeyStatus.expired },
        }).catch(() => {/* silencioso */});
        return { apiKey: null, error: 'API Key expirada.', status: 401 };
    }

    // Verifica o secret contra o hash
    const isValid = await compare(secret, record.keyHash);
    if (!isValid) {
        return { apiKey: null, error: 'Token inválido.', status: 401 };
    }

    // Verifica restrição de IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
    if (record.allowedIps) {
        try {
            const allowedList: string[] = JSON.parse(record.allowedIps);
            if (allowedList.length > 0 && !allowedList.includes(clientIp) && !allowedList.includes('*')) {
                return { apiKey: null, error: `Acesso bloqueado para o IP: ${clientIp}`, status: 403 };
            }
        } catch {/* ignora parse error */}
    }

    // Parse de permissões
    let permissions: Record<string, string[]> = {};
    try {
        permissions = JSON.parse(record.permissions);
    } catch {
        permissions = {};
    }

    // Verifica permissões requeridas
    for (const required of requiredPermissions) {
        const [resource, action] = required.split(':');
        const keyPerms = permissions[resource] || [];
        if (!keyPerms.includes(action) && !keyPerms.includes('*')) {
            return {
                apiKey: null,
                error: `Permissão insuficiente: esta chave não tem acesso a "${resource}:${action}".`,
                status: 403,
            };
        }
    }

    // Atualiza lastUsedAt assincronamente
    void prisma.apiKey.update({
        where: { id: keyId },
        data: { lastUsedAt: new Date() },
    }).catch(() => {/* silencioso */});

    return {
        apiKey: {
            id: record.id,
            ownerId: record.ownerId,
            name: record.name,
            permissions,
            scopeComplexId: record.scopeComplexId,
            scopeCompanyId: record.scopeCompanyId,
            rateLimit: record.rateLimit,
            allowedIps: record.allowedIps ? (() => {
                try { return JSON.parse(record.allowedIps!); } catch { return null; }
            })() : null,
        },
        error: null,
        status: 200,
    };
}

/**
 * Registra um log de uso da API Key.
 * Não lança exceção — falha silenciosamente para não impactar a resposta.
 */
export async function logApiUsage(opts: {
    apiKeyId: string;
    method: string;
    endpoint: string;
    statusCode: number;
    ipAddress?: string;
    userAgent?: string;
    responseTimeMs?: number;
    errorMessage?: string;
    queryParams?: string;
}): Promise<void> {
    try {
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        const method = validMethods.includes(opts.method.toUpperCase())
            ? opts.method.toUpperCase() as any
            : 'GET';

        await prisma.apiLog.create({
            data: {
                apiKeyId: opts.apiKeyId,
                method,
                endpoint: opts.endpoint.slice(0, 500),
                statusCode: opts.statusCode,
                ipAddress: opts.ipAddress?.slice(0, 100),
                userAgent: opts.userAgent?.slice(0, 500),
                responseTimeMs: opts.responseTimeMs,
                errorMessage: opts.errorMessage?.slice(0, 1000),
                queryParams: opts.queryParams?.slice(0, 2000),
            },
        });
    } catch {/* silencioso */}
}

/**
 * Gera um par (token, hash) para uma nova API Key.
 * Token: ak_<uuid>_<secret32> — exibido uma única vez.
 * Hash: bcrypt do token completo — armazenado no banco.
 */
export async function generateApiKeyPair(keyId: string): Promise<{ token: string; hash: string; prefix: string }> {
    const { hash } = await import('bcryptjs');
    // Gera 32 chars aleatórios
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const secret = Array.from({ length: 32 }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
    const token = `ak_${keyId}_${secret}`;
    const keyHash = await hash(secret, 12);
    const prefix = `ak_${keyId.slice(0, 8)}...`;
    return { token, hash: keyHash, prefix };
}
