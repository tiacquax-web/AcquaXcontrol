import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';
import { buildFilipetaData, currentConsumptionOf, filipetaReportKey, previousMonthOf } from '@/lib/services/filipeta-context';
import { createEmailJobsForDealershipReading } from '@/lib/services/filipeta-email-dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    }
    if (!userId) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dealershipReadingId = typeof body?.dealershipReadingId === 'string'
      ? body.dealershipReadingId
      : null;

    let jobsCreated = 0;
    let jobsSkipped = 0;
    if (dealershipReadingId) {
      // Limpar jobs antigos de insights para garantir foco 100% nas unidades
      await prisma.emailJob.deleteMany({
        where: { dealershipReadingId, subject: { contains: '[ACQUAX_INSIGHT]' } }
      });

      const created = await createEmailJobsForDealershipReading(dealershipReadingId, userId);
      jobsCreated = created.created;
      jobsSkipped = created.skipped;
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({
        message: 'Zoho SMTP não configurado.'
      }, { status: 500 });
    }

    // BUSCAR APENAS JOBS DE MORADORES (EXCLUINDO INSIGHTS)
    const whereClause: any = {
      status: 'pending',
      attempts: { lt: 3 },
      NOT: { subject: { contains: '[ACQUAX_INSIGHT]' } }
    };
    if (dealershipReadingId) {
      whereClause.dealershipReadingId = dealershipReadingId;
    }

    const pendingJobs = await prisma.emailJob.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: 150,
    });

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        jobsCreated,
        message: 'Nenhum email de morador pendente para disparo.'
      });
    }

    const reportIds = pendingJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean) as string[];
    const apartmentIds = pendingJobs.map(j => j.apartmentId).filter(Boolean) as string[];

    const [reports, apartments] = await Promise.all([
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
        include: { block: { select: { name: true } } },
      }) : [],
    ]);

    const reportMap = new Map(reports.map(r => [r.id, r]));
    const apartmentMap = new Map(apartments.map(a => [a.id, a]));

    const dealershipReadingIds = [...new Set(reports.map(r => r.dealershipReadingId).filter(Boolean))] as string[];
    // O "mês anterior" é POR UTILIDADE (água e gás têm relatórios próprios na
    // mesma competência; misturar colocava o índice da água no extrato do gás).
    const previousRefs = pendingJobs.map(job => {
      const ref = previousMonthOf(job.monthRef, job.yearRef);
      const util = (job.apartmentConsumptionReportId ? reportMap.get(job.apartmentConsumptionReportId) : null)?.utilityType ?? null;
      return { apartmentId: job.apartmentId, ...ref, utilityType: util as string | null };
    }).filter(ref => ref.apartmentId) as Array<{ apartmentId: string; monthRef: string; yearRef: string; utilityType: string | null }>;

    const [dealershipReadings, previousReports] = await Promise.all([
      dealershipReadingIds.length > 0
        ? prisma.dealershipReading.findMany({ where: { id: { in: dealershipReadingIds } } })
        : [],
      previousRefs.length > 0
        ? prisma.apartmentConsumptionReport.findMany({
            where: {
              OR: previousRefs.map(ref => ({
                apartmentId: ref.apartmentId,
                monthRef: ref.monthRef,
                yearRef: ref.yearRef,
                ...(ref.utilityType
                  ? { utilityType: ref.utilityType as any }
                  : { OR: [{ utilityType: null }, { utilityType: { isSet: false } }] } as any),
              } as any)),
              AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as any],
            } as any,
            include: { lastReading: { select: { reading: true, readAtDate: true } } },
          })
        : [],
    ]);
    const dealershipMap = new Map(dealershipReadings.map(reading => [reading.id, reading]));
    const previousReportMap = new Map(previousReports.map(report => [filipetaReportKey(report.apartmentId, report.monthRef, report.yearRef, report.utilityType), report]));
    const complexIds = [...new Set(pendingJobs.map(j => j.complexId).filter(Boolean))] as string[];
    const complexes = complexIds.length
      ? await prisma.complex.findMany({ where: { id: { in: complexIds } }, select: { id: true, socialName: true } })
      : [];
    const complexMap = new Map(complexes.map(c => [c.id, c]));
    const unitsByReading = new Map<string, number>();
    for (const drId of dealershipReadingIds) {
      const total = await prisma.apartmentConsumptionReport.count({
        where: { dealershipReadingId: drId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as any,
      } as any);
      unitsByReading.set(drId, Number(total));
    }

    let sent = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 } },
        });

        const report = job.apartmentConsumptionReportId ? reportMap.get(job.apartmentConsumptionReportId) : null;
        const apartment = job.apartmentId ? apartmentMap.get(job.apartmentId) : null;

        if (!report || !apartment) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'failed', errorMessage: 'Dados do relatório/apartamento não encontrados' },
          });
          failed++;
          continue;
        }

        const blockName = apartment.block?.name || '';
        const dealership = report.dealershipReadingId ? dealershipMap.get(report.dealershipReadingId) : null;
        const previousRef = previousMonthOf(job.monthRef, job.yearRef);
        const previousReport = job.apartmentId
          ? previousReportMap.get(filipetaReportKey(job.apartmentId, previousRef.monthRef, previousRef.yearRef, report.utilityType))
          : null;
        const unitsCount = report.dealershipReadingId ? (unitsByReading.get(report.dealershipReadingId) ?? null) : null;
        const complex = job.complexId ? complexMap.get(job.complexId) : null;

        let analysis;
        try {
          analysis = await getConsumptionAnalysis(job.apartmentId || apartment.id, report.id, currentConsumptionOf(report), report.utilityType || null);
        } catch (e) {}

        const { subject, html, text } = generateFilipetaEmail(buildFilipetaData({
          residentName: job.toName || null,
          apartmentName: apartment.name || '',
          blockName,
          complexName: complex?.socialName || '',
          monthRef: job.monthRef,
          yearRef: job.yearRef,
          report,
          dealership,
          previousReport,
          unitsCount,
          analysis,
        }));

        const res = await sendEmail({ to: job.toEmail, toName: job.toName || undefined, subject, html, text, log: { skipLog: true } });
        if (res.success) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'sent', sentAt: new Date(), errorMessage: null },
          });
          sent++;
        } else {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'failed', errorMessage: res.error },
          });
          failed++;
        }
      } catch (err: any) {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorMessage: err?.message || 'Erro' },
        });
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingJobs.length,
      sent,
      failed,
      jobsCreated,
    });
  } catch (error: any) {
    console.error('[TriggerEmails] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
