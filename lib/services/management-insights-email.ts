import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { findComplexManagementRecipients, isExternalNotificationEmail } from '@/lib/services/notification-recipients';

export const MANAGEMENT_INSIGHT_PREFIX = '[ACQUAX_INSIGHT]';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function fmtNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value || 0);
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function previousReference(monthRef: string, yearRef: string) {
  const date = new Date(Number(yearRef), Number(monthRef) - 2, 1);
  return {
    monthRef: String(date.getMonth() + 1).padStart(2, '0'),
    yearRef: String(date.getFullYear()),
    monthName: MONTH_NAMES[date.getMonth()],
  };
}

export function isManagementInsightJob(subject: string | null | undefined) {
  return Boolean(subject?.startsWith(MANAGEMENT_INSIGHT_PREFIX));
}

export function cleanManagementInsightSubject(subject: string) {
  return subject.replace(`${MANAGEMENT_INSIGHT_PREFIX} `, '');
}

export async function enqueueManagementInsightJobs(
  dealershipReadingId: string,
  createdByUserId?: string,
): Promise<{ created: number; skipped: number; total: number }> {
  const reading = await prisma.dealershipReading.findUnique({
    where: { id: dealershipReadingId },
    select: { id: true, complexId: true, monthRef: true, yearRef: true },
  });
  if (!reading) return { created: 0, skipped: 0, total: 0 };

  const readingMonthRef = reading.monthRef || '';
  const readingYearRef = reading.yearRef || '';
  const recipients = (await findComplexManagementRecipients(reading.complexId))
    .filter((recipient) => isExternalNotificationEmail(recipient.email));
  if (recipients.length === 0) return { created: 0, skipped: 0, total: 0 };

  const existing = await prisma.emailJob.findMany({
    where: {
      complexId: reading.complexId,
      monthRef: readingMonthRef,
      yearRef: readingYearRef,
      subject: { startsWith: MANAGEMENT_INSIGHT_PREFIX },
      toEmail: { in: recipients.map((recipient) => recipient.email) },
    },
    select: { id: true, toEmail: true, status: true },
  });

  // Reabrir jobs falhos/pulados
  const failed = existing.filter((job) => job.status === 'failed' || job.status === 'skipped');
  for (const job of failed) {
    await prisma.emailJob.update({
      where: { id: job.id },
      data: { status: 'pending', attempts: 0, errorMessage: null, sentAt: null },
    });
  }

  const activeEmails = new Set(
    existing
      .filter((job) => job.status === 'pending' || job.status === 'sent' || job.status === 'failed' || job.status === 'skipped')
      .map((job) => job.toEmail.toLowerCase()),
  );

  const jobs: Prisma.EmailJobCreateManyInput[] = recipients
    .filter((recipient) => !activeEmails.has(recipient.email.toLowerCase()))
    .map((recipient) => ({
      apartmentConsumptionReportId: null,
      dealershipReadingId: reading.id,
      toEmail: recipient.email,
      toName: recipient.name,
      subject: `${MANAGEMENT_INSIGHT_PREFIX} Insights do mês - ${reading.monthRef}/${reading.yearRef} - ${reading.complexId}`,
      monthRef: reading.monthRef,
      yearRef: readingYearRef,
      complexId: reading.complexId,
      apartmentId: null,
      status: 'pending' as const,
      createdByUserId: createdByUserId || null,
    }));

  if (jobs.length > 0) await prisma.emailJob.createMany({ data: jobs });
  return { created: jobs.length, skipped: recipients.length - jobs.length, total: recipients.length };
}

