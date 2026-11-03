/**
 * app/api/cron/send-pending-emails/route.ts
 *
 * Cron job que processa a fila de EmailJobs pendentes.
 * Executa a cada 10 minutos (configurado no vercel.json).
 *
 * - Busca até 50 jobs pendentes por execução
 * - Monta o email com os dados do consumo
 * - Envia via Zoho SMTP (nodemailer)
 * - Marca como "sent" ou "failed" com a mensagem de erro
 * - Jobs com 3+ tentativas falhas são marcados como "failed" permanentemente
 *
 * Autenticação: CRON_SECRET (igual ao cron do GL Import)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateFilipetaEmail } from '@/lib/services/filipeta-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';
import { getConsumptionAnalysis } from '@/lib/services/consumption-analysis';
import { buildManagementInsightEmail, cleanManagementInsightSubject, isManagementInsightJob } from '@/lib/services/management-insights-email';
import { buildWelcomeEmail, buildResetPasswordEmail } from '@/lib/services/transactional-email-templates';

export const runtime = 'nodejs';
export const maxDuration = 300; // janela do ritmo humano (orçamento controlado por EMAIL_RUN_BUDGET_MS)

// Ritmo "humano": cada e-mail sai com um intervalo ALEATÓRIO do anterior
// (padrão 25-90s), dentro de um orçamento de tempo por execução. Assim o envio
// não parece disparo em massa nem estoura o limite do Zoho, que bloqueia com
// ~45-50 envios seguidos ("Unusual sending activity").
//
// Cada execução do cron dura até RUN_BUDGET_MS e envia o que couber no tempo;
// o resto continua na fila para a próxima janela de 5 minutos. Com os padrões
// (~57s de intervalo médio) sai por volta de 60 e-mails/hora.
const MAX_BATCH = Number(process.env.EMAIL_BATCH_SIZE || 50);
const MAX_ATTEMPTS = 3;
const GAP_MIN_MS = Number(process.env.EMAIL_GAP_MIN_MS || 25000);
const GAP_MAX_MS = Math.max(GAP_MIN_MS, Number(process.env.EMAIL_GAP_MAX_MS || 90000));
const RUN_BUDGET_MS = Number(process.env.EMAIL_RUN_BUDGET_MS || 250000);
// Teto de envios por hora: garante que a cadência nunca passe disso, mesmo que
// o cron e o disparo imediato pós-salvamento se sobreponham.
const HOURLY_LIMIT = Number(process.env.EMAIL_HOURLY_LIMIT || 60);
// Não inicia nova leva se um envio acabou de sair (evita duas execuções paralelas).
const RUN_COOLDOWN_MS = Number(process.env.EMAIL_RUN_COOLDOWN_MS || 20000);
const nextGapMs = () => GAP_MIN_MS + Math.floor(Math.random() * (GAP_MAX_MS - GAP_MIN_MS + 1));
const isZohoBlocked = (err: string | undefined | null) => !!err && err.includes('Unusual sending activity');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function previousMonth(monthRef: string, yearRef: string) {
  const date = new Date(Number(yearRef), Number(monthRef) - 2, 1);
  return { monthRef: String(date.getMonth() + 1).padStart(2, '0'), yearRef: String(date.getFullYear()) };
}

function reportKey(apartmentId: string, monthRef: string, yearRef: string) {
  return `${apartmentId}:${yearRef}:${monthRef.padStart(2, '0')}`;
}

function derivePeriodStart(value: string | null | undefined, totalDays: number | null | undefined) {
  if (!value || totalDays == null || !Number.isFinite(Number(totalDays))) return undefined;
  const raw = String(value);
  const date = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() - Number(totalDays));
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Autenticação ──────────────────────────────────────────────────────────
  // O Vercel Cron NÃO envia Authorization: ele invoca a rota via GET com o
  // header 'x-vercel-cron' (<schedule>). Com CRON_SECRET configurado e só o
  // Bearer aceito, toda invocação do cron tomava 401 e a fila nunca rodava
  // (bug real: Filipetas não eram enviadas aos moradores).
  // - Chamada do Vercel Cron (x-vercel-cron presente) → autorizada
  // - Chamada externa/ manual → exige Bearer CRON_SECRET (se configurado)
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!req.headers.get('x-vercel-cron');
  if (cronSecret && !isVercelCron) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (!cronSecret) {
    console.warn('[EmailCron] CRON_SECRET não configurado — executando sem autenticação.');
  }

  console.log(`[EmailCron] Heartbeat: ${new Date().toISOString()} - Iniciando processamento de fila.`);

  // ── Verificar configuração de email ────────────────────────────────────────
  if (!isEmailConfigured()) {
    console.warn('[EmailCron] Zoho SMTP não configurado — pulando execução.');
    return NextResponse.json({ skipped: true, reason: 'email_not_configured' });
  }

  try {
    // Buscar jobs pendentes
    // ── Guardas de ritmo ─────────────────────────────────────────────────────
    const now = Date.now();
    const [lastSent, sentLastHour] = await Promise.all([
      prisma.emailJob.findFirst({
        where: { status: 'sent', sentAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
      prisma.emailJob.count({
        where: { status: 'sent', sentAt: { gte: new Date(now - 60 * 60 * 1000) } },
      }),
    ]);

    if (sentLastHour >= HOURLY_LIMIT) {
      console.log(`[EmailCron] Teto de ${HOURLY_LIMIT} envios/hora atingido — aguardando a próxima hora.`);
      return NextResponse.json({ skipped: true, reason: 'hourly_limit', sentLastHour, limit: HOURLY_LIMIT });
    }

    if (lastSent?.sentAt) {
      const sinceLast = now - new Date(lastSent.sentAt).getTime();
      if (sinceLast >= 0 && sinceLast < RUN_COOLDOWN_MS) {
        return NextResponse.json({ skipped: true, reason: 'cooldown', secondsSinceLast: Math.round(sinceLast / 1000) });
      }
    }

    // Prioridade: reset/boas-vindas saem antes das filipetas (ver email-queue.ts).
    const pendingJobs = await prisma.emailJob.findMany({
      where: {
        status: 'pending',
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: MAX_BATCH,
    });

    // Filipetas individuais VOLTARAM a ser enviadas (03/11/2026): o bloqueio de
    // cancelamento aplicado em 23/10/2026 foi revertido a pedido da usuária.
    const activeJobs = pendingJobs;

    if (activeJobs.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
    }

    // Buscar dados necessários em batch
    const reportIds = activeJobs.map(j => j.apartmentConsumptionReportId).filter(Boolean) as string[];
    const apartmentIds = activeJobs.map(j => j.apartmentId).filter(Boolean) as string[];
    const complexIds = [...new Set(activeJobs.map(j => j.complexId).filter(Boolean))] as string[];

    const [reports, apartments, complexes] = await Promise.all([
      reportIds.length > 0 ? prisma.apartmentConsumptionReport.findMany({
        where: { id: { in: reportIds } },
        include: {
          lastReading: {
            select: { reading: true, readAtDate: true, nextReadingDate: true, readAt: true },
          },
        },
      }) : [],
      apartmentIds.length > 0 ? prisma.apartment.findMany({
        where: { id: { in: apartmentIds } },
        include: { block: { select: { name: true, complexId: true } } },
      }) : [],
      complexIds.length > 0 ? prisma.complex.findMany({
        where: { id: { in: complexIds } },
        select: { id: true, socialName: true },
      }) : [],
    ]);

    const reportMap = new Map(reports.map(r => [r.id, r]));
    const apartmentMap = new Map(apartments.map(a => [a.id, a]));
    const complexMap = new Map(complexes.map(c => [c.id, c]));

    // Dados da conta do condomínio e do relatório anterior alimentam o extrato rico.
    const dealershipReadingIds = [...new Set(reports.map(r => r.dealershipReadingId).filter(Boolean))] as string[];
    const previousRefs = activeJobs.map(job => {
      const ref = previousMonth(job.monthRef, job.yearRef);
      return { apartmentId: job.apartmentId, ...ref };
    }).filter(ref => ref.apartmentId) as Array<{ apartmentId: string; monthRef: string; yearRef: string }>;
    const [dealershipReadings, previousReports] = await Promise.all([
      dealershipReadingIds.length > 0
        ? prisma.dealershipReading.findMany({ where: { id: { in: dealershipReadingIds } } })
        : [],
      previousRefs.length > 0
        ? prisma.apartmentConsumptionReport.findMany({
            where: {
              OR: previousRefs.map(ref => ({ apartmentId: ref.apartmentId, monthRef: ref.monthRef, yearRef: ref.yearRef })),
              AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
            },
            include: { lastReading: { select: { reading: true, readAtDate: true } } },
          })
        : [],
    ]);
    const dealershipMap = new Map(dealershipReadings.map(reading => [reading.id, reading]));
    const previousReportMap = new Map(previousReports.map(report => [reportKey(report.apartmentId, report.monthRef, report.yearRef), report]));

    // Verificar alertas ativos para os apartamentos (GlAlarm)
    let alarmCounts: Record<string, number> = {};
    if (apartmentIds.length > 0) {
      // Buscar medidores dos apartamentos
      const meters = await prisma.meter.findMany({
        where: { apartmentId: { in: apartmentIds }, deletedAt: null },
        select: { id: true, apartmentId: true },
      });
      const meterIds = meters.map(m => m.id);
      if (meterIds.length > 0) {
        const alarms = await prisma.glAlarm.findMany({
          where: {
            meterId: { in: meterIds },
            deletedAt: null,
            // Alertas dos últimos 30 dias
            alarmAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: { meterId: true },
        });
        const meterToApartment = new Map(meters.map(m => [m.id, m.apartmentId]));
        for (const alarm of alarms) {
          if (!alarm.meterId) continue;
          const apId = meterToApartment.get(alarm.meterId);
          if (apId) alarmCounts[apId] = (alarmCounts[apId] || 0) + 1;
        }
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Processar cada job — um de cada vez, com intervalo aleatório entre envios.
    let zohoBlocked = false;
    let didSend = false;
    const runStartedAt = Date.now();
    for (const job of activeJobs) {
      if (zohoBlocked) break;

      // Espera "humana" antes do próximo envio (o primeiro da execução sai direto).
      if (didSend) {
        const gap = nextGapMs();
        if (Date.now() - runStartedAt + gap > RUN_BUDGET_MS) {
          console.log(`[EmailCron] Orçamento de ${RUN_BUDGET_MS}ms atingido — ${activeJobs.length} jobs seguem na fila.`);
          break;
        }
        await sleep(gap);
      }

      try {
        // Pular emails de domínios internos da empresa (sistema/admin)
        if (isBlockedEmailDomain(job.toEmail)) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'skipped', errorMessage: 'Domínio interno bloqueado', sentAt: new Date() },
          });
          skipped++;
          continue;
        }

        // Incrementar tentativas
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 } },
        });
        didSend = true;

        // ── E-mails com template próprio na fila ─────────────────────────────
        // welcome / reset → template transacional; aviso / teste → HTML no payload.
        const jobCategory = (job as any).category as string | undefined;
        const jobPayload = ((job as any).payload || {}) as Record<string, any>;
        let rendered: { subject: string; html: string; text: string } | null = null;
        if (jobCategory === 'welcome' || jobCategory === 'reset') {
          rendered = jobCategory === 'welcome'
            ? buildWelcomeEmail(jobPayload)
            : buildResetPasswordEmail(jobPayload as any);
        } else if (typeof jobPayload.html === 'string' && jobPayload.html) {
          rendered = {
            subject: jobPayload.subject || job.subject,
            html: jobPayload.html,
            text: jobPayload.text || '',
          };
        }

        if (rendered) {
          const templatedResult = await sendEmail({
            to: job.toEmail,
            toName: job.toName || undefined,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            log: { skipLog: true },
          });

          if (templatedResult.success) {
            await prisma.emailJob.update({
              where: { id: job.id },
              // Limpa o payload: senha temporária/HTML não ficam guardados depois do envio.
              data: { status: 'sent', sentAt: new Date(), errorMessage: null, payload: null },
            });
            sent++;
          } else if (isZohoBlocked(templatedResult.error)) {
            zohoBlocked = true;
            await prisma.emailJob.update({ where: { id: job.id }, data: { attempts: { decrement: 1 }, errorMessage: 'Zoho bloqueado — reprocessar' } });
            console.warn('[EmailCron] Zoho bloqueou o envio; interrompendo o lote. Tentar novamente mais tarde.');
            break;
          } else {
            const newAttempts = job.attempts + 1;
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending', errorMessage: templatedResult.error },
            });
            failed++;
          }
          continue;
        }

        if (isManagementInsightJob(job.subject)) {
          if (!job.complexId) {
            await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: 'Insight sem condomínio associado' } });
            failed++;
            continue;
          }

          const insight = await buildManagementInsightEmail(job.complexId, job.monthRef, job.yearRef, job.toName);
          const insightResult = await sendEmail({
            to: job.toEmail,
            toName: job.toName || undefined,
            subject: cleanManagementInsightSubject(job.subject),
            html: insight.html,
            text: insight.text,
            log: { skipLog: true }, // o próprio job registra o envio
          });
          if (insightResult.success) {
            await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'sent', sentAt: new Date() } });
            sent++;
          } else if (isZohoBlocked(insightResult.error)) {
            zohoBlocked = true;
            await prisma.emailJob.update({ where: { id: job.id }, data: { attempts: { decrement: 1 }, errorMessage: 'Zoho bloqueado — reprocessar' } });
            console.warn('[EmailCron] Zoho bloqueou o envio; interrompendo o lote. Tentar novamente mais tarde.');
            break;
          } else {
            const newAttempts = job.attempts + 1;
            await prisma.emailJob.update({ where: { id: job.id }, data: { status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending', errorMessage: insightResult.error } });
            failed++;
          }
          continue;
        }

        const report = job.apartmentConsumptionReportId ? reportMap.get(job.apartmentConsumptionReportId) : null;
        const apartment = job.apartmentId ? apartmentMap.get(job.apartmentId) : null;
        const complex = job.complexId ? complexMap.get(job.complexId) : null;

        if (!report || !apartment || !complex) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'failed', errorMessage: 'Dados do relatório/apartamento não encontrados' },
          });
          failed++;
          continue;
        }

        const blockName = apartment.block?.name || '';
        const alertCount = alarmCounts[job.apartmentId || ''] || 0;
        const dealership = report.dealershipReadingId ? dealershipMap.get(report.dealershipReadingId) : null;
        const previousRef = previousMonth(job.monthRef, job.yearRef);
        const previousReport = job.apartmentId
          ? previousReportMap.get(reportKey(job.apartmentId, previousRef.monthRef, previousRef.yearRef))
          : null;

        // Período: prioriza as leituras reais e usa o total de dias da conta como fallback.
        const readingDate = report.lastReading?.readAtDate || dealership?.readingDate || null;
        const periodEnd = readingDate ? String(readingDate).split(/[ T]/)[0] : undefined;
        const periodStart = previousReport?.lastReading?.readAtDate
          ? String(previousReport.lastReading.readAtDate).split(/[ T]/)[0]
          : derivePeriodStart(periodEnd, dealership?.totalDays);
        const nextReadingDate = report.lastReading?.nextReadingDate || dealership?.readingDateNext || undefined;

        // Buscar análise de consumo histórico (comparação da unidade consigo mesma)
        let analysis = undefined;
        try {
          const currentConsumption = report.totalConsumption ?? report.consumption;
          analysis = await getConsumptionAnalysis(
            job.apartmentId || apartment.id,
            report.id,
            currentConsumption,
          );
        } catch (e) {
          console.warn(`[EmailCron] Erro ao buscar análise para apt ${apartment.id}:`, e);
        }

        const { subject, html, text } = generateFilipetaEmail({
          residentName: job.toName || 'Morador',
          apartmentName: apartment.name || '',
          blockName,
          complexName: complex.socialName || '',
          monthRef: job.monthRef,
          yearRef: job.yearRef,
          consumption: report.consumption,
          totalConsumption: report.totalConsumption ?? undefined,
          initialReading: previousReport?.lastReading?.reading ?? null,
          finalReading: report.lastReading?.reading ?? null,
          consumptionCost: report.consumptionCost,
          sewageCost: report.sewageCost,
          totalUnit: report.totalUnit,
          rateioValue: report.partial ?? null,
          kiteCarConsumption: report.kiteCarConsumption ?? undefined,
          kiteCarCost: report.kiteCarCost ?? undefined,
          utilityType: report.utilityType || undefined,
          readingDate: readingDate ? String(readingDate) : undefined,
          nextReadingDate,
          periodStart,
          periodEnd,
          condominiumConsumption: dealership?.dealershipConsumption ?? null,
          condominiumBillValue: dealership?.totalValue ?? null,
          consumptionPerEconomy: dealership?.average ?? null,
          hasAlerts: alertCount > 0,
          alertMessage: alertCount > 0
            ? `Sua unidade possui ${alertCount} alerta(s) recente(s) do sistema de monitoramento. Acesse o sistema para visualizar os detalhes.`
            : undefined,
          analysis,
        });

        const result = await sendEmail({
          to: job.toEmail,
          toName: job.toName || undefined,
          subject,
          html,
          text,
          log: { skipLog: true }, // o próprio job registra o envio
        });

        if (result.success) {
          await prisma.emailJob.update({
            where: { id: job.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sent++;
        } else if (isZohoBlocked(result.error)) {
          zohoBlocked = true;
          // Bloqueio antispam do Zoho: não conta como tentativa, volta pra fila
          await prisma.emailJob.update({ where: { id: job.id }, data: { attempts: { decrement: 1 }, errorMessage: 'Zoho bloqueado — reprocessar' } });
          console.warn('[EmailCron] Zoho bloqueou o envio; interrompendo o lote. Tentar novamente mais tarde.');
          break;
        } else {
          // Se excedeu tentativas, marcar como failed permanente
          const newAttempts = job.attempts + 1;
          await prisma.emailJob.update({
            where: { id: job.id },
            data: {
              status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              errorMessage: result.error,
            },
          });
          failed++;
        }
      } catch (err: any) {
        console.error(`[EmailCron] Erro no job ${job.id}:`, err?.message);
        const newAttempts = job.attempts + 1;
        await prisma.emailJob.update({
          where: { id: job.id },
          data: {
            status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            errorMessage: err?.message || 'Erro inesperado',
          },
        });
        failed++;
      }
    }

    console.log(`[EmailCron] Na fila: ${activeJobs.length}, enviados: ${sent}, falhas: ${failed}, pulados: ${skipped}, bloqueioZoho: ${zohoBlocked}`);
    return NextResponse.json({ processed: activeJobs.length, sent, failed, skipped, zohoBlocked });
  } catch (error: any) {
    console.error('[EmailCron] Erro fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
