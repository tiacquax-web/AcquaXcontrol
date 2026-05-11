import { Readable } from 'stream';
import readline from 'readline';
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getS3CredentialsFromOrganizationVault } from '@/lib/services/organization-vault-service';

const GROUPLINK_SOURCE = 'grouplink_batch';

type StorageIntegrationLite = {
  id: string;
  companyId: string;
  bucket: string;
  region: string;
  path: string | null;
  vaultId: string;
};

type ResolvedMeter = {
  id: string;
  register: string;
  apartmentId: string | null;
  blockId: string | null;
  complexId: string | null;
  companyId: string | null;
};

type RowProcessingOutcome =
  | { kind: 'inserted'; readingId: string; meterId: string; timestamp: Date; alarmCode?: string }
  | { kind: 'duplicate'; readingId: string; meterId: string; timestamp: Date; alarmCode?: string };

type ProcessingErrorRow = {
  lineNumber: number;
  errorType: string;
  errorMessage: string;
  rawLine: string;
};

export interface GrouplinkIngestionRunOptions {
  companyId?: string;
  storageIntegrationId?: string;
  limitFiles?: number;
  forceReprocess?: boolean;
  objectKey?: string;
  pilotModeOnly?: boolean;
  pilotComplexId?: string;
  lineNumbers?: number[];
  correlationId?: string;
  trigger: 'manual' | 'cron';
}

export interface GrouplinkIngestionRunResult {
  correlationId: string;
  trigger: 'manual' | 'cron';
  startedAt: string;
  finishedAt: string;
  totalIntegrations: number;
  processedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  insertedReadings: number;
  duplicateReadings: number;
  createdAnomalies: number;
  duplicateAnomalies: number;
  rowErrors: number;
  totalRows: number;
  integrationSummaries: Array<{
    storageIntegrationId: string;
    companyId: string;
    processedFiles: number;
    skippedFiles: number;
    failedFiles: number;
    insertedReadings: number;
    duplicateReadings: number;
    createdAnomalies: number;
    duplicateAnomalies: number;
    rowErrors: number;
    totalRows: number;
  }>;
}

function trimAndNormalize(value: string | undefined | null): string {
  return (value || '').trim();
}

function normalizeHeader(value: string): string {
  return trimAndNormalize(value).toLowerCase().replace(/\ufeff/g, '');
}

function normalizePathPrefix(path?: string | null): string {
  if (!path) return '';
  return path.replace(/^\/+|\/+$/g, '');
}

function joinPath(...parts: Array<string | undefined | null>): string {
  const sanitized = parts
    .map((part) => trimAndNormalize(part || ''))
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  return sanitized.join('/');
}

function selectDelimiter(headerLine: string): string {
  const delimiters = [',', ';', '\t'];
  let selected = ',';
  let bestCount = -1;
  for (const delimiter of delimiters) {
    const count = headerLine.split(delimiter).length;
    if (count > bestCount) {
      bestCount = count;
      selected = delimiter;
    }
  }
  return selected;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = i + 1 < line.length ? line[i + 1] : '';

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((field) => field.trim());
}

function parseReadingValue(valueRaw: string): number {
  const normalized = valueRaw.replace(',', '.').trim();
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`reading inválido: "${valueRaw}"`);
  }
  return value;
}

