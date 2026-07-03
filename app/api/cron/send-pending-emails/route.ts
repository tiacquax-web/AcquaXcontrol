/**
 * app/api/cron/send-pending-emails/route.ts
 *
 * Cron job que processa a fila de EmailJobs pendentes.
 * Executa a cada 10 minutos (configurado no vercel.json).
 *
 * - Busca até 50 jobs pendentes por execução
 * - Monta o email com os dados do consumo
 * - Envia via Zoho SMTP (nodemailer)
 * - Marca como "sent" ou "failed" com a mensagem de erro
 * - Jobs com 3+ tentativas falhas são marcados como "failed" permanentemente
 *
 * Autenticação: CRON_SECRET (igual ao cron do GL Import)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 min — suficiente para 50 emails

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 3;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Autenticação ──────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  // ── Verificar configuração de email ────────────────────────────────────────
  if (!isEmailConfigured()) {
    console.warn('[EmailCron] Zoho SMTP não configurado — pulando execução.');
    return NextResponse.json({ skipped: true, reason: 'email_not_configured' });
  }

  try {
    // Buscar jobs pendentes
    const pendingJobs = await prisma.emailJob.findMany({
      where: {
        status: 'pending',
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_BATCH,
    });

    if (pendingJobs.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
    }

    // Buscar dados necessários em batch
    const reportIds = pendingJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean) as string[];
    const apartmentIds = pendingJobs.map(j => j.apartmentId).filter(Boolean) as string[];
    const complexIds = [...new Set(pendingJobs.map(j => j.complexId).filter(Boolean))] as string[];

    const [reports, apartments, complexes] = await Promise.all([
      reportIds.length > 0 ? prisma.apartmentConsumptionReport.findMany({
        where: { id: { in: reportIds } },
        include: {
          lastReading: {
            select: { readAtDate: true, nextReadingDate: true, readAt: true },
          },
        },
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

    // Verificar alertas ativos para os apartamentos (GlAlarm)
    let alarmCounts: Record<string, number> = {};
    if (apartmentIds.length > 0) {
      // Buscar medidores dos apartamentos
      const meters = await prisma.meter.findMany({
        where: { apartmentId: { in: apartmentIds }, deletedAt: null },
        select: { id: true, apartmentId: true },
      });
      const meterIds = meters.map(m => m.id);
      if (meterIds.length > 0) {
        const alarms = await prisma.glAlarm.findMany({
          where: {
            meterId: { in: meterIds },
            deletedAt: null,
            // Alertas dos últimos 30 dias
            alarmAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: { meterId: true },
        });
        const meterToApartment = new Map(meters.map(m => [m.id, m.apartmentId]));
        for (const alarm of alarms) {
          const apId = meterToApartment.get(alarm.meterId);
          if (apId) alarmCounts[apId] = (alarmCounts[apId] || 0) + 1;
        }
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Processar cada job
    for (const job of pendingJobs) {
      try {
        // Pular emails de domínios internos da empresa (sistema/admin)
        if (isBlockedEmailDomain(job.toEmail)) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'skipped', errorMessage: 'Domínio interno bloqueado', sentAt: new Date() },
          });
          skipped++;
          continue;
        }

        // Incrementar tentativas
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
            data: { status: 'failed', errorMessage: 'Dados do relatório/apartamento não encontrados' },
          });
          failed++;
          continue;
        }

        const blockName = apartment.block?.name || '';
        const alertCount = alarmCounts[job.apartmentId || ''] || 0;

        // Calcular período de consumo
        const readingDate = report.lastReading?.readAtDate || null;
        let periodStart: string | undefined;
        let periodEnd: string | undefined;

        if (readingDate) {
          periodEnd = typeof readingDate === 'string' ? readingDate.split(' ')[0] : readingDate.toISOString().split('T')[0];
          // Buscar período inicial: data da leitura anterior ou subtrair 30 dias
          // Por simplicidade, usar o readingDate do dealershipReading
          periodStart = undefined; // será calculado pelo template se não fornecido
        }

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
          readingDate: typeof report.lastReading?.readAtDate === 'string' ? report.lastReading.readAtDate : report.lastReading?.readAtDate?.toISOString(),
          nextReadingDate: report.lastReading?.nextReadingDate || undefined,
          periodStart,
          periodEnd,
          hasAlerts: alertCount > 0,
          alertMessage: alertCount > 0
            ? `Sua unidade possui ${alertCount} alerta(s) recente(s) do sistema de monitoramento. Acesse o sistema para visualizar os detalhes.`
            : undefined,
        });

        const result = await sendEmail({
          to: job.toEmail,
          toName: job.toName || undefined,
          subject,
          html,
          text,
        });

        if (result.success) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sent++;
        } else {
          // Se excedeu tentativas, marcar como failed permanente
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
        console.error(`[EmailCron] Erro no job ${job.id}:`, err?.message);
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

    console.log(`[EmailCron] Processados: ${pendingJobs.length}, enviados: ${sent}, falhas: ${failed}, pulados: ${skipped}`);
    return NextResponse.json({ processed: pendingJobs.length, sent, failed, skipped });
  } catch (error: any) {
    console.error('[EmailCron] Erro fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
