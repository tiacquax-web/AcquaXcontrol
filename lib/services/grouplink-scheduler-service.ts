import prisma from '@/lib/prisma';
import { GroupLinkMqttService } from '@/lib/services/grouplink-mqtt-service';
import { userCanAccessComplex } from '@/lib/userAccess';

export interface GroupLinkComplexScheduleConfig {
  complexId: string;
  enabled: boolean;
  scheduleTime?: string | null;
  timezone?: string | null;
  topic?: string | null;
}

export interface GroupLinkComplexScheduleResult {
  complexId: string;
  socialName: string;
  enabled: boolean;
  scheduleTime: string | null;
  timezone: string | null;
  topic: string | null;
  lastSyncAt: string | null;
}

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseHHMM(value: string) {
  const match = value.match(HHMM_REGEX);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function ensureValidScheduleInput(input: GroupLinkComplexScheduleConfig) {
  if (input.enabled) {
    if (!input.scheduleTime || !parseHHMM(input.scheduleTime)) {
      throw new Error('Horário inválido. Use o formato HH:mm (24h).');
    }
  }

  if (input.scheduleTime && !parseHHMM(input.scheduleTime)) {
    throw new Error('Horário inválido. Use o formato HH:mm (24h).');
  }
}

function buildTodayAtLocalTimezone(scheduleTime: string, timezone: string): Date {
  const parsed = parseHHMM(scheduleTime);
  if (!parsed) {
    throw new Error('Horário inválido para agendamento.');
  }

  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(dateParts.find((p) => p.type === 'year')?.value);
  const month = Number(dateParts.find((p) => p.type === 'month')?.value);
  const day = Number(dateParts.find((p) => p.type === 'day')?.value);

  if (!year || !month || !day) {
    throw new Error('Não foi possível resolver a data para o timezone informado.');
  }

  // Cria "agora" no timezone alvo para descobrir o offset (incluindo DST).
  const tzNowString = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now).replace(' ', 'T');
  const tzNowAsUTC = new Date(`${tzNowString}Z`);
  const offsetMs = tzNowAsUTC.getTime() - now.getTime();

  const utcTarget = Date.UTC(year, month - 1, day, parsed.hour, parsed.minute, 0, 0) - offsetMs;
  return new Date(utcTarget);
}

function wasSyncedToday(lastSyncAt: Date | null | undefined, timezone: string): boolean {
  if (!lastSyncAt) return false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const lastDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(lastSyncAt);
  return today === lastDay;
}

export class GroupLinkSchedulerService {
  static async getComplexSchedule(userId: string, complexId: string): Promise<GroupLinkComplexScheduleResult> {
    const canAccess = await userCanAccessComplex(userId, complexId);
    if (!canAccess) {
      throw new Error('Não autorizado para este condomínio.');
    }

    const complex = await prisma.complex.findFirst({
      where: { id: complexId, deletedAt: null },
      select: {
        id: true,
        socialName: true,
        groupLinkEnabled: true,
        groupLinkScheduleTime: true,
        groupLinkTimezone: true,
        groupLinkTopic: true,
        groupLinkLastSyncAt: true,
      },
    });

    if (!complex) {
      throw new Error('Condomínio não encontrado.');
    }

    return {
      complexId: complex.id,
      socialName: complex.socialName,
      enabled: !!complex.groupLinkEnabled,
      scheduleTime: complex.groupLinkScheduleTime || null,
      timezone: complex.groupLinkTimezone || null,
      topic: complex.groupLinkTopic || null,
      lastSyncAt: complex.groupLinkLastSyncAt ? complex.groupLinkLastSyncAt.toISOString() : null,
    };
  }

