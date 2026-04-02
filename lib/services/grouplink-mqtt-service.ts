import { readFile } from 'node:fs/promises';
import mqtt, { IClientOptions } from 'mqtt';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { formatReadingDate } from '@/lib/utils';

interface GroupLinkChannelMessage {
  channel?: number;
  unit?: string;
  raw_offset?: number;
  device_offset?: number;
  device_pulse_factor?: number;
  current_reading_raw?: number;
  last_reading?: number;
  name?: string;
  read_at?: number;
  remote_id?: string;
  alerts?: string[];
}

interface GroupLinkRootMessage {
  channels?: GroupLinkChannelMessage[];
  device_id?: number | string;
  last_seen?: number;
  mqtt_extra?: {
    serverTime?: number;
  };
}

interface CollectedMqttMessage {
  topic: string;
  payload: string;
}

interface NormalizedCandidateReading {
  deviceId: string;
  remoteId: string;
  deviceName?: string;
  reading: number;
  readAt: Date;
  readAtDate: string;
  rawOffset?: string;
  deviceOffset?: string;
  devicePulseFactor?: string;
  lastSeen?: number;
  lastSeenDate?: string;
  serverTime?: number;
  topic: string;
  alerts?: string;
}

export interface GroupLinkSyncOptions {
  initiatedByUserId?: string;
  maxCollectionMs?: number;
  idleTimeoutMs?: number;
  maxMessages?: number;
  dryRun?: boolean;
}

export interface GroupLinkSyncResult {
  connected: boolean;
  topic: string;
  messagesCollected: number;
  candidatesParsed: number;
  devicesUpserted: number;
  readingsPrepared: number;
  readingsInserted: number;
  readingsSkippedAsDuplicate: number;
  parseErrors: number;
  startedAt: string;
  finishedAt: string;
}

const DEFAULT_MAX_COLLECTION_MS = 45_000;
const DEFAULT_IDLE_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_MESSAGES = 5_000;
const DEDUPE_DECIMALS = 6;

function normalizeTimestampMs(rawTimestamp: number): number {
  // Algumas integrações podem enviar segundos ao invés de milissegundos.
  return rawTimestamp < 100_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
}

function toRoundedNumber(value: number): number {
  return Number(value.toFixed(DEDUPE_DECIMALS));
}

function readingKey(deviceId: string, readAt: Date, reading: number): string {
  return `${deviceId}|${readAt.getTime()}|${toRoundedNumber(reading)}`;
}

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value.trim();
}

function getNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseGroupLinkPayload(rawPayload: string): GroupLinkRootMessage | null {
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as GroupLinkRootMessage;
  } catch {
    return null;
  }
}

function normalizeCandidatesFromMessage(message: CollectedMqttMessage): NormalizedCandidateReading[] {
  const root = parseGroupLinkPayload(message.payload);
  if (!root?.channels?.length) return [];

  const baseDeviceId = root.device_id !== undefined && root.device_id !== null
    ? String(root.device_id)
    : '';
  const candidates: NormalizedCandidateReading[] = [];

  for (const channel of root.channels) {
    const readingValue = Number.isFinite(channel.last_reading)
      ? Number(channel.last_reading)
      : Number.isFinite(channel.current_reading_raw)
        ? Number(channel.current_reading_raw)
        : NaN;

    if (!Number.isFinite(readingValue)) continue;

    const readAtTs = Number.isFinite(channel.read_at)
      ? Number(channel.read_at)
      : Number.isFinite(root.last_seen)
        ? Number(root.last_seen)
        : Number.isFinite(root.mqtt_extra?.serverTime)
          ? Number(root.mqtt_extra?.serverTime)
          : NaN;

    if (!Number.isFinite(readAtTs)) continue;

    const readAt = new Date(normalizeTimestampMs(readAtTs));
    if (Number.isNaN(readAt.getTime())) continue;

    const deviceId = baseDeviceId || String(channel.remote_id || '').trim();
    if (!deviceId) continue;

    const remoteId = String(channel.remote_id || deviceId).trim();
    const lastSeenDate = Number.isFinite(root.last_seen)
      ? formatReadingDate(new Date(normalizeTimestampMs(Number(root.last_seen))))
      : undefined;
    const alerts = Array.isArray(channel.alerts) && channel.alerts.length > 0
      ? JSON.stringify(channel.alerts)
      : undefined;

    candidates.push({
      deviceId,
      remoteId,
      deviceName: typeof channel.name === 'string' ? channel.name : undefined,
      reading: readingValue,
      readAt,
      readAtDate: formatReadingDate(readAt),
      rawOffset: Number.isFinite(channel.raw_offset) ? String(channel.raw_offset) : undefined,
      deviceOffset: Number.isFinite(channel.device_offset) ? String(channel.device_offset) : undefined,
      devicePulseFactor: Number.isFinite(channel.device_pulse_factor) ? String(channel.device_pulse_factor) : undefined,
      lastSeen: Number.isFinite(root.last_seen) ? Number(root.last_seen) : undefined,
      lastSeenDate,
      serverTime: Number.isFinite(root.mqtt_extra?.serverTime) ? Number(root.mqtt_extra?.serverTime) : undefined,
      topic: message.topic,
      alerts,
    });
  }

  return candidates;
}

