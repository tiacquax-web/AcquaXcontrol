import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { isEmailConfigured } from '@/lib/services/email-service';

export const runtime = 'nodejs';

/**
 * GET /api/user/email-status
 * Diagnóstico do sistema de emails — mostra config SMTP, fila de EmailJobs, etc.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    }
    if (!userId) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é admin ou programador
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, roleAssignments: { include: { role: true } } } as any
    });
    if (!user) {
      return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 });
    }

    const isAdmin = (user as any).roleAssignments?.some((ra: any) =>
      ra?.role?.name === 'Administrador' || ra?.role?.name === 'Programador'
    );
    if (!isAdmin) {
      return NextResponse.json({ message: 'Acesso restrito a administradores' }, { status: 403 });
    }

    // ── Coletar diagnósticos ──
    const emailConfigured = isEmailConfigured();

    // Contar jobs por status
    const [pending, sent, failed, skipped, total] = await Promise.all([
      prisma.emailJob.count({ where: { status: 'pending' } }),
      prisma.emailJob.count({ where: { status: 'sent' } }),
      prisma.emailJob.count({ where: { status: 'failed' } }),
      prisma.emailJob.count({ where: { status: 'skipped' } }),
      prisma.emailJob.count({}),
    ]);

    // Buscar os 10 jobs mais recentes
    const recentJobs = await prisma.emailJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        toEmail: true,
        toName: true,
        subject: true,
        status: true,
        attempts: true,
        errorMessage: true,
        createdAt: true,
        sentAt: true,
        monthRef: true,
        yearRef: true,
      },
    });

    // Buscar jobs pendentes (amostra)
    const pendingSample = await prisma.emailJob.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: {
        id: true,
        toEmail: true,
        toName: true,
        subject: true,
        attempts: true,
        errorMessage: true,
        createdAt: true,
        monthRef: true,
        yearRef: true,
      },
    });

    // Jobs criados nos últimos 7 dias
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await prisma.emailJob.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    // Último job enviado
    const lastSent = await prisma.emailJob.findFirst({
      where: { status: 'sent' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, toEmail: true, subject: true },
    });

    return NextResponse.json({
      smtp: {
        configured: emailConfigured,
        host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com (default)',
        port: process.env.ZOHO_SMTP_PORT || '465 (default)',
        user: process.env.ZOHO_SMTP_USER ? process.env.ZOHO_SMTP_USER.substring(0, 3) + '***' : 'NOT SET',
        fromName: process.env.ZOHO_SMTP_FROM_NAME || 'AcquaX do Brasil (default)',
      },
      queue: {
        total,
        pending,
        sent,
        failed,
        skipped,
        createdLast7Days: recentCount,
      },
      lastSent: lastSent ? {
        date: lastSent.sentAt,
        to: lastSent.toEmail?.substring(0, 5) + '***',
        subject: lastSent.subject,
      } : null,
      recentJobs: recentJobs.map(j => ({
        ...j,
        toEmail: j.toEmail?.substring(0, 5) + '***',
      })),
      pendingSample: pendingSample.map(j => ({
        ...j,
        toEmail: j.toEmail?.substring(0, 5) + '***',
      })),
    });
  } catch (error: any) {
    console.error('[EmailStatus] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