function parseTimestamp(readingDateRaw: string, readingTimeRaw?: string): Date {
  const readingDate = trimAndNormalize(readingDateRaw);
  const readingTime = trimAndNormalize(readingTimeRaw);

  const parseDateLike = (value: string): Date | null => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T12:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [dd, mm, yyyy] = value.split('/');
      const parsed = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value.includes(' ') ? value.replace(' ', 'T') : value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  if (readingDate) {
    if (/\d{2}:\d{2}/.test(readingDate)) {
      const direct = parseDateLike(readingDate);
      if (direct) return direct;
    }

    const baseDate = parseDateLike(readingDate);
    if (!baseDate) throw new Error(`reading_date inválido: "${readingDateRaw}"`);

    if (!readingTime) return baseDate;

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(readingTime)) {
      const [hh, mm, ss = '00'] = readingTime.split(':');
      const combined = new Date(baseDate);
      combined.setHours(Number(hh), Number(mm), Number(ss), 0);
      return combined;
    }

    const combinedRaw = `${readingDate} ${readingTime}`;
    const combinedParsed = parseDateLike(combinedRaw);
    if (!combinedParsed) throw new Error(`reading_time inválido: "${readingTimeRaw}"`);
    return combinedParsed;
  }

  if (readingTime) {
    const parsed = parseDateLike(readingTime);
    if (!parsed) throw new Error(`reading_time inválido: "${readingTimeRaw}"`);
    return parsed;
  }

  throw new Error('Nenhum campo de data informado (reading_date ou reading_time).');
}

function toReadAtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildS3Client(integration: StorageIntegrationLite, credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }) {
  return new S3Client({
    region: integration.region,
    credentials,
  });
}

function toNodeReadable(body: unknown): Readable {
  if (!body) throw new Error('S3 object body is empty.');
  if (body instanceof Readable) return body;
  if (typeof (body as any).transformToWebStream === 'function') {
    const webStream = (body as any).transformToWebStream();
    return Readable.fromWeb(webStream);
  }
  throw new Error('Unsupported S3 object body stream type.');
}

