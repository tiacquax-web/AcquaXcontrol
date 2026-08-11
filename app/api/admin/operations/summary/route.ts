import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId,
        contextType: 'system',
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { Role: { select: { name: true } } },
    });
    const roles = assignments.map(item => item.Role?.name).filter(Boolean);
    if (!roles.includes('Administrador') && !roles.includes('Programador')) {
      return NextResponse.json({ error: 'Acesso restrito à administração do sistema' }, { status: 403 });
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [pendingEmails, failedEmails24h, sentEmails24h, oldestPending, latestEmail, latestGlLog, glLogs24h, unacknowledgedAlarms] = await Promise.all([
      prisma.emailJob.count({ where: { status: 'pending' } }),
      prisma.emailJob.count({ where: { status: 'failed', updatedAt: { gte: last24Hours } } }),
      prisma.emailJob.count({ where: { status: 'sent', sentAt: { gte: last24Hours } } }),
      prisma.emailJob.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.emailJob.findFirst({
        where: { status: 'sent' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, updatedAt: true },
      }),
      prisma.glImportLog.findFirst({
        where: { executedAt: { gte: last7Days } },
        orderBy: { executedAt: 'desc' },
        select: { executedAt: true, filesFound: true, imported: true, skipped: true, errors: true, errorMessage: true },
      }),
      prisma.glImportLog.findMany({
        where: { executedAt: { gte: last24Hours } },
        orderBy: { executedAt: 'desc' },
        take: 20,
        select: { executedAt: true, imported: true, skipped: true, errors: true, errorMessage: true },
      }),
      prisma.glAlarm.count({ where: { acknowledged: false } }),
    ]);

    const imported24h = glLogs24h.reduce((sum, log) => sum + (log.imported || 0), 0);
    const importErrors24h = glLogs24h.reduce((sum, log) => sum + (log.errors || 0), 0);
    const hasRecentSuccessfulImport = glLogs24h.some(log => !log.errorMessage && (log.imported || 0) > 0);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      email: {
        pending: pendingEmails,
        failed24h: failedEmails24h,
        sent24h: sentEmails24h,
        oldestPendingAt: oldestPending?.createdAt || null,
        lastSentAt: latestEmail?.sentAt || latestEmail?.updatedAt || null,
      },
      gl: {
        latest: latestGlLog,
        imported24h,
        errors24h: importErrors24h,
        hasRecentSuccessfulImport,
        executions24h: glLogs24h.length,
      },
      alarms: {
        unacknowledged: unacknowledgedAlarms,
      },
    });
  } catch (error) {
    console.error('[admin/operations/summary]', error);
    return NextResponse.json({ error: 'Não foi possível carregar a saúde operacional' }, { status: 500 });
  }
}
