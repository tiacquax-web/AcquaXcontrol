/**
 * lib/services/filipeta-email-dispatcher.ts
 *
 * Cria EmailJobs para todos os moradores com email cadastrado
 * quando uma nova leitura de concessionária é processada.
 */

import prisma from '@/lib/prisma';
import { findApartmentRecipients } from '@/lib/services/notification-recipients';

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
  const domain = lower.split('@')[1];
  if (!domain) return true;
  
  // Bloqueia se o domínio for um dos internos da AcquaX
  const isInternalDomain = BLOCKED_DOMAINS.some(blocked =>
    domain === blocked || domain.endsWith('.' + blocked)
  );

  // Se o e-mail contiver "acquax" no domínio, bloqueia (ex: @acquax.com.br)
  // Mas permite se for apenas no nome do usuário em um domínio público (ex: acquax_teste@gmail.com)
  if (isInternalDomain || domain.includes('acquax')) return true;
  
  return false;
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
    where: { 
      dealershipReadingId, 
      OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
      ],
    },
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
      created++;
    } else {
      await prisma.emailJob.update({
        where: { id: existing.id },
        data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
      });
    }

    // O envio é feito pelo cron /api/cron/send-pending-emails, que respeita
    // o ritmo humano (intervalo aleatório de 25-90s entre e-mails).
  }

  return { created, skipped: 0, total: validRecipients.length };
}