function summarizeRowErrors(errors: string[]): string | undefined {
  if (!errors.length) return undefined;
  const max = 20;
  const preview = errors.slice(0, max).join(' | ');
  const suffix = errors.length > max ? ` | ... +${errors.length - max} erros` : '';
  return `${preview}${suffix}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class GrouplinkCsvIngestionService {
  private directMeterCache = new Map<string, ResolvedMeter | null>();
  private linkedMetersCache = new Map<string, Array<{ deviceId: string; startDate: Date; endDate: Date | null; meter: ResolvedMeter }>>();
  private iotDeviceAliasCache = new Map<string, string | null>();
  private iotDevicePilotCache = new Map<string, boolean>();
  private readingDedupCache = new Map<string, string>();

  async run(options: GrouplinkIngestionRunOptions): Promise<GrouplinkIngestionRunResult> {
    const startedAt = new Date();
    const correlationId = options.correlationId || randomUUID();
    const integrations = await this.getTargetIntegrations(options);
    console.info(
      `[grouplink-ingestion] início correlationId=${correlationId} trigger=${options.trigger} integrations=${integrations.length} force=${options.forceReprocess === true}`,
    );
    const summaries: GrouplinkIngestionRunResult['integrationSummaries'] = [];

    let processedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;
    let insertedReadings = 0;
    let duplicateReadings = 0;
    let createdAnomalies = 0;
    let duplicateAnomalies = 0;
    let rowErrors = 0;
    let totalRows = 0;

    for (const integration of integrations) {
      let summary: GrouplinkIngestionRunResult['integrationSummaries'][number];
      try {
        summary = await this.processIntegration(integration, options, correlationId);
      } catch (error) {
        console.error(
          `[grouplink-ingestion] falha geral correlationId=${correlationId} integração=${integration.id} company=${integration.companyId}:`,
          error,
        );
        summary = {
          storageIntegrationId: integration.id,
          companyId: integration.companyId,
          processedFiles: 0,
          skippedFiles: 0,
          failedFiles: 1,
          insertedReadings: 0,
          duplicateReadings: 0,
          createdAnomalies: 0,
          duplicateAnomalies: 0,
          rowErrors: 0,
          totalRows: 0,
        };
      }

      summaries.push(summary);
      processedFiles += summary.processedFiles;
      skippedFiles += summary.skippedFiles;
      failedFiles += summary.failedFiles;
      insertedReadings += summary.insertedReadings;
      duplicateReadings += summary.duplicateReadings;
      createdAnomalies += summary.createdAnomalies;
      duplicateAnomalies += summary.duplicateAnomalies;
      rowErrors += summary.rowErrors;
      totalRows += summary.totalRows;
    }

    return {
      correlationId,
      trigger: options.trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totalIntegrations: integrations.length,
      processedFiles,
      skippedFiles,
      failedFiles,
      insertedReadings,
      duplicateReadings,
      createdAnomalies,
      duplicateAnomalies,
      rowErrors,
      totalRows,
      integrationSummaries: summaries,
    };
  }

  private async getTargetIntegrations(options: GrouplinkIngestionRunOptions): Promise<StorageIntegrationLite[]> {
    return prisma.storageIntegration.findMany({
      where: {
        provider: 'aws_s3',
        status: 'active',
        deletedAt: null,
        ...(options.companyId ? { companyId: options.companyId } : {}),
        ...(options.storageIntegrationId ? { id: options.storageIntegrationId } : {}),
      },
      select: {
        id: true,
        companyId: true,
        bucket: true,
        region: true,
        path: true,
        vaultId: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async processIntegration(
    integration: StorageIntegrationLite,
    options: GrouplinkIngestionRunOptions,
    correlationId: string,
  ) {
    console.info(
      `[grouplink-ingestion] processando correlationId=${correlationId} integração=${integration.id} company=${integration.companyId} bucket=${integration.bucket}`,
    );
    const credentials = await getS3CredentialsFromOrganizationVault({
      organizationId: integration.companyId,
      vaultId: integration.vaultId,
    });
    const s3 = buildS3Client(integration, credentials);
    const csvObjects = await this.listCsvObjects(s3, integration, options.limitFiles, options.objectKey);
    console.info(
      `[grouplink-ingestion] integração=${integration.id} arquivos_csv_encontrados=${csvObjects.length}`,
    );

    let processedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;
    let insertedReadings = 0;
    let duplicateReadings = 0;
    let createdAnomalies = 0;
    let duplicateAnomalies = 0;
    let rowErrors = 0;
    let totalRows = 0;

    for (const object of csvObjects) {
      const objectKey = object.Key;
      if (!objectKey) continue;

      const shouldSkip = await this.shouldSkipFile({
        storageIntegrationId: integration.id,
        bucket: integration.bucket,
        objectKey,
        checksum: object.ETag || null,
        forceReprocess: options.forceReprocess === true,
      });

      if (shouldSkip) {
        console.info(`[grouplink-ingestion] arquivo ignorado por idempotência: ${objectKey}`);
        skippedFiles += 1;
        continue;
      }

      processedFiles += 1;
      const processingRecord = await this.startFileProcessing({
        companyId: integration.companyId,
        storageIntegrationId: integration.id,
        bucket: integration.bucket,
        objectKey,
        checksum: object.ETag || null,
        trigger: options.trigger,
        correlationId,
      });

      await this.replaceProcessingErrors(processingRecord.id, []);

      try {
        console.info(`[grouplink-ingestion] processando arquivo: ${objectKey}`);
        const result = await this.processFile({
          s3,
          integration,
          objectKey,
          options,
        });

        insertedReadings += result.insertedReadings;
        duplicateReadings += result.duplicateReadings;
        createdAnomalies += result.createdAnomalies;
        duplicateAnomalies += result.duplicateAnomalies;
        rowErrors += result.rowErrors;
        totalRows += result.totalRows;
        await this.replaceProcessingErrors(processingRecord.id, result.errorRows);

        await prisma.storageFileProcessing.update({
          where: { id: processingRecord.id },
          data: {
            status: 'success',
            processedAt: new Date(),
            errorMessage: summarizeRowErrors(result.rowErrorMessages),
            totalRows: result.totalRows,
            insertedReadings: result.insertedReadings,
            duplicateReadings: result.duplicateReadings,
            createdAnomalies: result.createdAnomalies,
            duplicateAnomalies: result.duplicateAnomalies,
            rowErrorsCount: result.rowErrors,
            durationMs: Date.now() - new Date(processingRecord.createdAt).getTime(),
          },
        });
        console.info(
          `[grouplink-ingestion] arquivo concluído correlationId=${correlationId} key=${objectKey} rows=${result.totalRows} inserted=${result.insertedReadings} dup=${result.duplicateReadings} rowErrors=${result.rowErrors}`,
        );
      } catch (error) {
        failedFiles += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.replaceProcessingErrors(processingRecord.id, [
          {
            lineNumber: 0,
            errorType: 'file_error',
            errorMessage: message,
            rawLine: '',
          },
        ]);
        await prisma.storageFileProcessing.update({
          where: { id: processingRecord.id },
          data: {
            status: 'error',
            processedAt: new Date(),
            errorMessage: message.slice(0, 4000),
            durationMs: Date.now() - new Date(processingRecord.createdAt).getTime(),
          },
        });
        console.error(`[grouplink-ingestion] arquivo falhou correlationId=${correlationId} key=${objectKey}:`, error);
      }
    }

    return {
      storageIntegrationId: integration.id,
      companyId: integration.companyId,
      processedFiles,
      skippedFiles,
      failedFiles,
      insertedReadings,
      duplicateReadings,
      createdAnomalies,
      duplicateAnomalies,
      rowErrors,
      totalRows,
    };
  }

  private async listCsvObjects(
    s3: S3Client,
    integration: StorageIntegrationLite,
    limitFiles?: number,
    objectKeyFilter?: string,
  ) {
    const rootPrefix = normalizePathPrefix(integration.path);
    const grouplinkPrefix = normalizePathPrefix(process.env.GROUPLINK_S3_PREFIX || '');
    const listPrefix = joinPath(rootPrefix, grouplinkPrefix) || undefined;

    const objects: Array<{ Key?: string; LastModified?: Date; ETag?: string }> = [];
    let continuationToken: string | undefined = undefined;

    if (objectKeyFilter) {
      return [{ Key: objectKeyFilter, LastModified: new Date(), ETag: undefined }];
    }

    do {
      const response: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: integration.bucket,
          Prefix: listPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents || []) {
        if (!object.Key || !object.Key.toLowerCase().endsWith('.csv')) continue;
        objects.push({ Key: object.Key, LastModified: object.LastModified, ETag: object.ETag });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    objects.sort((a, b) => (a.LastModified?.getTime() || 0) - (b.LastModified?.getTime() || 0));

    return typeof limitFiles === 'number' && limitFiles > 0 ? objects.slice(0, limitFiles) : objects;
  }

  private async shouldSkipFile(params: {
    storageIntegrationId: string;
    bucket: string;
    objectKey: string;
    checksum: string | null;
    forceReprocess: boolean;
  }): Promise<boolean> {
    if (params.forceReprocess) return false;

    const existing = await prisma.storageFileProcessing.findFirst({
      where: {
        storageIntegrationId: params.storageIntegrationId,
        bucket: params.bucket,
        objectKey: params.objectKey,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) return false;
    if (existing.status !== 'success') return false;
    if (!params.checksum) return true;
    return existing.checksum === params.checksum;
  }

  private async startFileProcessing(params: {
    companyId: string;
    storageIntegrationId: string;
    bucket: string;
    objectKey: string;
    checksum: string | null;
    trigger: 'manual' | 'cron';
    correlationId: string;
  }) {
    const existing = await prisma.storageFileProcessing.findFirst({
      where: {
        storageIntegrationId: params.storageIntegrationId,
        bucket: params.bucket,
        objectKey: params.objectKey,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return prisma.storageFileProcessing.update({
        where: { id: existing.id },
        data: {
          status: 'processing',
          checksum: params.checksum || undefined,
          trigger: params.trigger,
          correlationId: params.correlationId,
          totalRows: 0,
          insertedReadings: 0,
          duplicateReadings: 0,
          createdAnomalies: 0,
          duplicateAnomalies: 0,
          rowErrorsCount: 0,
          durationMs: null,
          processedAt: null,
          errorMessage: null,
        },
      });
    }

    return prisma.storageFileProcessing.create({
      data: {
        companyId: params.companyId,
        storageIntegrationId: params.storageIntegrationId,
        bucket: params.bucket,
        objectKey: params.objectKey,
        checksum: params.checksum || undefined,
        trigger: params.trigger,
        correlationId: params.correlationId,
        status: 'processing',
      },
    });
  }

  private async replaceProcessingErrors(processingId: string, rows: ProcessingErrorRow[]) {
    await prisma.storageFileProcessingError.deleteMany({
      where: {
        storageFileProcessingId: processingId,
        deletedAt: null,
      },
    });

    for (const row of rows) {
      await prisma.storageFileProcessingError.create({
        data: {
          storageFileProcessingId: processingId,
          lineNumber: row.lineNumber,
          errorType: row.errorType,
          errorMessage: row.errorMessage.slice(0, 4000),
          rawLine: row.rawLine ? row.rawLine.slice(0, 4000) : null,
        },
      });
    }
  }

  private async processFile(params: {
    s3: S3Client;
    integration: StorageIntegrationLite;
    objectKey: string;
    options: GrouplinkIngestionRunOptions;
  }): Promise<{
    totalRows: number;
    insertedReadings: number;
    duplicateReadings: number;
    createdAnomalies: number;
    duplicateAnomalies: number;
    rowErrors: number;
    rowErrorMessages: string[];
    errorRows: ProcessingErrorRow[];
  }> {
    const response: GetObjectCommandOutput = await params.s3.send(
      new GetObjectCommand({
        Bucket: params.integration.bucket,
        Key: params.objectKey,
      }),
    );

    const stream = toNodeReadable(response.Body);
    const lineReader = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = 0;
    let delimiter = ',';
    let headers: string[] = [];
    let insertedReadings = 0;
    let duplicateReadings = 0;
    let createdAnomalies = 0;
    let duplicateAnomalies = 0;
    let rowErrors = 0;
    let totalRows = 0;
    const rowErrorMessages: string[] = [];
    const errorRows: ProcessingErrorRow[] = [];
    const targetLineNumbers = params.options.lineNumbers?.length ? new Set(params.options.lineNumbers) : null;

    for await (const lineRaw of lineReader) {
      lineNumber += 1;
      const line = lineRaw.replace(/\r$/, '');

      if (!line.trim()) continue;

      if (lineNumber === 1) {
        delimiter = selectDelimiter(line);
        headers = parseCsvLine(line, delimiter).map((header) => normalizeHeader(header));
        continue;
      }

      if (targetLineNumbers && !targetLineNumbers.has(lineNumber)) {
        continue;
      }

      totalRows += 1;

      try {
        const columns = parseCsvLine(line, delimiter);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = columns[index] || '';
        });

        const outcome = await this.processRow({
          companyId: params.integration.companyId,
          row,
          options: params.options,
        });

        if (outcome.kind === 'inserted') insertedReadings += 1;
        else duplicateReadings += 1;

        if (outcome.alarmCode) {
          const anomalyResult = await this.persistAnomaly({
            meterId: outcome.meterId,
            readingId: outcome.readingId,
            companyId: params.integration.companyId,
            occurredAt: outcome.timestamp,
            alarmCode: outcome.alarmCode,
            rawPayload: JSON.stringify(row),
          });

          if (anomalyResult === 'created') createdAnomalies += 1;
          else duplicateAnomalies += 1;
        }
      } catch (error) {
        rowErrors += 1;
        const message = error instanceof Error ? error.message : String(error);
        rowErrorMessages.push(`linha ${lineNumber}: ${message}`);
        errorRows.push({
          lineNumber,
          errorType: 'row_error',
          errorMessage: message,
          rawLine: line.slice(0, 4000),
        });
        console.warn(`[grouplink-ingestion] falha na linha ${lineNumber} (${params.objectKey}): ${message}`);
      }
    }

    return {
      totalRows,
      insertedReadings,
      duplicateReadings,
      createdAnomalies,
      duplicateAnomalies,
      rowErrors,
      rowErrorMessages,
      errorRows,
    };
  }

  private async processRow(params: {
    companyId: string;
    row: Record<string, string>;
    options: GrouplinkIngestionRunOptions;
  }): Promise<RowProcessingOutcome> {
    const deviceId = trimAndNormalize(params.row.device_id);
    if (!deviceId) {
      console.warn('[grouplink-ingestion][linha_invalida]', { reason: 'device_id ausente' });
      throw new Error('device_id ausente');
    }

    const readingRaw = trimAndNormalize(params.row.reading);
    if (!readingRaw) {
      console.warn('[grouplink-ingestion][linha_invalida]', { deviceId, reason: 'reading ausente' });
      throw new Error('reading ausente');
    }
    const readingValue = parseReadingValue(readingRaw);

    const timestamp = parseTimestamp(params.row.reading_date || '', params.row.reading_time || '');
    const alarmCode = trimAndNormalize(params.row.alarm_code) || undefined;
    const meterResolution = await this.resolveMeterForDeviceId(deviceId, timestamp);

    if (!meterResolution) {
      console.warn('[grouplink-ingestion][medidor_nao_encontrado]', { deviceId });
      throw new Error(`Nenhum medidor IoT vinculado ao device_id "${deviceId}" para o timestamp informado.`);
    }

    if (params.options.pilotComplexId && meterResolution.meter.complexId !== params.options.pilotComplexId) {
      console.warn('[grouplink-ingestion][device_fora_piloto]', {
        deviceId,
        meterComplexId: meterResolution.meter.complexId,
        pilotComplexId: params.options.pilotComplexId,
      });
      throw new Error(`device ${deviceId} fora do condomínio piloto selecionado.`);
    }

    if (params.options.pilotModeOnly) {
      const isPilot = await this.isPilotDevice(meterResolution.deviceId);
      if (!isPilot) {
        console.warn('[grouplink-ingestion][device_sem_vinculo_piloto]', { deviceId: meterResolution.deviceId });
        throw new Error(`device sem vínculo de piloto: ${meterResolution.deviceId}`);
      }
    }

    const dedupeKey = `${meterResolution.meter.id}|${timestamp.toISOString()}|${readingValue}|${GROUPLINK_SOURCE}`;
    const cachedReadingId = this.readingDedupCache.get(dedupeKey);
    if (cachedReadingId) {
      console.info('[grouplink-ingestion][duplicidade_leitura_cache]', { deviceId, meterId: meterResolution.meter.id });
      return {
        kind: 'duplicate',
        readingId: cachedReadingId,
        meterId: meterResolution.meter.id,
        timestamp,
        ...(alarmCode ? { alarmCode } : {}),
      };
    }

    const existingReading = await prisma.reading.findFirst({
      where: {
        meterId: meterResolution.meter.id,
        readAt: timestamp,
        reading: readingValue,
        source: GROUPLINK_SOURCE,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingReading) {
      this.readingDedupCache.set(dedupeKey, existingReading.id);
      console.info('[grouplink-ingestion][duplicidade_leitura_db]', { deviceId, meterId: meterResolution.meter.id });
      return {
        kind: 'duplicate',
        readingId: existingReading.id,
        meterId: meterResolution.meter.id,
        timestamp,
        ...(alarmCode ? { alarmCode } : {}),
      };
    }

    const reading = await prisma.reading.create({
      data: {
        meterId: meterResolution.meter.id,
        registerName: meterResolution.meter.register,
        reading: readingValue,
        readAt: timestamp,
        readAtDate: toReadAtDate(timestamp),
        isManualReading: false,
        isPreReading: false,
        source: GROUPLINK_SOURCE,
        deviceId: meterResolution.deviceId,
        remoteId: deviceId,
        apartmentId: meterResolution.meter.apartmentId || undefined,
        blockId: meterResolution.meter.blockId || undefined,
        complexId: meterResolution.meter.complexId || undefined,
        companyId: meterResolution.meter.companyId || params.companyId,
        alerts: alarmCode ? JSON.stringify([alarmCode]) : undefined,
      },
      select: { id: true },
    });

    this.readingDedupCache.set(dedupeKey, reading.id);
    return {
      kind: 'inserted',
      readingId: reading.id,
      meterId: meterResolution.meter.id,
      timestamp,
      ...(alarmCode ? { alarmCode } : {}),
    };
  }

  private async resolveMeterForDeviceId(deviceIdRaw: string, timestamp: Date): Promise<{ meter: ResolvedMeter; deviceId: string } | null> {
    // Regra prioritária obrigatória: vínculo explícito no medidor (deviceIdIoT).
    const explicitMeter = await this.findMeterByExplicitBinding(deviceIdRaw);
    if (explicitMeter) return { meter: explicitMeter, deviceId: deviceIdRaw };

    const linked = await this.findMeterByDeviceLink(deviceIdRaw, timestamp);
    if (linked) return linked;

    const canonicalDeviceId = await this.resolveCanonicalIotDeviceId(deviceIdRaw);
    if (canonicalDeviceId && canonicalDeviceId !== deviceIdRaw) {
      const explicitCanonical = await this.findMeterByExplicitBinding(canonicalDeviceId);
      if (explicitCanonical) return { meter: explicitCanonical, deviceId: canonicalDeviceId };

      const fromCanonical = await this.findMeterByDeviceLink(canonicalDeviceId, timestamp);
      if (fromCanonical) return fromCanonical;

      const directCanonical = await this.findDirectMeter(canonicalDeviceId);
      if (directCanonical) return { meter: directCanonical, deviceId: canonicalDeviceId };
    }

    const directMeter = await this.findDirectMeter(deviceIdRaw);
    if (directMeter) return { meter: directMeter, deviceId: deviceIdRaw };

    return null;
  }

  private async resolveCanonicalIotDeviceId(deviceIdRaw: string): Promise<string | null> {
    if (this.iotDeviceAliasCache.has(deviceIdRaw)) {
      return this.iotDeviceAliasCache.get(deviceIdRaw) || null;
    }

    const iotDevice = await prisma.iotDevice.findFirst({
      where: {
        deletedAt: null,
        OR: [{ deviceId: deviceIdRaw }, { remoteId: deviceIdRaw }],
      },
      select: { deviceId: true },
    });

    const canonical = iotDevice?.deviceId || null;
    this.iotDeviceAliasCache.set(deviceIdRaw, canonical);
    return canonical;
  }

  private async isPilotDevice(deviceId: string): Promise<boolean> {
    if (this.iotDevicePilotCache.has(deviceId)) {
      return this.iotDevicePilotCache.get(deviceId) || false;
    }

    const iotDevice = await prisma.iotDevice.findFirst({
      where: { deviceId, deletedAt: null },
      select: { pilotMode: true },
    });
    const pilot = iotDevice?.pilotMode === true;
    this.iotDevicePilotCache.set(deviceId, pilot);
    return pilot;
  }

  private async findMeterByExplicitBinding(deviceId: string): Promise<ResolvedMeter | null> {
    const meter = await prisma.meter.findFirst({
      where: {
        deviceIdIoT: deviceId,
        deletedAt: null,
      },
      select: {
        id: true,
        register: true,
        apartmentId: true,
        blockId: true,
        complexId: true,
        companyId: true,
        apartment: {
          select: {
            companyId: true,
            blockId: true,
            complexId: true,
            block: {
              select: {
                companyId: true,
                complexId: true,
                complex: { select: { companyId: true } },
              },
            },
          },
        },
      },
    });

    return meter ? this.normalizeMeter(meter) : null;
  }

  private async findDirectMeter(deviceId: string): Promise<ResolvedMeter | null> {
    if (this.directMeterCache.has(deviceId)) {
      return this.directMeterCache.get(deviceId) || null;
    }

    const candidates = Array.from(new Set([deviceId, deviceId.toUpperCase(), deviceId.toLowerCase()]));
    const meter = await prisma.meter.findFirst({
      where: {
        register: { in: candidates },
        deletedAt: null,
      },
      select: {
        id: true,
        register: true,
        apartmentId: true,
        blockId: true,
        complexId: true,
        companyId: true,
        apartment: {
          select: {
            companyId: true,
            blockId: true,
            complexId: true,
            block: {
              select: {
                companyId: true,
                complexId: true,
                complex: { select: { companyId: true } },
              },
            },
          },
        },
      },
    });

    const resolved = meter ? this.normalizeMeter(meter) : null;
    this.directMeterCache.set(deviceId, resolved);
    return resolved;
  }

  private async findMeterByDeviceLink(deviceId: string, timestamp: Date): Promise<{ meter: ResolvedMeter; deviceId: string } | null> {
    if (!this.linkedMetersCache.has(deviceId)) {
      const links = await prisma.meterDeviceLink.findMany({
        where: {
          deviceId,
          deletedAt: null,
        },
        orderBy: { startDate: 'desc' },
        select: {
          deviceId: true,
          startDate: true,
          endDate: true,
          meter: {
            select: {
              id: true,
              register: true,
              apartmentId: true,
              blockId: true,
              complexId: true,
              companyId: true,
              deletedAt: true,
              apartment: {
                select: {
                  companyId: true,
                  blockId: true,
                  complexId: true,
                  block: {
                    select: {
                      companyId: true,
                      complexId: true,
                      complex: { select: { companyId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const normalizedLinks = links
        .filter((link) => !link.meter.deletedAt)
        .map((link) => ({
          deviceId: link.deviceId,
          startDate: link.startDate,
          endDate: link.endDate,
          meter: this.normalizeMeter(link.meter),
        }));

      this.linkedMetersCache.set(deviceId, normalizedLinks);
    }

    const links = this.linkedMetersCache.get(deviceId) || [];
    const active = links.find((link) => {
      const starts = timestamp >= link.startDate;
      const ends = !link.endDate || timestamp <= link.endDate;
      return starts && ends;
    });

    if (active) return { meter: active.meter, deviceId: active.deviceId };
    return null;
  }

  private normalizeMeter(meter: {
    id: string;
    register: string;
    apartmentId: string | null;
    blockId: string | null;
    complexId: string | null;
    companyId: string | null;
    apartment?: {
      companyId: string | null;
      blockId: string | null;
      complexId: string | null;
      block?: {
        companyId: string | null;
        complexId: string | null;
        complex?: { companyId: string | null } | null;
      } | null;
    } | null;
  }): ResolvedMeter {
    return {
      id: meter.id,
      register: meter.register,
      apartmentId: meter.apartmentId || null,
      blockId: meter.blockId || meter.apartment?.blockId || null,
      complexId: meter.complexId || meter.apartment?.complexId || meter.apartment?.block?.complexId || null,
      companyId:
        meter.companyId ||
        meter.apartment?.companyId ||
        meter.apartment?.block?.companyId ||
        meter.apartment?.block?.complex?.companyId ||
        null,
    };
  }

  private async persistAnomaly(params: {
    meterId: string | null;
    readingId: string;
    companyId: string;
    occurredAt: Date;
    alarmCode: string;
    rawPayload: string;
  }): Promise<'created' | 'duplicate'> {
    if (!params.meterId) return 'duplicate';

    const existing = await prisma.iotAnomalyEvent.findFirst({
      where: {
        meterId: params.meterId,
        occurredAt: params.occurredAt,
        alarmCode: params.alarmCode,
        source: GROUPLINK_SOURCE,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) return 'duplicate';

    try {
      await prisma.iotAnomalyEvent.create({
        data: {
          meterId: params.meterId,
          readingId: params.readingId,
          companyId: params.companyId,
          occurredAt: params.occurredAt,
          alarmCode: params.alarmCode,
          source: GROUPLINK_SOURCE,
          rawPayload: params.rawPayload,
        },
      });
      return 'created';
    } catch (error) {
      if (isUniqueConstraintError(error)) return 'duplicate';
      throw error;
    }
  }
}