  static async updateComplexSchedule(userId: string, input: GroupLinkComplexScheduleConfig): Promise<GroupLinkComplexScheduleResult> {
    const canAccess = await userCanAccessComplex(userId, input.complexId);
    if (!canAccess) {
      throw new Error('Não autorizado para este condomínio.');
    }

    ensureValidScheduleInput(input);

    const timezone = (input.timezone || 'America/Sao_Paulo').trim();
    const topic = input.topic?.trim() || null;

    const updated = await prisma.complex.update({
      where: { id: input.complexId },
      data: {
        groupLinkEnabled: !!input.enabled,
        groupLinkScheduleTime: input.enabled ? (input.scheduleTime || null) : null,
        groupLinkTimezone: timezone,
        groupLinkTopic: input.enabled ? topic : null,
        updatedByUserId: userId,
      },
      select: {
        id: true,
        socialName: true,
        groupLinkEnabled: true,
        groupLinkScheduleTime: true,
        groupLinkTimezone: true,
        groupLinkTopic: true,
        groupLinkLastSyncAt: true,
      },
    });

    return {
      complexId: updated.id,
      socialName: updated.socialName,
      enabled: !!updated.groupLinkEnabled,
      scheduleTime: updated.groupLinkScheduleTime || null,
      timezone: updated.groupLinkTimezone || null,
      topic: updated.groupLinkTopic || null,
      lastSyncAt: updated.groupLinkLastSyncAt ? updated.groupLinkLastSyncAt.toISOString() : null,
    };
  }

  static async runDueSchedules(secret?: string) {
    const expectedSecret = process.env.GROUPLINK_SYNC_SECRET?.trim();
    if (!expectedSecret || !secret || secret !== expectedSecret) {
      throw new Error('Segredo inválido para execução de agendamentos.');
    }

    const complexes = await prisma.complex.findMany({
      where: {
        deletedAt: null,
        groupLinkEnabled: true,
        groupLinkScheduleTime: { not: null },
      },
      select: {
        id: true,
        socialName: true,
        groupLinkScheduleTime: true,
        groupLinkTimezone: true,
        groupLinkTopic: true,
        groupLinkLastSyncAt: true,
      },
    });

    const now = new Date();
    const results: Array<{ complexId: string; socialName: string; status: 'executed' | 'skipped' | 'failed'; message: string }> = [];

    for (const complex of complexes) {
      const timezone = (complex.groupLinkTimezone || 'America/Sao_Paulo').trim();
      const scheduleTime = complex.groupLinkScheduleTime || '';

      try {
        if (!parseHHMM(scheduleTime)) {
          results.push({
            complexId: complex.id,
            socialName: complex.socialName,
            status: 'failed',
            message: 'Horário inválido no condomínio.',
          });
          continue;
        }

        const dueAt = buildTodayAtLocalTimezone(scheduleTime, timezone);
        const alreadySynced = wasSyncedToday(complex.groupLinkLastSyncAt, timezone);
        const isDue = now.getTime() >= dueAt.getTime();

        if (!isDue) {
          results.push({
            complexId: complex.id,
            socialName: complex.socialName,
            status: 'skipped',
            message: `Ainda não chegou no horário (${scheduleTime} ${timezone}).`,
          });
          continue;
        }

        if (alreadySynced) {
          results.push({
            complexId: complex.id,
            socialName: complex.socialName,
            status: 'skipped',
            message: 'Sincronização do dia já executada.',
          });
          continue;
        }

        const syncResult = await GroupLinkMqttService.syncOnce({
          initiatedByUserId: undefined,
          topicOverride: complex.groupLinkTopic || undefined,
          sourceLabel: `complex:${complex.id}`,
        });

        await prisma.complex.update({
          where: { id: complex.id },
          data: { groupLinkLastSyncAt: new Date() },
        });

        results.push({
          complexId: complex.id,
          socialName: complex.socialName,
          status: 'executed',
          message: `OK: ${syncResult.readingsInserted} leituras inseridas.`,
        });
      } catch (error) {
        results.push({
          complexId: complex.id,
          socialName: complex.socialName,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      processed: complexes.length,
      executed: results.filter((r) => r.status === 'executed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }
}
