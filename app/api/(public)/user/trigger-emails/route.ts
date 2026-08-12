import { unstable_after as after } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';
import { createEmailJobsForDealershipReading } from '@/lib/services/filipeta-email-dispatcher';
import { enqueueManagementInsightJobs, buildManagementInsightEmail, cleanManagementInsightSubject, isManagementInsightJob } from '@/lib/services/management-insights-email';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BATCH = 150;
const MAX_ATTEMPTS = 3;

function previousMonth(monthRef: string, yearRef: string) {
  const date = new Date(Number(yearRef), Number(monthRef) - 2, 1);
  return { monthRef: String(date.getMonth() + 1).padStart(2, '0'), yearRef: String(date.getFullYear()) };
}

function reportKey(apartmentId: string, monthRef: string, yearRef: string) {
  return `${apartmentId}:${yearRef}:${monthRef.padStart(2, '0')}`;
}

function derivePeriodStart(value: string | null | undefined, totalDays: number | null | undefined) {
  if (!value || totalDays == null || !Number.isFinite(Number(totalDays))) return undefined;
  const raw = String(value);
  const date = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() - Number(totalDays));
  return date.toISOString().slice(0, 10);
}

async function processQueue() {
  try {
    if (!isEmailConfigured()) return;

    const pendingJobs = await prisma.emailJob.findMany({
      where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: MAX_BATCH,
    });

    if (pendingJobs.length === 0) return;

    const reportIds = pendingJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean) as string[];
    const apartmentIds = pendingJobs.map(j => j.apartmentId).filter(Boolean) as string[];
    const complexIds = [...new Set(pendingJobs.map(j => j.complexId).filter(Boolean))] as string[];

    const [reports, apartments, complexes] = await Promise.all([
      reportIds.length > 0 ? prisma.apartmentConsumptionReport.findMany({
        where: { id: { in: reportIds } },
        include: {
          lastReading: {
            select: { reading: true, readAtDate: true, nextReadingDate: true, readAt: true },
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

    const dealershipReadingIds = [...new Set(reports.map(r => r.dealershipReadingId).filter(Boolean))] as string[];
    const previousRefs = pendingJobs.map(job => {
      const ref = previousMonth(job.monthRef, job.yearRef);
      return { apartmentId: job.apartmentId, ...ref };
    }).filter(ref => ref.apartmentId) as Array<{ apartmentId: string; monthRef: string; yearRef: string }>;
    
    const [dealershipReadings, previousReports] = await Promise.all([
      dealershipReadingIds.length > 0
        ? prisma.dealershipReading.findMany({ where: { id: { in: dealershipReadingIds } } })
        : [],
      previousRefs.length > 0
        ? prisma.apartmentConsumptionReport.findMany({
            where: {
              OR: previousRefs.map(ref => ({ apartmentId: ref.apartmentId, monthRef: ref.monthRef, yearRef: ref.yearRef })),
              AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
            },
            include: { lastReading: { select: { reading: true, readAtDate: true } } },
          })
        : [],
    ]);
    const dealershipMap = new Map(dealershipReadings.map(reading => [reading.id, reading]));
    const previousReportMap = new Map(previousReports.map(report => [reportKey(report.apartmentId, report.monthRef, report.yearRef), report]));

    const CHUNK_SIZE = 10;
    for (let i = 0; i < pendingJobs.length; i += CHUNK_SIZE) {
      const chunk = pendingJobs.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (job) => {
        try {
          if (isBlockedEmailDomain(job.toEmail)) {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: 'skipped', errorMessage: 'Domínio interno bloqueado', sentAt: new Date() },
            });
            return;
          }

          await prisma.emailJob.update({
            where: { id: job.id },
            data: { attempts: { increment: 1 } },
          });

          if (isManagementInsightJob(job.subject)) {
            if (!job.complexId) {
              await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: 'Insight sem condomínio associado' } });
              return;
            }
            const insight = await buildManagementInsightEmail(job.complexId, job.monthRef, job.yearRef, job.toName);
            const insightResult = await sendEmail({
              to: job.toEmail,
              toName: job.toName || undefined,
              subject: cleanManagementInsightSubject(job.subject),
              html: insight.html,
              text: insight.text,
            });
            if (insightResult.success) {
              await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'sent', sentAt: new Date() } });
            } else {
              const newAttempts = job.attempts + 1;
              await prisma.emailJob.update({ where: { id: job.id }, data: { status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending', errorMessage: insightResult.error } });
            }
            return;
          }

          const report = job.apartmentConsumptionReportId ? reportMap.get(job.apartmentConsumptionReportId) : null;
          const apartment = job.apartmentId ? apartmentMap.get(job.apartmentId) : null;
          const complex = job.complexId ? complexMap.get(job.complexId) : null;

          if (!report || !apartment || !complex) {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: 'failed', errorMessage: 'Dados não encontrados' },
            });
            return;
          }

          const blockName = apartment.block?.name || '';
          const dealership = report.dealershipReadingId ? dealershipMap.get(report.dealershipReadingId) : null;
          const previousRef = previousMonth(job.monthRef, job.yearRef);
          const previousReport = job.apartmentId
            ? previousReportMap.get(reportKey(job.apartmentId, previousRef.monthRef, previousRef.yearRef))
            : null;

          const readingDate = report.lastReading?.readAtDate || dealership?.readingDate || null;
          const periodEnd = readingDate ? String(readingDate).split(/[ T]/)[0] : undefined;
          const periodStart = previousReport?.lastReading?.readAtDate
            ? String(previousReport.lastReading.readAtDate).split(/[ T]/)[0]
            : derivePeriodStart(periodEnd, dealership?.totalDays);
          const nextReadingDate = report.lastReading?.nextReadingDate || dealership?.readingDateNext || undefined;

          let analysis;
          try {
            const currentConsumption = report.totalConsumption ?? report.consumption;
            analysis = await getConsumptionAnalysis(job.apartmentId || apartment.id, report.id, currentConsumption);
          } catch (e) {}

          const { subject, html, text } = generateFilipetaEmail({
            residentName: job.toName || 'Morador',
            apartmentName: apartment.name || '',
            blockName,
            complexName: complex.socialName || '',
            monthRef: job.monthRef,
            yearRef: job.yearRef,
            consumption: report.consumption,
            totalConsumption: report.totalConsumption ?? undefined,
            initialReading: previousReport?.lastReading?.reading ?? null,
            finalReading: report.lastReading?.reading ?? null,
            consumptionCost: report.consumptionCost,
            sewageCost: report.sewageCost,
            totalUnit: report.totalUnit,
            rateioValue: report.partial ?? null,
            kiteCarConsumption: report.kiteCarConsumption ?? undefined,
            kiteCarCost: report.kiteCarCost ?? undefined,
            utilityType: report.utilityType || undefined,
            readingDate: readingDate ? String(readingDate) : undefined,
            nextReadingDate,
            periodStart,
            periodEnd,
            condominiumConsumption: dealership?.dealershipConsumption ?? null,
            condominiumBillValue: dealership?.totalValue ?? null,
            consumptionPerEconomy: dealership?.average ?? null,
            analysis,
          });

          const result = await sendEmail({ to: job.toEmail, toName: job.toName || undefined, subject, html, text });

          if (result.success) {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: 'sent', sentAt: new Date() },
            });
          } else {
            const newAttempts = job.attempts + 1;
            await prisma.emailJob.update({
              where: { id: job.id },
              data: {
                status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
                errorMessage: result.error,
              },
            });
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
        }
      }));
    }
  } catch (error) {
    console.error('[BackgroundEmailQueue] Erro:', error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    }
    if (!userId) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const systemAssignments = await prisma.roleAssignment.findMany({
      where: {
        userId,
        contextType: 'system',
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { Role: { select: { name: true } } },
    });
    const systemRoles = systemAssignments.map(a => a.Role?.name).filter(Boolean) as string[];
    const isAdmin = systemRoles.includes('Administrador') || systemRoles.includes('Programador');
    if (!isAdmin) {
      return NextResponse.json({ message: 'Apenas administradores podem acionar o envio manual' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dealershipReadingId = typeof body?.dealershipReadingId === 'string'
      ? body.dealershipReadingId
      : null;

    let jobsCreated = 0;
    let jobsSkipped = 0;
    if (dealershipReadingId) {
      const created = await createEmailJobsForDealershipReading(dealershipReadingId, userId);
      jobsCreated = created.created;
      jobsSkipped = created.skipped;
      const insightJobs = await enqueueManagementInsightJobs(dealershipReadingId, userId);
      jobsCreated += insightJobs.created;
      jobsSkipped += insightJobs.skipped;
    }

    // Disparar processamento em segundo plano sem travar a requisição HTTP (evita timeout da Vercel)
    after(async () => {
      await processQueue();
    });

    return NextResponse.json({
      success: true,
      message: 'Disparo de e-mails iniciado com sucesso em segundo plano.',
      jobsCreated,
      skipped: jobsSkipped,
    });
  } catch (error: any) {
    console.error('[TriggerEmails] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
