import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function logAdminAction(params: {
  userId: string;
  action: string;
  target?: string;
  status: 'success' | 'error' | 'blocked';
  correlationId?: string;
  requestPayload?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
}) {
  try {
    await prisma.adminActionAudit.create({
      data: {
        userId: params.userId,
        action: params.action,
        target: params.target,
        status: params.status,
        correlationId: params.correlationId,
        requestPayload: (params.requestPayload || null) as Prisma.InputJsonValue,
        responseSummary: (params.responseSummary || null) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Auditoria é best-effort para não quebrar operação principal.
    console.warn('[admin-audit] falha ao registrar auditoria:', error);
  }
}
