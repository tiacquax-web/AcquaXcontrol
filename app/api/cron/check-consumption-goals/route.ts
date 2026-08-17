import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/services/email-service';
import { findApartmentRecipients, findComplexManagementRecipients, isExternalNotificationEmail } from '@/lib/services/notification-recipients';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutos para processar todos os apartamentos

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthRef = `${year}-${month}`;
  
  // Início do mês atual para cálculo de consumo IoT
  const startOfMonth = new Date(year, now.getMonth(), 1);

  // 1. Buscar apartamentos que possuem metas configuradas e alertas habilitados
  const apartments = await prisma.apartment.findMany({
    where: {
      deletedAt: null,
      goalAlertsEnabled: true,
      OR: [
        { consumptionGoalWater: { gt: 0 } },
        { consumptionGoalGas: { gt: 0 } },
        { consumptionGoalEnergy: { gt: 0 } }
      ]
    },
    include: {
      block: {
        include: {
          complex: true
        }
      }
    }
  });

  let notificationsSent = 0;

  for (const apt of apartments) {
    // 2. Calcular consumo acumulado no mês para cada utilitário (via IoT)
    // Buscamos a primeira leitura do mês e a última leitura disponível
    const meters = await prisma.meter.findMany({
      where: { apartmentId: apt.id, deletedAt: null },
      select: { id: true, typeMeter: { select: { acronym: true } }, rotation: true }
    });

    for (const meter of meters) {
      const type = meter.typeMeter?.acronym?.toLowerCase() || 'water';
      const goal = type.includes('agua') || type.includes('água') ? apt.consumptionGoalWater :
                   type.includes('gas') || type.includes('gás') ? apt.consumptionGoalGas :
                   type.includes('ener') ? apt.consumptionGoalEnergy : null;

      if (!goal || goal <= 0) continue;

      // Buscar leituras IoT do mês
      const readings = await prisma.reading.findMany({
        where: {
          meterId: meter.id,
          readAt: { gte: startOfMonth },
          isManualReading: false,
          deletedAt: null
        },
        orderBy: { readAt: 'asc' },
        select: { reading: true }
      });

      if (readings.length < 2) continue;

      const firstReading = Number(readings[0].reading || 0);
      const lastReading = Number(readings[readings.length - 1].reading || 0);
      
      let currentConsumption = 0;
      if (meter.rotation === 'Decrescente') {
        currentConsumption = firstReading - lastReading;
      } else {
        currentConsumption = lastReading - firstReading;
      }

      if (currentConsumption <= 0) continue;

      const percent = (currentConsumption / goal) * 100;
      
      // 3. Verificar se atingiu os gatilhos (50%, 80%, 100%)
      let trigger = 0;
      if (percent >= 100) trigger = 100;
      else if (percent >= 80) trigger = 80;
      else if (percent >= 50) trigger = 50;

      if (trigger === 0) continue;

      // Verificar se já enviamos este alerta este mês
      const sentAlerts = apt.sentGoalAlerts || "";
      const currentMonthPrefix = `${monthRef}:`;
      const hasSentThisMonth = sentAlerts.startsWith(currentMonthPrefix);
      const alreadySentTriggers = hasSentThisMonth ? sentAlerts.split(':')[1].split(',') : [];

      if (alreadySentTriggers.includes(trigger.toString())) continue;

      // 4. Enviar notificação
      const unit = type.includes('ener') ? 'kWh' : 'm³';
      const utilityName = type.includes('agua') || type.includes('água') ? 'Água' :
                          type.includes('gas') || type.includes('gás') ? 'Gás' : 'Energia';

      const success = await sendGoalNotification(apt, utilityName, currentConsumption, goal, trigger, unit);
      
      if (success) {
        notificationsSent++;
        // Atualizar rastreamento de alertas enviados
        const newTriggers = [...new Set([...alreadySentTriggers, trigger.toString()])].join(',');
        await prisma.apartment.update({
          where: { id: apt.id },
          data: { sentGoalAlerts: `${currentMonthPrefix}${newTriggers}` }
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    apartmentsChecked: apartments.length,
    notificationsSent
  });
}

async function sendGoalNotification(apt: any, utility: string, current: number, goal: number, trigger: number, unit: string) {
  const residents = (await findApartmentRecipients(apt.id))
    .filter(r => isExternalNotificationEmail(r.email));
    
  const complexId = apt.block?.complex?.id || apt.complexId;
  const managementRecipients = complexId 
    ? (await findComplexManagementRecipients(complexId)).filter(r => isExternalNotificationEmail(r.email))
    : [];

  if (residents.length === 0 && managementRecipients.length === 0) return false;

  const complexName = apt.block?.complex?.socialName || 'Condomínio';
  const blockName = apt.block?.name || '-';
  const aptName = apt.name || '-';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

  const color = trigger >= 100 ? '#c62828' : trigger >= 80 ? '#f57c00' : '#1e88e5';
  const title = trigger >= 100 ? 'Meta de Consumo Atingida' : 
                trigger >= 80 ? 'Atenção: Consumo Elevado' : 'Aviso de Consumo';
  
  const message = trigger >= 100 
    ? `Você atingiu <strong>100%</strong> da sua meta de consumo de ${utility} (${goal}${unit}).`
    : `Você já consumiu <strong>${trigger}%</strong> da sua meta mensal de ${utility} (${goal}${unit}).`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:${color};padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${title} - ${complexName}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;">Olá,</p>
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;line-height:1.6;">
            Estamos acompanhando o consumo da sua unidade (<strong>${blockName} / ${aptName}</strong>) e gostaríamos de informar:
          </p>
          <div style="background:#f8f9fa;border-left:4px solid ${color};padding:16px;margin-bottom:16px;">
            <p style="margin:0;font-size:15px;color:#333;">${message}</p>
            <p style="margin:8px 0 0 0;font-size:14px;color:#666;">Consumo atual: <strong>${current.toFixed(2)}${unit}</strong></p>
          </div>
          <p style="margin:0 0 16px 0;font-size:13px;color:#666;line-height:1.5;">
            Este aviso ajuda você a manter o controle sobre seus gastos antes do fechamento da fatura.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;text-align:center;">
          <a href="${baseUrl}/monitoring" style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Ver monitoramento</a>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:11px;color:#999;text-align:center;">
            Este e um email automatico de controle de consumo. Nao responda.<br>
            Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // Enviar para moradores e gestão
  const allRecipients = [
    ...residents.map(r => ({ ...r, type: 'Morador' })),
    ...managementRecipients.map(r => ({ ...r, type: 'Gestão' }))
  ];

  for (const recipient of allRecipients) {
    try {
      await sendEmail({
        to: recipient.email,
        toName: recipient.name,
        subject: `${title} (${trigger}%) - ${complexName} - ${blockName}/${aptName}`,
        html,
        text: `${title}: ${message} Consumo atual: ${current.toFixed(2)}${unit}. Acesse o portal para detalhes.`
      });
    } catch (e) {
      console.error(`[GoalNotification] Erro ao enviar para ${recipient.email}:`, e);
    }
  }
  return true;
}
