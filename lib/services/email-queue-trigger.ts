import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { enqueueManagementInsightJobs } from '@/lib/services/management-insights-email';

/**
 * Agenda uma execução imediata do processador de e-mails depois que a resposta
 * do salvamento foi enviada. O cron continua sendo o mecanismo de recuperação,
 * mas o usuário não precisa esperar até a próxima janela de 10 minutos.
 */
export function scheduleEmailQueueProcessing(req: NextRequest, reason: string, dealershipReadingIds: string[] = []) {
  after(async () => {
    try {
      for (const dealershipReadingId of dealershipReadingIds) {
        try {
          const insightResult = await enqueueManagementInsightJobs(dealershipReadingId);
          console.log(`[EmailQueueTrigger] ${reason} insights ${dealershipReadingId}:`, insightResult);
        } catch (insightError: any) {
          console.error(`[EmailQueueTrigger] ${reason} insights ${dealershipReadingId}:`, insightError?.message || insightError);
        }
      }

      const url = new URL('/api/cron/send-pending-emails', req.url);
      const headers: HeadersInit = { 'cache-control': 'no-cache' };
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) headers.authorization = `Bearer ${cronSecret}`;

      const response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      const body = await response.text();
      console.log(`[EmailQueueTrigger] ${reason}: status=${response.status} body=${body.slice(0, 500)}`);
    } catch (error: any) {
      // O cron periódico fará a recuperação; falha no kick nunca deve desfazer
      // o salvamento do relatório.
      console.error(`[EmailQueueTrigger] ${reason}:`, error?.message || error);
    }
  });
}
