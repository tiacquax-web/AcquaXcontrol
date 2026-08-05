/**
 * POST /api/cron/send-monthly-summary
 *
 * Envia um email consolidado mensal para síndicos e administradoras
 * com o resumo de consumo do condomínio. Roda no dia 5 de cada mês,
 * cobrindo o mês anterior.
 *
 * Conteúdo do email (HTML, sem PDF):
 * - Total consumido pelo condomínio
 * - Número de unidades analisadas
 * - Unidades com maior e menor consumo
 * - Unidades com consumo anômalo (zero, negativo)
 * - Comparação com mês anterior
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/services/email-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtNumber(v: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(v || 0);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Determinar mês de referência (mês anterior)
  const now = new Date();
  const refDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthRef = String(refDate.getMonth() + 1).padStart(2, '0');
  const yearRef = String(refDate.getFullYear());
  const monthName = MONTH_NAMES[refDate.getMonth()];

  // Mês anterior ao de referência (para comparação)
  const prevDate = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
  const prevYear = String(prevDate.getFullYear());

  // 1. Buscar todos os condomínios que têm relatórios no mês de referência
  const complexesWithReports = await prisma.apartmentConsumptionReport.findMany({
    where: {
      deletedAt: null,
      monthRef,
      yearRef,
    },
    select: {
      id: true,
      consumption: true,
      totalConsumption: true,
      totalUnit: true,
      apartmentId: true,
      apartment: {
        select: {
          id: true,
          name: true,
          block: {
            select: {
              id: true,
              name: true,
              complex: { select: { id: true, socialName: true } },
            },
          },
        },
      },
    },
  });

  // Agrupar por condomínio
  const byComplex: Record<string, {
    complexName: string;
    reports: typeof complexesWithReports;
  }> = {};

  for (const report of complexesWithReports) {
    const cx = report.apartment?.block?.complex;
    if (!cx) continue;
    if (!byComplex[cx.id]) {
      byComplex[cx.id] = { complexName: cx.socialName, reports: [] };
    }
    byComplex[cx.id].reports.push(report);
  }

  let emailsSent = 0;

  for (const [complexId, { complexName, reports }] of Object.entries(byComplex)) {
    if (reports.length === 0) continue;

    // 2. Calcular estatísticas do mês atual
    const totalConsumption = reports.reduce((s, r) => s + (r.totalConsumption ?? r.consumption ?? 0), 0);
    const totalValue = reports.reduce((s, r) => s + (r.totalUnit ?? 0), 0);
    const unitCount = reports.length;

    const sorted = [...reports].sort((a, b) =>
      (b.totalConsumption ?? b.consumption ?? 0) - (a.totalConsumption ?? a.consumption ?? 0)
    );

    const top5 = sorted.slice(0, 5);
    const bottom5 = sorted.slice(-5).reverse();

    const zeroUnits = reports.filter(r => (r.totalConsumption ?? r.consumption ?? 0) === 0);
    const negativeUnits = reports.filter(r => (r.totalConsumption ?? r.consumption ?? 0) < 0);

    // 3. Buscar dados do mês anterior para comparação
    const prevReports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        deletedAt: null,
        monthRef: prevMonth,
        yearRef: prevYear,
        apartment: { block: { complexId } },
      },
      select: { consumption: true, totalConsumption: true },
    });

    const prevTotal = prevReports.reduce((s, r) => s + (r.totalConsumption ?? r.consumption ?? 0), 0);
    const variationPct = prevTotal > 0
      ? Math.round(((totalConsumption - prevTotal) / prevTotal) * 100 * 10) / 10
      : null;

    // 4. Buscar síndicos e administradoras
    const recipients = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roleAssignments: {
          some: {
            deletedAt: null,
            complexId,
            role: {
              deletedAt: null,
              name: { in: ['Síndico', 'Administradora', 'Sindico', 'Administrador', 'Admin'] },
            },
          },
        },
      },
      select: { id: true, email: true, fullName: true },
    });

    if (recipients.length === 0) continue;

    const validRecipients = recipients.filter(r =>
      r.email && !r.email.includes('@acquax') && !r.email.includes('@acquaxdobrasil') && !r.email.includes('@acquaxcontrol')
    );

    if (validRecipients.length === 0) continue;

    // 5. Montar email HTML
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

    const top5Rows = top5.map(r => `
      <tr>
        <td style="padding:6px 12px;font-size:13px;color:#333;">${r.apartment?.block?.name || '-'} / ${r.apartment?.name || '-'}</td>
        <td style="padding:6px 12px;font-size:13px;color:#333;text-align:right;">${fmtNumber(r.totalConsumption ?? r.consumption ?? 0)} m³</td>
      </tr>`).join('');

    const bottom5Rows = bottom5.map(r => `
      <tr>
        <td style="padding:6px 12px;font-size:13px;color:#333;">${r.apartment?.block?.name || '-'} / ${r.apartment?.name || '-'}</td>
        <td style="padding:6px 12px;font-size:13px;color:#333;text-align:right;">${fmtNumber(r.totalConsumption ?? r.consumption ?? 0)} m³</td>
      </tr>`).join('');

    const variationHtml = variationPct !== null
      ? `<tr>
          <td style="padding:4px 0;font-size:13px;color:#888;">Variação vs ${MONTH_NAMES[prevDate.getMonth()]}</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right;color:${variationPct > 5 ? '#e53935' : variationPct < -5 ? '#43a047' : '#666'};">
            ${variationPct > 0 ? '+' : ''}${variationPct}%
          </td>
        </tr>`
      : '';

    const anomaliesHtml = (zeroUnits.length > 0 || negativeUnits.length > 0) ? `
      <div style="background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:12px 16px;margin-top:12px;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#856404;">Unidades com atenção</p>
        ${zeroUnits.length > 0 ? `<p style="margin:0 0 2px 0;font-size:12px;color:#856404;">${zeroUnits.length} unidade(s) com consumo zero</p>` : ''}
        ${negativeUnits.length > 0 ? `<p style="margin:0;font-size:12px;color:#856404;">${negativeUnits.length} unidade(s) com consumo negativo (possível erro de leitura)</p>` : ''}
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#1e88e5;padding:24px 32px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">AcquaX do Brasil</p>
          <p style="margin:4px 0 0 0;color:#bbdefb;font-size:13px;">Resumo Mensal - ${complexName}</p>
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#333;">Relatório de ${monthName}/${yearRef}</p>
          <p style="margin:4px 0 20px 0;font-size:14px;color:#666;">Resumo consolidado do consumo do condomínio.</p>
        </td></tr>

        <!-- Stats principais -->
        <tr><td style="padding:0 32px 16px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;padding:16px 20px;">
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Unidades analisadas</td><td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${unitCount}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Consumo total</td><td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtNumber(totalConsumption)} m³</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Valor total faturado</td><td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtCurrency(totalValue)}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Média por unidade</td><td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtNumber(totalConsumption / unitCount)} m³</td></tr>
            ${variationHtml}
          </table>
          ${anomaliesHtml}
        </td></tr>

        <!-- Top 5 -->
        <tr><td style="padding:0 32px 16px 32px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#333;">Top 5 maiores consumos</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8f9fa;"><td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Unidade</td><td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;text-align:right;">Consumo</td></tr>
            ${top5Rows}
          </table>
        </td></tr>

        <!-- Bottom 5 -->
        <tr><td style="padding:0 32px 16px 32px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#333;">Top 5 menores consumos</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8f9fa;"><td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Unidade</td><td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;text-align:right;">Consumo</td></tr>
            ${bottom5Rows}
          </table>
        </td></tr>

        <tr><td style="padding:0 32px 24px 32px;text-align:center;">
          <a href="${baseUrl}/levantamento" style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Ver levantamento completo</a>
        </td></tr>

        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:11px;color:#999;text-align:center;">
            Este e um email automatico do sistema AcquaXControl. Nao responda.<br>
            Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const text = `AcquaX do Brasil - Resumo Mensal - ${complexName}

Relatorio de ${monthName}/${yearRef}

Unidades analisadas: ${unitCount}
Consumo total: ${fmtNumber(totalConsumption)} m3
Valor total faturado: ${fmtCurrency(totalValue)}
Media por unidade: ${fmtNumber(totalConsumption / unitCount)} m3
${variationPct !== null ? `Variacao vs ${MONTH_NAMES[prevDate.getMonth()]}: ${variationPct > 0 ? '+' : ''}${variationPct}%` : ''}

Top 5 maiores consumos:
${top5.map(r => `- ${r.apartment?.block?.name || '-'}/${r.apartment?.name || '-'}: ${fmtNumber(r.totalConsumption ?? r.consumption ?? 0)} m3`).join('\n')}

Top 5 menores consumos:
${bottom5.map(r => `- ${r.apartment?.block?.name || '-'}/${r.apartment?.name || '-'}: ${fmtNumber(r.totalConsumption ?? r.consumption ?? 0)} m3`).join('\n')}

${zeroUnits.length > 0 ? `Unidades com consumo zero: ${zeroUnits.length}` : ''}
${negativeUnits.length > 0 ? `Unidades com consumo negativo: ${negativeUnits.length}` : ''}

Acesse ${baseUrl}/levantamento para ver o levantamento completo.

Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.`;

    // 6. Enviar
    for (const recipient of validRecipients) {
      try {
        await sendEmail({
          to: recipient.email,
          toName: recipient.fullName,
          subject: `Resumo Mensal - ${complexName} - ${monthName}/${yearRef}`,
          html,
          text,
        });
        emailsSent++;
      } catch (e) {
        console.error(`[MonthlySummary] Erro ao enviar para ${recipient.email}:`, e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    monthRef,
    yearRef,
    complexesProcessed: Object.keys(byComplex).length,
    emailsSent,
  });
}
