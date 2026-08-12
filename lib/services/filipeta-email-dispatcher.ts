/**
 * lib/services/filipeta-email-dispatcher.ts
 *
 * Cria EmailJobs para todos os moradores com email cadastrado
 * quando uma nova leitura de concessionária é processada.
 *
 * Fluxo:
 *   1. findAllResidentsForComplex(complexId) → busca moradores com email via RoleAssignment
 *   2. createEmailJobsForReports(reports, dealershipReadingId) → cria um EmailJob por morador
 *   3. Cron job processa os pendentes
 */

import prisma from '@/lib/prisma';
import { findApartmentRecipients } from '@/lib/services/notification-recipients';

/**
 * Domínios internos/da empresa que não devem receber filipetas.
 * Estes são emails de sistema/administração, não de moradores reais.
 */
const BLOCKED_EMAIL_DOMAINS = [
  'acquaxdobrasil.com.br',
  'acquaxcontrol.com.br',
  'acquaxcontrol.com',
  'acquax.com',
  'acquax.com.br',
];

/**
 * Verifica se um email pertence a um domínio bloqueado (interno/sistema).
 */
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

/**
 * Busca todos os moradores de um condomínio que têm email cadastrado,
 * via RoleAssignment (contextType=apartment, role=Morador).
 */
export async function findResidentsForComplex(complexId: string): Promise<ResidentWithApartment[]> {
  // Buscar role "Morador"
  const moradorRole = await prisma.role.findFirst({
    where: { name: 'Morador', deletedAt: null },
    select: { id: true },
  });

  if (!moradorRole) {
    console.warn('[EmailDispatcher] Role "Morador" não encontrada.');
    return [];
  }

  // Buscar apartamentos do condomínio
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

  const apartmentIds = apartments.map(a => a.id);
  const apartmentMap = new Map(apartments.map(a => [a.id, a]));

  // Buscar RoleAssignments de moradores por apartamento
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      roleId: moradorRole.id,
      contextType: 'apartment',
      contextId: { in: apartmentIds },
      deletedAt: null,
    },
    select: { userId: true, contextId: true },
  });

  if (assignments.length === 0) return [];

  // Buscar dados dos usuários (com email, não deletados)
  const userIds = [...new Set(assignments.map(a => a.userId))];
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      deletedAt: null,
      
    },
    select: { id: true, name: true, email: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  // Montar resultado
  const result: ResidentWithApartment[] = [];
  for (const assignment of assignments) {
    const user = userMap.get(assignment.userId);
    const apartment = apartmentMap.get(assignment.contextId);
    if (!user || !apartment) continue;

    // Pular emails de sistema, óbvios inválidos ou domínios internos da empresa
    if (!user.email || user.email.includes('.deleted-') || isBlockedEmailDomain(user.email)) continue;

    result.push({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      blockName: blockNameMap.get(apartment.blockId) || '',
    });
  }

  return result;
}

/**
 * Cria EmailJobs para todos os moradores baseado nos relatórios de consumo
 * de uma leitura de concessionária específica.
 */
