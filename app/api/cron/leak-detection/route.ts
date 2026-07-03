/**
 * POST /api/cron/leak-detection
 *
 * Roda semanalmente. Analisa padrões de consumo de todos os condomínios
 * e notifica síndicos/administradoras sobre unidades com possível vazamento.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/services/email-service';
import { detectLeaksForComplex } from '@/lib/services/leak-detection-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Buscar todos os condomínios ativos
  const complexes = await prisma.complex.findMany({
    where: { deletedAt: null },
    select: { id: true, socialName: true },
  });

  let totalLeaks = 0;
  let emailsSent = 0;

  for (const cx of complexes) {
    const leaks = await detectLeaksForComplex(cx.id);

    if (leaks.length === 0) continue;
    totalLeaks += leaks.length;

    // Buscar síndicos/administradoras
    const recipients = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roleAssignments: {
          some: {
            deletedAt: null,
            complexId: cx.id,
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

    const severityColors: Record<string, string> = { high: '#e53935', medium: '#ff9800', low: '#fbc02d' };
    const severityLabels: Record<string, string> = { high: 'Alto', medium: 'Médio', low: 'Baixo' };

    const leakRows = leaks.map(l => `
      <tr>
        <td style="padding:6px 12px;font-size:13px;color:#333;">${l.blockName} / ${l.apartmentName}</td>
        <td style="padding:6px 12px;font-size:13px;text-align:center;">
          <span style="background:${severityColors[l.severity]};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${severityLabels[l.severity]}</span>
        </td>
        <td style="padding:6px 12px;font-size:13px;color:#666;">${l.avgDailyConsumption} m³/dia</td>
        <td style="padding:6px 12px;font-size:13px;color:#666;">${l.nightConsumptionRatio}% noturno</td>
      </tr>
    `).join('');

    const reasons = leaks.map(l => `<li style="margin:4px 0;font-size:13px;color:#333;"><strong>${l.blockName}/${l.apartmentName}:</strong> ${l.reason}</li>`).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#ff9800;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Possíveis Vazamentos - ${cx.socialName}</p>
          <p style="margin:4px 0 0 0;color:#ffe0b2;font-size:13px;">Análise automática dos últimos 14 dias</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;">
            O sistema identificou <strong>${leaks.length} unidade(s)</strong> com padrão de consumo compatível com possível vazamento.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
            <tr style="background:#f8f9fa;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Unidade</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;text-align:center;">Severidade</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Média diária</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Consumo noturno</td>
            </tr>
            ${leakRows}
          </table>
          <p style="margin:12px 0 4px 0;font-size:13px;font-weight:600;color:#333;">Detalhes:</p>
          <ul style="margin:0;padding-left:20px;">${reasons}</ul>
          <div style="background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:12px 16px;margin-top:16px;">
            <p style="margin:0;font-size:12px;color:#856404;line-height:1.5;">
              Esta é uma análise automática baseada em padrões de consumo. Recomenda-se inspeção presencial para confirmar vazamentos.
            </p>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;text-align:center;">
          <a href="${baseUrl}/monitoring" style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Ver monitoramento</a>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:11px;color:#999;text-align:center;">
            Este e um email automatico. Nao responda.<br>
            Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const text = `AcquaXControl - Possiveis Vazamentos - ${cx.socialName}

O sistema identificou ${leaks.length} unidade(s) com possivel vazamento:

${leaks.map(l => `- ${l.blockName}/${l.apartmentName} (${severityLabels[l.severity]}): ${l.reason}`).join('\n')}

Esta e uma analise automatica. Recomenda-se inspecao presencial.

Acesse ${baseUrl}/monitoring para ver os detalhes.

Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.`;

    for (const recipient of validRecipients) {
      try {
        await sendEmail({
          to: recipient.email,
          toName: recipient.fullName,
          subject: `Possiveis Vazamentos - ${cx.socialName}`,
          html,
          text,
        });
        emailsSent++;
      } catch (e) {
        console.error(`[LeakDetection] Erro ao enviar para ${recipient.email}:`, e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    complexesChecked: complexes.length,
    totalLeaks,
    emailsSent,
  });
}
