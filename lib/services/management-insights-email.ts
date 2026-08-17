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

  // Filtro de duplicidade por complexo e período para e-mails de gestão
  const existing = await prisma.emailJob.findMany({
    where: {
      complexId: reading.complexId,
      monthRef: readingMonthRef,
      yearRef: readingYearRef,
      subject: { startsWith: MANAGEMENT_INSIGHT_PREFIX },
    },
    select: { id: true, toEmail: true, status: true },
  });

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
      subject: `${MANAGEMENT_INSIGHT_PREFIX} Relatório Executivo e Insights - ${reading.monthRef}/${reading.yearRef} - ${reading.complexId}`,
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
  const [complex, reports, previousReports, dealershipReading] = await Promise.all([
    prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } }),
    prisma.apartmentConsumptionReport.findMany({
      where: { complexId, monthRef, yearRef, deletedAt: null },
      select: {
        consumption: true,
        totalConsumption: true,
        totalUnit: true,
        consumptionCost: true,
        sewageCost: true,
        apartment: { select: { name: true, block: { select: { name: true } } } },
      },
    }),
    prisma.apartmentConsumptionReport.findMany({
      where: { complexId, monthRef: previous.monthRef, yearRef: previous.yearRef, deletedAt: null },
      select: { consumption: true, totalConsumption: true },
    }),
    prisma.dealershipReading.findFirst({
      where: { complexId, monthRef, yearRef, deletedAt: null },
      select: { dealershipConsumption: true, totalValue: true, average: true, totalDays: true, readingDate: true },
    }),
  ]);

  const complexName = complex?.socialName || 'Condomínio';
  const totalConsumption = reports.reduce((sum, report) => sum + (report.totalConsumption ?? report.consumption ?? 0), 0);
  const totalValue = reports.reduce((sum, report) => sum + (report.totalUnit ?? 0), 0);
  const previousTotal = previousReports.reduce((sum, report) => sum + (report.totalConsumption ?? report.consumption ?? 0), 0);
  const variation = previousTotal > 0 ? ((totalConsumption - previousTotal) / previousTotal) * 100 : null;
  const zeroUnits = reports.filter((report) => (report.totalConsumption ?? report.consumption ?? 0) === 0);
  
  const sorted = [...reports].sort((a, b) => (b.totalConsumption ?? b.consumption ?? 0) - (a.totalConsumption ?? a.consumption ?? 0));
  const topUnits = sorted.slice(0, 5);
  const lowestUnits = [...reports].sort((a, b) => (a.totalConsumption ?? a.consumption ?? 0) - (b.totalConsumption ?? b.consumption ?? 0)).slice(0, 5);

  const topRows = topUnits.map((report) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${report.apartment?.block?.name || 'Bloco Único'} — Ap. ${report.apartment?.name || '-'}</td>
      <td style="padding:8px 12px;font-size:13px;color:#0f766e;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtNumber(report.totalConsumption ?? report.consumption ?? 0)} m³</td>
      <td style="padding:8px 12px;font-size:13px;color:#334155;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtCurrency(report.totalUnit ?? 0)}</td>
    </tr>`).join('');

  const lowestRows = lowestUnits.map((report) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${report.apartment?.block?.name || 'Bloco Único'} — Ap. ${report.apartment?.name || '-'}</td>
      <td style="padding:8px 12px;font-size:13px;color:#2563eb;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtNumber(report.totalConsumption ?? report.consumption ?? 0)} m³</td>
      <td style="padding:8px 12px;font-size:13px;color:#334155;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtCurrency(report.totalUnit ?? 0)}</td>
    </tr>`).join('');

  const variationColor = variation == null ? '#64748b' : variation > 5 ? '#dc2626' : variation < -5 ? '#16a34a' : '#0f766e';
  const variationText = variation == null ? 'Sem histórico anterior' : `${variation > 0 ? '+' : ''}${variation.toFixed(1)}% vs. ${previous.monthName}`;
  
  const alertHtml = zeroUnits.length > 0
    ? `<div style="margin:20px 0;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#991b1b;font-size:13px;">
         <strong style="display:block;margin-bottom:4px;font-size:14px;">⚠️ Alerta Operacional (${zeroUnits.length} unidade(s) com consumo zero):</strong>
         As seguintes unidades não registraram consumo neste ciclo e precisam de verificação: ${zeroUnits.map(u => `${u.apartment?.block?.name || ''} Ap ${u.apartment?.name || ''}`).join(', ')}.
       </div>`
    : '';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';
  const monthName = MONTH_NAMES[Math.max(0, Number(monthRef) - 1)] || monthRef;
  const greeting = recipientName ? `Olá, ${recipientName}!` : 'Olá, Gestor(a)!';

  const subject = `Relatório Executivo e Insights — ${complexName} — ${monthName}/${yearRef}`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Insights do Condomínio</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 15px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -1px rgba(0,0,0,0.03);border:1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #0f766e 0%, #0d9488 100%);padding:32px 36px;color:#ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ccfbf1;margin-bottom:6px;">Acqua X Control • Inteligência em Medição</div>
                    <div style="font-size:24px;font-weight:700;line-height:1.2;margin-bottom:4px;">Relatório Executivo Mensal</div>
                    <div style="font-size:15px;color:#99f6e4;font-weight:500;">${complexName} • Referência: ${monthName}/${yearRef}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Salutation & Intro -->
          <tr>
            <td style="padding:32px 36px 20px 36px;">
              <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">${greeting}</div>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Abaixo está o balanço consolidados do consumo de água e esgoto do condomínio referente ao fechamento de <strong>${monthName}/${yearRef}</strong>. Utilize estes indicadores para auditoria de contas, rateios e acompanhamento de eficiência hídrica.
              </p>
            </td>
          </tr>

          <!-- KPI Cards -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="31%" style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:#0f766e;text-transform:uppercase;margin-bottom:6px;">Consumo Total</div>
                    <div style="font-size:20px;font-weight:700;color:#115e59;">${fmtNumber(totalConsumption)} <span style="font-size:12px;font-weight:normal;">m³</span></div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Unidades Atendidas</div>
                    <div style="font-size:20px;font-weight:700;color:#334155;">${reports.length}</div>
                  </td>
                  <td width="3.5%"></td>
                  <td width="31%" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:12px;padding:16px;text-align:center;">
                    <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:#1d4ed8;text-transform:uppercase;margin-bottom:6px;">Valor Faturado</div>
                    <div style="font-size:18px;font-weight:700;color:#1e40af;">${fmtCurrency(totalValue)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Secondary Metrics Bar -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;">
                <tr>
                  <td width="50%" style="border-right:1px solid #e2e8f0;padding-right:16px;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Variação vs. Mês Anterior (${previous.monthName})</div>
                    <div style="font-size:14px;font-weight:700;color:${variationColor};">${variationText}</div>
                  </td>
                  <td width="50%" style="padding-left:16px;">
                    <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Média por Unidade</div>
                    <div style="font-size:14px;font-weight:700;color:#334155;">${fmtNumber(reports.length ? totalConsumption / reports.length : 0)} m³ / apt</div>
                  </td>
                </tr>
              </table>
              ${alertHtml}
            </td>
          </tr>

          <!-- Top Consumption Section -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px;">📈 Top 5 Maiores Consumos</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;">Unidade</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;">Consumo</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;">Valor Total</th>
                </tr>
                ${topRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#94a3b8;font-size:13px;">Sem dados disponíveis.</td></tr>'}
              </table>
            </td>
          </tr>

          <!-- Lowest Consumption Section -->
          <tr>
            <td style="padding:0 36px 32px 36px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px;">📉 Top 5 Menores Consumos (Mais Eficientes)</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;">Unidade</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;">Consumo</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;">Valor Total</th>
                </tr>
                ${lowestRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#94a3b8;font-size:13px;">Sem dados disponíveis.</td></tr>'}
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding:0 36px 40px 36px;">
              <a href="${baseUrl}/dashboard" style="background:#0f766e;color:#ffffff;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;display:inline-block;box-shadow:0 4px 6px -1px rgba(15,118,110,0.2);">Acessar Painel Completo do Condomínio</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 36px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:12px;line-height:1.5;">
              Este é um relatório gerado automaticamente pelo sistema <strong>Acqua X Control</strong>.<br>
              Dúvidas ou suporte técnico? Entre em contato em <a href="mailto:medicao@acquaxdobrasil.com.br" style="color:#0f766e;text-decoration:none;">medicao@acquaxdobrasil.com.br</a>.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${greeting}\n\nRelatório Executivo Mensal — ${complexName} — ${monthName}/${yearRef}\n\nConsumo Total: ${fmtNumber(totalConsumption)} m³\nUnidades Atendidas: ${reports.length}\nValor Faturado: ${fmtCurrency(totalValue)}\nMédia por Unidade: ${fmtNumber(reports.length ? totalConsumption / reports.length : 0)} m³\nVariação vs. Mês Anterior: ${variationText}\nUnidades com Consumo Zero: ${zeroUnits.length}\n\nAcesse ${baseUrl}/dashboard para ver o painel completo.`;

  return { subject, html, text };
}