async function collectMqttMessages(params: {
  topic: string;
  maxCollectionMs: number;
  idleTimeoutMs: number;
  maxMessages: number;
}): Promise<{ connected: boolean; messages: CollectedMqttMessage[] }> {
  const host = process.env.GROUPLINK_MQTT_HOST?.trim() || 'mqtt.grouplinknetwork.com';
  const port = getNumericEnv('GROUPLINK_MQTT_PORT', 8883);
  const clientId = getEnvOrThrow('GROUPLINK_MQTT_CLIENT_ID');
  const caPath = getEnvOrThrow('GROUPLINK_MQTT_CA_PATH');
  const certPath = getEnvOrThrow('GROUPLINK_MQTT_CERT_PATH');
  const keyPath = getEnvOrThrow('GROUPLINK_MQTT_KEY_PATH');

  const [ca, cert, key] = await Promise.all([
    readFile(caPath),
    readFile(certPath),
    readFile(keyPath),
  ]);

  const connectTimeout = getNumericEnv('GROUPLINK_MQTT_CONNECT_TIMEOUT_MS', 12_000);

  const options: IClientOptions = {
    protocol: 'mqtts',
    host,
    port,
    ca: [ca],
    cert,
    key,
    rejectUnauthorized: true,
    clean: false,
    reconnectPeriod: 0,
    connectTimeout,
    clientId,
    keepalive: 60,
  };

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(options);
    const messages: CollectedMqttMessage[] = [];
    let connected = false;
    let settled = false;
    let lastMessageAt = Date.now();
    let hardTimeout: ReturnType<typeof setTimeout> | undefined;
    let idleCheck: ReturnType<typeof setInterval> | undefined;

    const clearTimers = () => {
      if (hardTimeout) clearTimeout(hardTimeout);
      if (idleCheck) clearInterval(idleCheck);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      try {
        client.end(true);
      } catch {
        // no-op
      }

      if (error) {
        reject(error);
        return;
      }
      resolve({ connected, messages });
    };

    hardTimeout = setTimeout(() => finish(), params.maxCollectionMs);
    idleCheck = setInterval(() => {
      const shouldStopByIdle = messages.length > 0 && Date.now() - lastMessageAt >= params.idleTimeoutMs;
      const shouldStopByCount = messages.length >= params.maxMessages;
      if (shouldStopByIdle || shouldStopByCount) finish();
    }, 500);

    client.on('connect', () => {
      connected = true;
      client.subscribe(params.topic, { qos: 1 }, (error) => {
        if (error) finish(error);
      });
    });

    client.on('message', (topic, payload) => {
      lastMessageAt = Date.now();
      messages.push({
        topic,
        payload: payload.toString('utf-8'),
      });
      if (messages.length >= params.maxMessages) finish();
    });

    client.on('error', (error) => finish(error instanceof Error ? error : new Error('Erro MQTT desconhecido')));
    client.on('close', () => finish());
  });
}