export async function createEmailJobsForDealershipReading(
  dealershipReadingId: string,
  createdByUserId?: string,
): Promise<{ created: number; skipped: number; total: number }> {
  // Buscar a leitura da concessionária
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

  if (!dealershipReading) {
    console.warn('[EmailDispatcher] DealershipReading não encontrada:', dealershipReadingId);
    return { created: 0, skipped: 0, total: 0 };
  }

  // Buscar moradores com email
  const residents = await findResidentsForComplex(dealershipReading.complexId);
  if (residents.length === 0) {
    console.log('[EmailDispatcher] Nenhum morador com email encontrado para o complex:', dealershipReading.complexId);
    return { created: 0, skipped: 0, total: 0 };
  }

  // Buscar relatórios de consumo deste dealershipReading
  const reports = await prisma.apartmentConsumptionReport.findMany({
    where: {
      dealershipReadingId,
      deletedAt: null,
    },
    select: {
      id: true,
      apartmentId: true,
      consumption: true,
      totalConsumption: true,
      consumptionCost: true,
      sewageCost: true,
      totalUnit: true,
      kiteCarConsumption: true,
      kiteCarCost: true,
      utilityType: true,
    },
  });

  const reportByApartment = new Map(reports.map(r => [r.apartmentId, r]));

  // Verificar se já existem jobs criados para este dealershipReading (evitar duplicatas)
  const existingJobs = await prisma.emailJob.findMany({
    where: { dealershipReadingId },
    select: { id: true, toEmail: true, apartmentId: true, status: true },
  });
  
  // Reabrir jobs falhos/pulados para que uma nova tentativa ocorra
  const failedJobs = existingJobs.filter(j => j.status === 'failed' || j.status === 'skipped');
  for (const fJob of failedJobs) {
    await prisma.emailJob.update({
      where: { id: fJob.id },
      data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null }
    });
  }

  const existingSet = new Set(existingJobs.map(j => `${j.apartmentId}-${j.toEmail.toLowerCase()}`));

  let created = 0;
  let skipped = 0;

  // Batch creation: coletar todos os jobs em um array e usar createMany
  const jobBatch: any[] = [];
  const BATCH_SIZE = 500;

  for (const resident of residents) {
    const report = reportByApartment.get(resident.apartmentId);
    if (!report) {
      skipped++;
      continue;
    }

    const dedupKey = `${resident.apartmentId}-${resident.userEmail.toLowerCase()}`;
    if (existingSet.has(dedupKey)) {
      skipped++;
      continue;
    }

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

  // Inserir em lotes para evitar timeout/deadlock
  for (let i = 0; i < jobBatch.length; i += BATCH_SIZE) {
    const chunk = jobBatch.slice(i, i + BATCH_SIZE);
    try {
      await prisma.emailJob.createMany({ data: chunk });
      created += chunk.length;
    } catch (batchErr: any) {
      console.error(`[EmailDispatcher] Erro no lote ${i}:`, batchErr?.message);
      // Fallback: inserir um por um no lote que falhou
      for (const job of chunk) {
        try {
          await prisma.emailJob.create({ data: job });
          created++;
        } catch (singleErr) {
          console.error(`[EmailDispatcher] Erro ao criar job individual:`, singleErr);
        }
      }
    }
  }

  console.log(`[EmailDispatcher] Jobs criados: ${created}, pulados: ${skipped}, moradores: ${residents.length}`);
  return { created, skipped, total: residents.length };
}

/**
 * Cria o job apenas para o relatório que acabou de ser salvo.
 * Usado pelos endpoints de criação/edição individual, que não passam pelo
 * salvamento unificado e, portanto, não têm como aguardar uma leitura em lote.
 */
export async function createEmailJobForReport(
  reportId: string,
  createdByUserId?: string,
): Promise<{ created: number; skipped: number; total: number }> {
  const report = await prisma.apartmentConsumptionReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      apartmentId: true,
      dealershipReadingId: true,
      apartment: {
        select: {
          name: true,
          block: { select: { name: true } },
        },
      },
      DealershipReading: {
        select: {
          complexId: true,
          monthRef: true,
          yearRef: true,
        },
      },
    },
  });

  if (!report || !report.apartmentId || !report.dealershipReadingId || !report.DealershipReading) {
    return { created: 0, skipped: 0, total: 0 };
  }

  const recipients = (await findApartmentRecipients(report.apartmentId))
    .filter((recipient) => !isBlockedEmailDomain(recipient.email));
  if (recipients.length === 0) return { created: 0, skipped: 0, total: 0 };

  const existingJobs = await prisma.emailJob.findMany({
    where: {
      apartmentConsumptionReportId: report.id,
      toEmail: { in: recipients.map((recipient) => recipient.email) },
    },
    select: { id: true, toEmail: true, status: true },
  });
  const activeEmails = new Set(
    existingJobs
      .filter((job) => job.status === 'pending' || job.status === 'sent')
      .map((job) => job.toEmail.toLowerCase()),
  );

  // Reabrir jobs falhos para que um novo salvamento tente o envio novamente.
  const failedJobs = existingJobs.filter((job) => job.status === 'failed' || job.status === 'skipped');
  for (const failedJob of failedJobs) {
    await prisma.emailJob.update({
      where: { id: failedJob.id },
      data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
    });
    activeEmails.add(failedJob.toEmail.toLowerCase());
  }

  const jobs = recipients
    .filter((recipient) => !activeEmails.has(recipient.email.toLowerCase()))
    .map((recipient) => ({
      apartmentConsumptionReportId: report.id,
      dealershipReadingId: report.dealershipReadingId,
      toEmail: recipient.email,
      toName: recipient.name,
      subject: `Filipeta ${report.DealershipReading!.monthRef}/${report.DealershipReading!.yearRef} - ${report.apartment.name}`,
      monthRef: report.DealershipReading!.monthRef,
      yearRef: report.DealershipReading!.yearRef || '',
      complexId: report.DealershipReading!.complexId,
      apartmentId: report.apartmentId,
      status: 'pending',
      createdByUserId: createdByUserId || null,
    }));

  if (jobs.length > 0) {
    await prisma.emailJob.createMany({ data: jobs });
  }

  return { created: jobs.length, skipped: recipients.length - jobs.length, total: recipients.length };
}
