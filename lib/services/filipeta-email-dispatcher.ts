/**
 * lib/services/filipeta-email-dispatcher.ts
 *
 * Cria EmailJobs para todos os moradores com email cadastrado
 * quando uma nova leitura de concessionária é processada.
 */

import prisma from '@/lib/prisma';
import { findApartmentRecipients } from '@/lib/services/notification-recipients';
import { sendEmail } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';

const BLOCKED_DOMAINS = [
  'acquaxdobrasil.com.br',
  'acquaxcontrol.com.br',
  'acquaxcontrol.com',
  'acquax.com',
  'acquax.com.br',
];

export function isBlockedEmailDomain(email: string): boolean {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  if (lower.includes('acquax')) return true;
  const domain = lower.split('@')[1];
  if (!domain) return true;
  return BLOCKED_DOMAINS.some(blocked =>
    domain === blocked || domain.endsWith('.' + blocked)
  );
}

export async function createEmailJobsForDealershipReading(
  dealershipReadingId: string,
  createdByUserId?: string,
): Promise<{ created: number; skipped: number; total: number }> {
  const dealershipReading = await prisma.dealershipReading.findUnique({
    where: { id: dealershipReadingId },
    select: {
      id: true,
      complexId: true,
      monthRef: true,
      yearRef: true,
      readingDate: true,
      readingDateNext: true,
      type: true,
    },
  });

  if (!dealershipReading) return { created: 0, skipped: 0, total: 0 };

  const reports = await prisma.apartmentConsumptionReport.findMany({
    where: { dealershipReadingId, deletedAt: null },
    include: {
      apartment: {
        select: { id: true, name: true, block: { select: { name: true } } },
      },
    },
  });

  if (reports.length === 0) return { created: 0, skipped: 0, total: 0 };

  await prisma.emailJob.updateMany({
    where: { dealershipReadingId },
    data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
  });

  const existingJobs = await prisma.emailJob.findMany({
    where: { dealershipReadingId },
    select: { id: true, apartmentConsumptionReportId: true },
  });

  const existingReportIds = new Set(existingJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean));

  let created = 0;
  const jobBatch: any[] = [];

  for (const report of reports) {
    if (!report.apartmentId || !report.apartment) continue;
    if (existingReportIds.has(report.id)) continue;

    const recipients = await findApartmentRecipients(report.apartmentId);
    const validRecipients = recipients.filter(r => r.email && !isBlockedEmailDomain(r.email));

    for (const recipient of validRecipients) {
      jobBatch.push({
        apartmentConsumptionReportId: report.id,
        dealershipReadingId,
        toEmail: recipient.email,
        toName: recipient.name,
        subject: `Filipeta ${dealershipReading.monthRef}/${dealershipReading.yearRef} - ${report.apartment.name}`,
        monthRef: dealershipReading.monthRef,
        yearRef: dealershipReading.yearRef || '',
        complexId: dealershipReading.complexId,
        apartmentId: report.apartmentId,
        status: 'pending',
        createdByUserId: createdByUserId || null,
      });
    }
    existingReportIds.add(report.id);
  }

  if (jobBatch.length > 0) {
    await prisma.emailJob.createMany({ data: jobBatch });
    created += jobBatch.length;
  }

  return { created, skipped: 0, total: reports.length };
}

/**
 * Cria o job para o relatório salvo individualmente e envia IMEDIATAMENTE por SMTP.
 */
export async function createEmailJobForReport(
  reportId: string,
  createdByUserId?: string,
): Promise<{ created: number; skipped: number; total: number }> {
  const report = await prisma.apartmentConsumptionReport.findUnique({
    where: { id: reportId },
    include: {
      lastReading: { select: { reading: true, readAtDate: true, nextReadingDate: true } },
      DealershipReading: true,
      apartment: {
        include: {
          block: { select: { name: true } },
        },
      },
    },
  });

  if (!report || !report.apartmentId || !report.dealershipReadingId || !report.DealershipReading) {
    return { created: 0, skipped: 0, total: 0 };
  }

  const recipients = await findApartmentRecipients(report.apartmentId);
  const validRecipients = recipients.filter(r => r.email && !isBlockedEmailDomain(r.email));

  if (validRecipients.length === 0) {
    return { created: 0, skipped: 0, total: 0 };
  }

  let created = 0;
  for (const recipient of validRecipients) {
    const existing = await prisma.emailJob.findFirst({
      where: {
        apartmentConsumptionReportId: report.id,
        toEmail: recipient.email,
      },
    });

    const subject = `Filipeta ${report.DealershipReading.monthRef}/${report.DealershipReading.yearRef} - ${report.apartment.name}`;
    
    let jobId = existing?.id;
    if (!existing) {
      const newJob = await prisma.emailJob.create({
        data: {
          apartmentConsumptionReportId: report.id,
          dealershipReadingId: report.dealershipReadingId,
          toEmail: recipient.email,
          toName: recipient.name,
          subject,
          monthRef: report.DealershipReading.monthRef,
          yearRef: report.DealershipReading.yearRef || '',
          complexId: report.DealershipReading.complexId,
          apartmentId: report.apartmentId,
          status: 'pending',
          createdByUserId: createdByUserId || null,
        },
      });
      jobId = newJob.id;
      created++;
    } else {
      await prisma.emailJob.update({
        where: { id: existing.id },
        data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
      });
      jobId = existing.id;
    }

    // ENVIAR IMEDIATAMENTE AO SALVAR O RELATÓRIO
    try {
      const dealership = report.DealershipReading;
      const readingDate = report.lastReading?.readAtDate || dealership?.readingDate || null;
      const nextReadingDate = report.lastReading?.nextReadingDate || dealership?.readingDateNext || undefined;
      const periodEnd = readingDate ? String(readingDate).split(/[ T]/)[0] : undefined;

      let analysis;
      try {
        analysis = await getConsumptionAnalysis(report.apartmentId, report.id, report.totalConsumption ?? report.consumption);
      } catch (e) {}

      const emailPayload = generateFilipetaEmail({
        residentName: recipient.name || 'Morador',
        apartmentName: report.apartment.name || '',
        blockName: report.apartment.block?.name || '',
        complexName: 'Condomínio',
        monthRef: dealership.monthRef,
        yearRef: dealership.yearRef || '',
        consumption: report.consumption,
        totalConsumption: report.totalConsumption ?? undefined,
        initialReading: null,
        finalReading: report.lastReading?.reading ?? null,
        consumptionCost: report.consumptionCost,
        sewageCost: report.sewageCost,
        totalUnit: report.totalUnit,
        rateioValue: report.partial ?? null,
        utilityType: report.utilityType || undefined,
        readingDate: readingDate ? String(readingDate) : undefined,
        nextReadingDate,
        periodEnd,
        condominiumConsumption: dealership?.dealershipConsumption ?? null,
        condominiumBillValue: dealership?.totalValue ?? null,
        consumptionPerEconomy: dealership?.average ?? null,
        analysis,
      });

      const sendResult = await sendEmail({
        to: recipient.email,
        toName: recipient.name,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
      });

      if (sendResult.success) {
        await prisma.emailJob.update({
          where: { id: jobId! },
          data: { status: 'sent', sentAt: new Date(), errorMessage: null },
        });
      } else {
        await prisma.emailJob.update({
          where: { id: jobId! },
          data: { status: 'failed', errorMessage: sendResult.error },
        });
      }
    } catch (sendErr: any) {
      console.error('[EmailJob] Erro ao enviar:', sendErr);
    }
  }

  return { created, skipped: 0, total: validRecipients.length };
}