export class GroupLinkMqttService {
  static async syncOnce(options: GroupLinkSyncOptions = {}): Promise<GroupLinkSyncResult> {
    const startedAt = new Date();
    const topic = getEnvOrThrow('GROUPLINK_MQTT_TOPIC');
    const maxCollectionMs = options.maxCollectionMs ?? getNumericEnv('GROUPLINK_MQTT_MAX_COLLECTION_MS', DEFAULT_MAX_COLLECTION_MS);
    const idleTimeoutMs = options.idleTimeoutMs ?? getNumericEnv('GROUPLINK_MQTT_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS);
    const maxMessages = options.maxMessages ?? getNumericEnv('GROUPLINK_MQTT_MAX_MESSAGES', DEFAULT_MAX_MESSAGES);
    const dryRun = !!options.dryRun;

    const collected = await collectMqttMessages({
      topic,
      maxCollectionMs,
      idleTimeoutMs,
      maxMessages,
    });

    let parseErrors = 0;
    const allCandidates: NormalizedCandidateReading[] = [];
    for (const message of collected.messages) {
      const parsed = normalizeCandidatesFromMessage(message);
      if (parsed.length === 0) parseErrors += 1;
      allCandidates.push(...parsed);
    }

    const dedupedByKey = new Map<string, NormalizedCandidateReading>();
    for (const candidate of allCandidates) {
      const key = readingKey(candidate.deviceId, candidate.readAt, candidate.reading);
      dedupedByKey.set(key, candidate);
    }
    const candidates = Array.from(dedupedByKey.values());

    if (candidates.length === 0 || dryRun) {
      return {
        connected: collected.connected,
        topic,
        messagesCollected: collected.messages.length,
        candidatesParsed: candidates.length,
        devicesUpserted: 0,
        readingsPrepared: 0,
        readingsInserted: 0,
        readingsSkippedAsDuplicate: 0,
        parseErrors,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      };
    }

    const deviceMap = new Map<string, {
      remoteId: string;
      name?: string;
      lastReading: number;
      readAtDate: string;
      readAtTs: number;
      lastSeen?: number;
      lastSeenDate?: string;
      devicePulseFactor?: string;
    }>();
    for (const candidate of candidates) {
      const current = deviceMap.get(candidate.deviceId);
      if (!current || candidate.readAt.getTime() >= current.readAtTs) {
        deviceMap.set(candidate.deviceId, {
          remoteId: candidate.remoteId,
          name: candidate.deviceName,
          lastReading: candidate.reading,
          readAtDate: candidate.readAtDate,
          readAtTs: candidate.readAt.getTime(),
          lastSeen: candidate.lastSeen,
          lastSeenDate: candidate.lastSeenDate,
          devicePulseFactor: candidate.devicePulseFactor,
        });
      }
    }

    for (const [deviceId, meta] of deviceMap.entries()) {
      await prisma.iotDevice.upsert({
        where: { deviceId },
        update: {
          remoteId: meta.remoteId,
          name: meta.name,
          lastReading: meta.lastReading,
          readAtDate: meta.readAtDate,
          lastSeen: meta.lastSeen,
          lastSeenDate: meta.lastSeenDate,
          devicePulseFactor: meta.devicePulseFactor ? Number(meta.devicePulseFactor) : undefined,
          updatedByUserId: options.initiatedByUserId,
        },
        create: {
          deviceId,
          remoteId: meta.remoteId,
          name: meta.name,
          lastReading: meta.lastReading,
          readAtDate: meta.readAtDate,
          lastSeen: meta.lastSeen,
          lastSeenDate: meta.lastSeenDate,
          devicePulseFactor: meta.devicePulseFactor ? Number(meta.devicePulseFactor) : undefined,
          createdByUserId: options.initiatedByUserId,
          updatedByUserId: options.initiatedByUserId,
        },
      });
    }

    const deviceIds = Array.from(new Set(candidates.map((c) => c.deviceId)));
    const readAtValues = candidates.map((c) => c.readAt.getTime());
    const minReadAt = new Date(Math.min(...readAtValues));
    const maxReadAt = new Date(Math.max(...readAtValues));

    const links = await prisma.meterDeviceLink.findMany({
      where: {
        deletedAt: null,
        deviceId: { in: deviceIds },
        startDate: { lte: maxReadAt },
        OR: [
          { endDate: null },
          { endDate: { gte: minReadAt } },
        ],
      },
      select: {
        deviceId: true,
        meterId: true,
        startDate: true,
        endDate: true,
        meter: {
          select: {
            apartmentId: true,
            blockId: true,
            complexId: true,
            companyId: true,
          },
        },
      },
    });

    const linksByDevice = new Map<string, typeof links>();
    for (const link of links) {
      const items = linksByDevice.get(link.deviceId) || [];
      items.push(link);
      linksByDevice.set(link.deviceId, items);
    }

    for (const [deviceId, itemLinks] of linksByDevice.entries()) {
      itemLinks.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
      linksByDevice.set(deviceId, itemLinks);
    }

    const existingReadings = await prisma.reading.findMany({
      where: {
        deletedAt: null,
        deviceId: { in: deviceIds },
        readAt: {
          gte: minReadAt,
          lte: maxReadAt,
        },
      },
      select: {
        deviceId: true,
        readAt: true,
        reading: true,
      },
    });

    const existingKeys = new Set(
      existingReadings
        .filter((item) => item.deviceId && Number.isFinite(item.reading))
        .map((item) => readingKey(item.deviceId || '', item.readAt, Number(item.reading))),
    );

    const readingsToInsert: Prisma.ReadingCreateManyInput[] = [];
    let skippedAsDuplicate = 0;

    for (const candidate of candidates) {
      const key = readingKey(candidate.deviceId, candidate.readAt, candidate.reading);
      if (existingKeys.has(key)) {
        skippedAsDuplicate += 1;
        continue;
      }

      const deviceLinks = linksByDevice.get(candidate.deviceId) || [];
      const matchedLink = deviceLinks.find(
        (link) =>
          candidate.readAt >= link.startDate &&
          (!link.endDate || candidate.readAt <= link.endDate),
      );

      readingsToInsert.push({
        reading: candidate.reading,
        readAt: candidate.readAt,
        readAtDate: candidate.readAtDate,
        deviceId: candidate.deviceId,
        remoteId: candidate.remoteId,
        deviceName: candidate.deviceName,
        isManualReading: false,
        isPreReading: false,
        registerName: candidate.remoteId,
        rawOffset: candidate.rawOffset,
        deviceOffset: candidate.deviceOffset,
        devicePulseFactor: candidate.devicePulseFactor,
        lastSeen: candidate.lastSeen,
        lastSeenDate: candidate.lastSeenDate,
        serverTime: candidate.serverTime,
        topic: candidate.topic,
        alerts: candidate.alerts,
        meterId: matchedLink?.meterId,
        apartmentId: matchedLink?.meter.apartmentId,
        blockId: matchedLink?.meter.blockId,
        complexId: matchedLink?.meter.complexId,
        companyId: matchedLink?.meter.companyId,
        createdByUserId: options.initiatedByUserId,
        updatedByUserId: options.initiatedByUserId,
      });
    }

    if (readingsToInsert.length > 0) {
      await prisma.reading.createMany({ data: readingsToInsert });
    }

    return {
      connected: collected.connected,
      topic,
      messagesCollected: collected.messages.length,
      candidatesParsed: candidates.length,
      devicesUpserted: deviceMap.size,
      readingsPrepared: readingsToInsert.length,
      readingsInserted: readingsToInsert.length,
      readingsSkippedAsDuplicate: skippedAsDuplicate,
      parseErrors,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }
}
