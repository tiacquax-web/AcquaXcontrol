/**
 * lib/api/webhookDispatch.ts
 *
 * Dispara webhooks registrados para um determinado evento.
 * Suporta retry automático com backoff exponencial.
 *
 * Uso:
 *   await dispatchWebhookEvent('user_created', { id, name, email }, { complexId: '...' });
 */

import prisma from '@/lib/prisma';
import { WebhookStatus } from '@prisma/client';
import { createHmac } from 'crypto';

export type WebhookEventName =
    | 'user_created' | 'user_updated' | 'user_deleted'
    | 'reading_created' | 'reading_updated'
    | 'meter_created' | 'meter_updated'
    | 'apartment_created' | 'block_created' | 'complex_created'
    | 'dealership_reading_created'
    | 'report_generated'
    | 'api_key_created' | 'api_key_revoked';

interface DispatchOptions {
    complexId?: string;
    companyId?: string;
}

/**
 * Dispara o evento para todos os webhooks ativos que o escutam.
 * Falha silenciosamente para não impactar o fluxo principal.
 */
export async function dispatchWebhookEvent(
    event: WebhookEventName,
    data: Record<string, any>,
    options: DispatchOptions = {}
): Promise<void> {
    try {
        // Busca webhooks ativos que escutam este evento
        const webhooks = await prisma.webhook.findMany({
            where: {
                status: WebhookStatus.active,
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
        });

        const matching = webhooks.filter((wh) => {
            try {
                const events: string[] = JSON.parse(wh.events);
                if (!events.includes(event)) return false;
            } catch {
                return false;
            }
            // Filtro de escopo
            if (options.complexId && wh.scopeComplexId && wh.scopeComplexId !== options.complexId) return false;
            if (options.companyId && wh.scopeCompanyId && wh.scopeCompanyId !== options.companyId) return false;
            return true;
        });

        // Dispara em paralelo (sem await — fire and forget com log)
        await Promise.allSettled(matching.map((wh) => deliverWebhook(wh, event, data)));
    } catch (err) {
        console.error('[webhookDispatch] Erro ao buscar webhooks:', err);
    }
}

async function deliverWebhook(
    webhook: { id: string; url: string; secret: string | null; headers: string | null; maxRetries: number },
    event: string,
    data: Record<string, any>,
    attempt = 1
): Promise<void> {
    const payload = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
    });

    // Cabeçalhos padrão
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-AcquaX-Event': event,
        'X-AcquaX-Delivery': `${webhook.id}-${Date.now()}`,
    };

    // Cabeçalhos customizados
    if (webhook.headers) {
        try {
            const custom = JSON.parse(webhook.headers);
            Object.assign(headers, custom);
        } catch {/* ignora */}
    }

    // Assinatura HMAC-SHA256
    if (webhook.secret) {
        const sig = createHmac('sha256', webhook.secret).update(payload).digest('hex');
        headers['X-AcquaX-Signature'] = `sha256=${sig}`;
    }

    let deliveryId: string | null = null;
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let success = false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout
        const res = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: payload,
            signal: controller.signal,
        });
        clearTimeout(timeout);
        statusCode = res.status;
        responseBody = (await res.text()).slice(0, 2000);
        success = res.ok;
    } catch (err: any) {
        errorMessage = err?.message || 'Timeout ou erro de rede';
    }

    // Salva log da entrega
    const delivery = await prisma.webhookDelivery.create({
        data: {
            webhookId: webhook.id,
            event,
            payload,
            statusCode,
            responseBody,
            errorMessage,
            attempt,
            success,
            nextRetryAt: !success && attempt < webhook.maxRetries
                ? new Date(Date.now() + Math.pow(2, attempt) * 60_000) // backoff: 2^attempt minutos
                : null,
        },
    }).catch(() => null);

    // Retry se necessário
    if (!success && attempt < webhook.maxRetries) {
        const delayMs = Math.pow(2, attempt) * 60_000;
        setTimeout(() => {
            deliverWebhook(webhook, event, data, attempt + 1).catch(() => {/* silencioso */});
        }, delayMs);
    }
}
