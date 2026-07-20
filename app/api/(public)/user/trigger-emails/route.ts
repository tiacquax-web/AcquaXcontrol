import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BATCH = 100;
const MAX_ATTEMPTS = 3;

/**
 * POST /api/user/trigger-emails
 * 
 * Endpoint manual para processar a fila de EmailJobs pendentes.
 * Disponível para Administradores e Programadores — usado como fallback
 * quando o cron automático não está funcionando ou para forçar o envio.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
      return NextResponse.json({ message: 'Apenas administradores podem acionar o envio manual' }, { status: 403 });
    }

    // Verificar configuração de email
    if (!isEmailConfigured()) {
      return NextResponse.json({
        message: 'Zoho SMTP não configurado. Configure ZOHO_SMTP_USER e ZOHO_SMTP_PASS na Vercel.'
      }, { status: 500 });
    }

    // Buscar jobs pendentes
    const pendingJobs = await prisma.emailJob.findMany({
      where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: MAX_BATCH,
    });

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        message: 'Nenhum email pendente na fila.'
      });
    }

    // Buscar dados em batch
    const reportIds = pendingJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean) as string[];
    const apartmentIds = pendingJobs.map(j => j.apartmentId).filter(Boolean) as string[];
    const complexIds = [...new Set(pendingJobs.map(j => j.complexId).filter(Boolean))] as string[];

    const [reports, apartments, complexes] = await Promise.all([
      reportIds.length > 0 ? prisma.apartmentConsumptionReport.findMany({
        where: { id: { in: reportIds } },
        include: { lastReading: { select: { readAtDate: true, nextReadingDate: true, readAt: true } } },
      }) : [],
      apartmentIds.length > 0 ? prisma.apartment.findMany({
        where: { id: { in: apartmentIds } },
        include: { block: { select: { name: true, complexId: true } } },
      }) : [],
      complexIds.length > 0 ? prisma.complex.findMany({
        where: { id: { in: complexIds } },
        select: { id: true, socialName: true },
      }) : [],
    ]);

    const reportMap = new Map(reports.map(r => [r.id, r]));
    const apartmentMap = new Map(apartments.map(a => [a.id, a]));
    const complexMap = new Map(complexes.map(c => [c.id, c]));

    let sent = 0, failed = 0, skipped = 0;

    for (const job of pendingJobs) {
      try {
        if (isBlockedEmailDomain(job.toEmail)) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'skipped', errorMessage: 'Domínio interno bloqueado', sentAt: new Date() },
          });
          skipped++;
          continue;
        }

        await prisma.emailJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 } },
        });

        const report = job.apartmentConsumptionReportId ? reportMap.get(job.apartmentConsumptionReportId) : null;
        const apartment = job.apartmentId ? apartmentMap.get(job.apartmentId) : null;
        const complex = job.complexId ? complexMap.get(job.complexId) : null;

        if (!report || !apartment || !complex) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'failed', errorMessage: 'Dados não encontrados' },
          });
          failed++;
          continue;
        }

        const blockName = apartment.block?.name || '';

        let analysis;
        try {
          const currentConsumption = report.totalConsumption ?? report.consumption;
          analysis = await getConsumptionAnalysis(job.apartmentId || apartment.id, report.id, currentConsumption);
        } catch (e) { /* analysis é opcional */ }

        const readingDate = report.lastReading?.readAtDate;
        const { subject, html, text } = generateFilipetaEmail({
          residentName: job.toName || 'Morador',
          apartmentName: apartment.name || '',
          blockName,
          complexName: complex.socialName || '',
          monthRef: job.monthRef,
          yearRef: job.yearRef,
          consumption: report.consumption,
          totalConsumption: report.totalConsumption ?? undefined,
          consumptionCost: report.consumptionCost,
          sewageCost: report.sewageCost,
          totalUnit: report.totalUnit,
          kiteCarConsumption: report.kiteCarConsumption ?? undefined,
          kiteCarCost: report.kiteCarCost ?? undefined,
          utilityType: report.utilityType || undefined,
          readingDate: typeof readingDate === 'string' ? readingDate : readingDate?.toISOString(),
          nextReadingDate: report.lastReading?.nextReadingDate || undefined,
          analysis,
        });

        const result = await sendEmail({ to: job.toEmail, toName: job.toName || undefined, subject, html, text });

        if (result.success) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sent++;
        } else {
          const newAttempts = job.attempts + 1;
          await prisma.emailJob.update({
            where: { id: job.id },
            data: {
              status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              errorMessage: result.error,
            },
          });
          failed++;
        }
      } catch (err: any) {
        const newAttempts = job.attempts + 1;
        await prisma.emailJob.update({
          where: { id: job.id },
          data: {
            status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            errorMessage: err?.message || 'Erro inesperado',
          },
        });
        failed++;
      }
    }

    console.log(`[TriggerEmails] Processados: ${pendingJobs.length}, enviados: ${sent}, falhas: ${failed}, pulados: ${skipped}`);
    return NextResponse.json({ processed: pendingJobs.length, sent, failed, skipped });
  } catch (error: any) {
    console.error('[TriggerEmails] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
