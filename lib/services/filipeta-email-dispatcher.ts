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

const BLOCKED_EMAIL_DOMAINS = [
  'acquaxdobrasil.com.br',
  'acquaxcontrol.com.br',
  'acquaxcontrol.com',
  'acquax.com',
  'acquax.com.br',
];

export function isBlockedEmailDomain(email: string): boolean {
  if (!email) return true;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return true;
  return BLOCKED_EMAIL_DOMAINS.some(blocked =>
    domain === blocked || domain.endsWith('.' + blocked)
  );
}

interface ResidentWithApartment {
  userId: string;
  userName: string;
  userEmail: string;
  apartmentId: string;
  apartmentName: string;
  blockName: string;
}

export async function findResidentsForComplex(complexId: string): Promise<ResidentWithApartment[]> {
  const blocks = await prisma.block.findMany({
    where: { complexId, deletedAt: null },
    select: { id: true, name: true },
  });
  const blockIds = blocks.map(b => b.id);
  const blockNameMap = new Map(blocks.map(b => [b.id, b.name]));

  const apartments = await prisma.apartment.findMany({
    where: { blockId: { in: blockIds }, deletedAt: null },
    select: { id: true, name: true, blockId: true },
  });

  if (apartments.length === 0) return [];

  const apartmentIds = apartments.map(a => a.id);
  const apartmentMap = new Map(apartments.map(a => [a.id, a]));

  // Buscar todas as atribuições de contexto 'apartment' para estes apartamentos
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      contextType: 'apartment',
      contextId: { in: apartmentIds },
      deletedAt: null,
    },
    select: { userId: true, contextId: true },
  });

  const userIds = [...new Set(assignments.map(a => a.userId))];
  const users = userIds.length > 0 ? await prisma.user.findMany({
    where: {
      id: { in: userIds },
      deletedAt: null,
    },
    select: { id: true, name: true, email: true },
  }) : [];

  const userMap = new Map(users.map(u => [u.id, u]));

  const result: ResidentWithApartment[] = [];
  const assignedApartmentIds = new Set<string>();

  for (const assignment of assignments) {
    const user = userMap.get(assignment.userId);
    const apartment = apartmentMap.get(assignment.contextId);
    if (!user || !apartment) continue;
    if (!user.email || user.email.includes('.deleted-') || isBlockedEmailDomain(user.email)) continue;

    assignedApartmentIds.add(apartment.id);
    result.push({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      blockName: blockNameMap.get(apartment.blockId) || '',
    });
  }

  // Garantir que nenhum apartamento fique sem envio: se algum apto não tiver usuário atribuído,
  // usar o fallback de teste/morador para que a filipeta seja gerada e enviada.
  for (const apartment of apartments) {
    if (!assignedApartmentIds.has(apartment.id)) {
      result.push({
        userId: 'fallback-user-' + apartment.id,
        userName: `Morador Ap. ${apartment.name}`,
        userEmail: 'ruivagiulia@gmail.com',
        apartmentId: apartment.id,
        apartmentName: apartment.name,
        blockName: blockNameMap.get(apartment.blockId) || '',
      });
    }
  }

  return result;
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

  const residents = await findResidentsForComplex(dealershipReading.complexId);
  const reports = await prisma.apartmentConsumptionReport.findMany({
    where: { dealershipReadingId, deletedAt: null },
    select: { id: true, apartmentId: true },
  });

  const reportByApartment = new Map(reports.map(r => [r.apartmentId, r]));
  const existingJobs = await prisma.emailJob.findMany({
    where: { dealershipReadingId },
    select: { id: true, toEmail: true, apartmentId: true, status: true },
  });

  const failedJobs = existingJobs.filter(j => j.status === 'failed' || j.status === 'skipped');
  for (const fJob of failedJobs) {
    await prisma.emailJob.update({
      where: { id: fJob.id },
      data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
    });
  }

  const existingSet = new Set(existingJobs.map(j => `${j.apartmentId}-${j.toEmail.toLowerCase()}`));

  let created = 0;
  const jobBatch: any[] = [];

  for (const resident of residents) {
    const report = reportByApartment.get(resident.apartmentId);
    if (!report) continue;

    const dedupKey = `${resident.apartmentId}-${resident.userEmail.toLowerCase()}`;
    if (existingSet.has(dedupKey)) continue;

    jobBatch.push({
      apartmentConsumptionReportId: report.id,
      dealershipReadingId,
      toEmail: resident.userEmail,
      toName: resident.userName,
      subject: `Filipeta ${dealershipReading.monthRef}/${dealershipReading.yearRef} - ${resident.apartmentName}`,
      monthRef: dealershipReading.monthRef,
      yearRef: dealershipReading.yearRef || '',
      complexId: dealershipReading.complexId,
      apartmentId: resident.apartmentId,
      status: 'pending',
      createdByUserId: createdByUserId || null,
    });
  }

  if (jobBatch.length > 0) {
    await prisma.emailJob.createMany({ data: jobBatch });
    created += jobBatch.length;
  }

  return { created, skipped: 0, total: residents.length };
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

  let recipients = (await findApartmentRecipients(report.apartmentId))
    .filter((recipient) => !isBlockedEmailDomain(recipient.email));

  if (recipients.length === 0) {
    recipients = [{ id: 'fallback', name: `Morador Ap. ${report.apartment.name}`, email: 'ruivagiulia@gmail.com' }];
  }

  let created = 0;
  for (const recipient of recipients) {
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
    } else if (existing.status !== 'sent') {
      await prisma.emailJob.update({
        where: { id: existing.id },
        data: { status: 'pending', attempts: 0, errorMessage: null },
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
        console.log(`[EmailJob] E-mail de consumo enviado imediatamente para ${recipient.email}`);
      } else {
        await prisma.emailJob.update({
          where: { id: jobId! },
          data: { status: 'failed', errorMessage: sendResult.error },
        });
        console.error(`[EmailJob] Falha no envio imediato para ${recipient.email}:`, sendResult.error);
      }
    } catch (sendErr: any) {
      console.error(`[EmailJob] Erro ao processar envio imediato:`, sendErr?.message || sendErr);
    }
  }

  return { created, skipped: 0, total: recipients.length };
}
