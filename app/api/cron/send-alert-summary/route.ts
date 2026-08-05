/**
 * POST /api/cron/send-alert-summary
 *
 * Verifica anomalias de consumo nos últimos 7 dias e, se houver,
 * envia um email consolidado para síndicos e administradoras do condomínio.
 *
 * Usa a mesma lógica de detecção da rota /api/monitoring/alerts.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/services/email-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALERT_LABELS: Record<string, string> = {
  NEGATIVE_CONSUMPTION: 'Consumo negativo (leitura regressiva)',
  OUTLIER_HIGH: 'Consumo anormalmente alto',
  OUTLIER_LOW: 'Consumo anormalmente baixo',
  ZERO_CONSUMPTION: 'Dias consecutivos sem consumo',
  HAS_ALERT: 'Alerta do dispositivo',
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Buscar todos os condomínios que têm medidores com leituras no período
  const metersWithReadings = await prisma.meter.findMany({
    where: {
      deletedAt: null,
      readings: {
        some: { readAt: { gte: fromDate, lte: toDate }, deletedAt: null },
      },
    },
    select: {
      id: true,
      register: true,
      rotation: true,
      complexId: true,
      apartment: {
        select: {
          name: true,
          block: { select: { name: true, complex: { select: { id: true, socialName: true } } } },
        },
      },
    },
  });

  // Agrupar por condomínio
  const byComplex: Record<string, { complexName: string; meters: typeof metersWithReadings }> = {};
  for (const m of metersWithReadings) {
    const cxId = m.apartment?.block?.complex?.id || m.complexId;
    if (!cxId) continue;
    if (!byComplex[cxId]) {
      byComplex[cxId] = {
        complexName: m.apartment?.block?.complex?.socialName || 'Condomínio',
        meters: [],
      };
    }
    byComplex[cxId].meters.push(m);
  }

  let emailsSent = 0;
  let totalAnomalies = 0;

  for (const [complexId, { complexName, meters }] of Object.entries(byComplex)) {
    // 2. Buscar leituras do período para os medidores deste condomínio
    const meterIds = meters.map(m => m.id);
    const readings = await prisma.reading.findMany({
      where: {
        meterId: { in: meterIds },
        readAt: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
      select: { id: true, meterId: true, reading: true, readAt: true, alerts: true },
      orderBy: { readAt: 'asc' },
    });

    // 3. Detectar anomalias por medidor
    const anomalies: { location: string; date: string; types: string[] }[] = [];

    for (const meter of meters) {
      const meterReadings = readings
        .filter(r => r.meterId === meter.id)
        .sort((a, b) => a.readAt.getTime() - b.readAt.getTime());

      if (meterReadings.length < 2) continue;

      const rotation = meter.rotation || 'Crescente';
      const location = [
        complexName,
        meter.apartment?.block?.name ? `Bloco ${meter.apartment.block.name}` : null,
        meter.apartment?.name ? `Apto ${meter.apartment.name}` : null,
      ].filter(Boolean).join(' > ');

      const deltas: number[] = [];
      for (let i = 1; i < meterReadings.length; i++) {
        const prev = Number(meterReadings[i - 1].reading ?? 0);
        const curr = Number(meterReadings[i].reading ?? 0);
        deltas.push(rotation === 'Decrescente' ? prev - curr : curr - prev);
      }

      const positive = deltas.filter(d => d > 0);
      const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;
      const variance = positive.length >= 3
        ? positive.reduce((acc, d) => acc + (d - avg) ** 2, 0) / positive.length
        : 0;
      const stdDev = Math.sqrt(variance);

      for (let i = 1; i < meterReadings.length; i++) {
        const delta = deltas[i - 1];
        const types: string[] = [];

        if (delta < 0) types.push('NEGATIVE_CONSUMPTION');
        if (stdDev > 0 && delta > avg + 2 * stdDev) types.push('OUTLIER_HIGH');
        if (stdDev > 0 && delta > 0 && delta < avg - 2 * stdDev) types.push('OUTLIER_LOW');

        if (meterReadings[i].alerts) {
          try {
            const parsed: string[] = JSON.parse(meterReadings[i].alerts);
            if (parsed.length) types.push('HAS_ALERT');
          } catch {}
        }

        if (types.length > 0) {
          anomalies.push({ location, date: isoDay(meterReadings[i].readAt), types });
        }
      }
    }

    if (anomalies.length === 0) continue;
    totalAnomalies += anomalies.length;

    // 4. Buscar síndicos e administradoras deste condomínio
    const recipients = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roleAssignments: {
          some: {
            deletedAt: null,
            complexId: complexId,
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

    // 5. Filtrar domínios internos
    const validRecipients = recipients.filter(r =>
      r.email &&
      !r.email.includes('@acquax') &&
      !r.email.includes('@acquaxdobrasil') &&
      !r.email.includes('@acquaxcontrol')
    );

    if (validRecipients.length === 0) continue;

    // 6. Montar email HTML
    const anomalyRows = anomalies.slice(0, 20).map(a => `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#333;">${a.location}</td>
        <td style="padding:6px 0;font-size:13px;color:#666;">${a.date}</td>
        <td style="padding:6px 0;font-size:13px;color:#e53935;font-weight:600;">${a.types.map(t => ALERT_LABELS[t] || t).join(', ')}</td>
      </tr>
    `).join('');

    const moreCount = anomalies.length > 20 ? `<p style="margin:8px 0 0 0;font-size:12px;color:#888;">E mais ${anomalies.length - 20} anomalia(s)...</p>` : '';

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#e53935;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Alertas de Consumo - ${complexName}</p>
          <p style="margin:4px 0 0 0;color:#ffcdd2;font-size:13px;">Resumo dos ultimos 7 dias</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;">
            Foram detectadas <strong>${anomalies.length} anomalia(s)</strong> de consumo no condominio <strong>${complexName}</strong> nos ultimos 7 dias.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8f9fa;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Unidade</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Data</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#888;">Tipo de alerta</td>
            </tr>
            ${anomalyRows}
          </table>
          ${moreCount}
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;text-align:center;">
          <a href="${baseUrl}/alerts" style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Ver detalhes no sistema</a>
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

    const text = `AcquaXControl - Alertas de Consumo - ${complexName}

Foram detectadas ${anomalies.length} anomalia(s) nos ultimos 7 dias.

${anomalies.slice(0, 10).map(a => `- ${a.location} (${a.date}): ${a.types.map(t => ALERT_LABELS[t] || t).join(', ')}`).join('\n')}

Acesse ${baseUrl}/alerts para ver todos os detalhes.

Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.`;

    // 7. Enviar email para cada síndico/administradora
    for (const recipient of validRecipients) {
      try {
        await sendEmail({
          to: recipient.email,
          toName: recipient.fullName,
          subject: `Alertas de Consumo - ${complexName} (ultimos 7 dias)`,
          html,
          text,
        });
        emailsSent++;
      } catch (e) {
        console.error(`[AlertSummary] Erro ao enviar para ${recipient.email}:`, e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    complexesChecked: Object.keys(byComplex).length,
    totalAnomalies,
    emailsSent,
  });
}