export async function buildManagementInsightEmail(
  complexId: string,
  monthRef: string,
  yearRef: string,
  recipientName?: string | null,
) {
  const previous = previousReference(monthRef, yearRef);
  const [complex, reports, previousReports] = await Promise.all([
    prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } }),
    prisma.apartmentConsumptionReport.findMany({
      where: { complexId, monthRef, yearRef, deletedAt: null },
      select: {
        consumption: true,
        totalConsumption: true,
        totalUnit: true,
        apartment: { select: { name: true, block: { select: { name: true } } } },
      },
    }),
    prisma.apartmentConsumptionReport.findMany({
      where: { complexId, monthRef: previous.monthRef, yearRef: previous.yearRef, deletedAt: null },
      select: { consumption: true, totalConsumption: true },
    }),
  ]);

  const complexName = complex?.socialName || 'seu condomínio';
  const totalConsumption = reports.reduce((sum, report) => sum + (report.totalConsumption ?? report.consumption ?? 0), 0);
  const totalValue = reports.reduce((sum, report) => sum + (report.totalUnit ?? 0), 0);
  const previousTotal = previousReports.reduce((sum, report) => sum + (report.totalConsumption ?? report.consumption ?? 0), 0);
  const variation = previousTotal > 0 ? ((totalConsumption - previousTotal) / previousTotal) * 100 : null;
  const zeroUnits = reports.filter((report) => (report.totalConsumption ?? report.consumption ?? 0) === 0).length;
  const sorted = [...reports].sort((a, b) => (b.totalConsumption ?? b.consumption ?? 0) - (a.totalConsumption ?? a.consumption ?? 0));
  const topUnits = sorted.slice(0, 3);
  const topRows = topUnits.map((report) => `
    <tr><td style="padding:7px 0;font-size:13px;color:#444;">${report.apartment?.block?.name || '-'} / ${report.apartment?.name || '-'}</td>
    <td style="padding:7px 0;font-size:13px;color:#444;text-align:right;">${fmtNumber(report.totalConsumption ?? report.consumption ?? 0)} m³</td></tr>`).join('');
  const variationText = variation == null ? 'Sem comparação disponível' : `${variation > 0 ? '+' : ''}${variation.toFixed(1)}% vs. ${previous.monthName}`;
  const alertHtml = zeroUnits > 0
    ? `<div style="margin-top:16px;padding:12px 14px;background:#fff4e5;border:1px solid #ffd59a;border-radius:8px;color:#7a4b00;font-size:13px;"><strong>Atenção operacional:</strong> ${zeroUnits} unidade(s) ficaram com consumo zero e merecem conferência.</div>`
    : '';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';
  const monthName = MONTH_NAMES[Math.max(0, Number(monthRef) - 1)] || monthRef;
  const greeting = recipientName ? `Olá, ${recipientName}!` : 'Olá!';

  const subject = `Insights do mês - ${complexName} - ${monthName}/${yearRef}`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#263238;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 10px;background:#f5f7fa;"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:24px 28px;background:#0b8f88;color:#fff;"><div style="font-size:20px;font-weight:700;">Acqua X Control</div><div style="margin-top:5px;font-size:13px;color:#d7fffb;">Insights de ${monthName}/${yearRef} — ${complexName}</div></td></tr>
    <tr><td style="padding:24px 28px 8px;"><div style="font-size:16px;font-weight:700;">${greeting}</div><p style="margin:8px 0 0;color:#5f6b72;font-size:14px;line-height:1.5;">Este é um resumo executivo do desempenho de consumo do condomínio no período fechado.</p></td></tr>
    <tr><td style="padding:12px 28px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" style="padding:12px 8px;background:#eefaf8;border-radius:8px;text-align:center;"><div style="font-size:11px;color:#54706e;">CONSUMO TOTAL</div><div style="margin-top:5px;font-size:20px;font-weight:700;color:#087a73;">${fmtNumber(totalConsumption)} m³</div></td>
      <td width="33%" style="padding:12px 8px;text-align:center;"><div style="font-size:11px;color:#7c8589;">UNIDADES</div><div style="margin-top:5px;font-size:20px;font-weight:700;color:#263238;">${reports.length}</div></td>
      <td width="33%" style="padding:12px 8px;background:#f5f8ff;border-radius:8px;text-align:center;"><div style="font-size:11px;color:#63718d;">VALOR TOTAL</div><div style="margin-top:5px;font-size:20px;font-weight:700;color:#2856a6;">${fmtCurrency(totalValue)}</div></td>
    </tr></table></td></tr>
    <tr><td style="padding:8px 28px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:13px;color:#6d777b;">Variação mensal</td><td style="font-size:13px;font-weight:700;text-align:right;color:${variation != null && variation > 5 ? '#c0392b' : '#287b58'};">${variationText}</td></tr><tr><td style="padding-top:8px;font-size:13px;color:#6d777b;">Média por unidade</td><td style="padding-top:8px;font-size:13px;font-weight:700;text-align:right;">${fmtNumber(reports.length ? totalConsumption / reports.length : 0)} m³</td></tr></table>${alertHtml}</td></tr>
    <tr><td style="padding:18px 28px;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Maiores consumos para acompanhamento</div><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e8ea;">${topRows || '<tr><td style="padding:8px 0;color:#777;font-size:13px;">Sem dados suficientes no período.</td></tr>'}</table></td></tr>
    <tr><td style="padding:4px 28px 26px;text-align:center;"><a href="${baseUrl}/dashboard" style="display:inline-block;padding:12px 22px;background:#0b8f88;color:#fff;text-decoration:none;border-radius:7px;font-size:13px;font-weight:700;">Abrir dashboard do condomínio</a></td></tr>
    <tr><td style="padding:14px 28px;background:#f7f8f9;text-align:center;color:#8b9599;font-size:11px;">Mensagem automática do Acqua X Control. Em caso de dúvidas: medicao@acquaxdobrasil.com.br.</td></tr>
  </table></td></tr></table></body></html>`;

  const text = `${greeting}\n\nInsights de ${monthName}/${yearRef} — ${complexName}\n\nConsumo total: ${fmtNumber(totalConsumption)} m³\nUnidades analisadas: ${reports.length}\nValor total: ${fmtCurrency(totalValue)}\nMédia por unidade: ${fmtNumber(reports.length ? totalConsumption / reports.length : 0)} m³\nVariação mensal: ${variationText}\nUnidades com consumo zero: ${zeroUnits}\n\nAcesse ${baseUrl}/dashboard para acompanhar o condomínio.`;
  return { subject, html, text };
}
