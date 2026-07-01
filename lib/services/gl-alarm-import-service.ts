/**
 * lib/services/gl-alarm-import-service.ts
 *
 * Serviço de IMPORTAÇÃO de ALARMES da Group Link (GL).
 *
 * Mesma origem que os "events" (leituras), mas em uma pasta separada no S3:
 *   Path S3: alarms/{ano}/{mes}/{dia}/{arquivo}.csv.gz
 *
 * Colunas do CSV de alarmes (confirmado em 01/Jul/2026):
 *   device_id ; channel ; unity ; city ; remote_id ; alarm_type ; alarm_code ;
 *   alarm_date ; alarm_criticality
 *
 * Exemplos de alarm_code observados: MAX_FLOW, REVERSE_FLOW
 *
 * Mapeamento para o banco (model GlAlarm):
 *   remote_id        → lookup em meter.glId (mesma lógica do gl-import-service)
 *   alarm_type        → GlAlarm.alarmType
 *   alarm_code        → GlAlarm.alarmCode
 *   alarm_date        → GlAlarm.alarmAt
 *   alarm_criticality → GlAlarm.criticality
 *   device_id         → GlAlarm.deviceId (rastreabilidade)
 *
 * Regras de negócio:
 *   - Alarmes de remote_id sem medidor correspondente ainda são gravados,
 *     porém com meterId = null (diferente das leituras, que descartamos —
 *     aqui vale manter o registro para auditoria/consulta futura por condomínio/cidade)
 */

import prisma from '@/lib/prisma';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';

export interface GlAlarmImportResult {
  success: boolean;
  filesFound: number;
  filesProcessed: number;
  rowsTotal: number;
  imported: number;
  errors: number;
  skipLog: string[];
  error?: string;
}

export interface GlAlarmCsvRow {
  remote_id: string;
  device_id: string;
  city: string;
  unity: string;
  alarm_type: string;
  alarm_code: string;
  alarm_criticality: string;
  alarmAt: Date;
}

// ─── Singleton S3 Client (reaproveita as mesmas credenciais do gl-import-service) ──

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.GL_S3_REGION;
    const accessKeyId = process.env.GL_S3_ACCESS_KEY_ID ?? process.env.GL_ACESS_KEY_ID;
    const secretAccessKey = process.env.GL_S3_SECRET_ACCESS_KEY ?? process.env.GL_S3_SECRET_ACESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        '[GL Alarm Import] Credenciais S3 ausentes. Configure GL_S3_REGION, GL_S3_ACCESS_KEY_ID e GL_S3_SECRET_ACCESS_KEY.',
      );
    }

    s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3Client;
}

export class GlAlarmImportService {
  // ── Helpers de path ─────────────────────────────────────────────────────────

  /** Prefixo do S3 para a pasta de alarmes do dia. Ex: alarms/2026/07/01/ */
  static buildDayPrefix(now: Date): string {
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `alarms/${yyyy}/${mm}/${dd}/`;
  }

  // ── S3: listar arquivos ──────────────────────────────────────────────────────

  static async listTodaysFiles(now: Date): Promise<string[]> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) throw new Error('[GL Alarm Import] GL_S3_BUCKET não configurado.');

    const prefix = GlAlarmImportService.buildDayPrefix(now);
    const client = getS3Client();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`[GL Alarm Import] Arquivos encontrados em "${prefix}": ${keys.length}`);
    return keys;
  }

  // ── S3: baixar e descompactar arquivo ────────────────────────────────────────

  static async downloadFile(s3Key: string): Promise<string> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) throw new Error('[GL Alarm Import] GL_S3_BUCKET não configurado.');

    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    );

    if (!response.Body) throw new Error(`[GL Alarm Import] Corpo vazio: ${s3Key}`);

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const raw = s3Key.endsWith('.gz') ? gunzipSync(buffer) : buffer;
    return raw.toString('utf-8');
  }

  // ── CSV: parse ───────────────────────────────────────────────────────────────

  /**
   * Cabeçalho esperado:
   *   device_id;channel;unity;city;remote_id;alarm_type;alarm_code;alarm_date;alarm_criticality
   * Datas vêm no formato: "2026-06-30 21:46:00+00"
   */
  static parseCsv(content: string): GlAlarmCsvRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0]
      .split(';')
      .map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

    const idxRemoteId    = headers.indexOf('remote_id');
    const idxDeviceId    = headers.indexOf('device_id');
    const idxCity        = headers.indexOf('city');
    const idxUnity       = headers.indexOf('unity');
    const idxAlarmType   = headers.indexOf('alarm_type');
    const idxAlarmCode   = headers.indexOf('alarm_code');
    const idxAlarmDate   = headers.indexOf('alarm_date');
    const idxCriticality = headers.indexOf('alarm_criticality');

    if (idxRemoteId === -1 || idxAlarmCode === -1 || idxAlarmDate === -1) {
      console.error('[GL Alarm Import] Cabeçalho CSV inesperado:', headers.join(';'));
      return [];
    }

    const rows: GlAlarmCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(';');

      const remote_id = cells[idxRemoteId]?.trim() ?? '';
      const dateRaw    = cells[idxAlarmDate]?.trim() ?? '';
      if (!remote_id || !dateRaw) continue;

      let alarmAt: Date;
      try {
        const iso = dateRaw
          .replace(' ', 'T')
          .replace(/\+00$/, '+00:00')
          .replace(/([+-]\d{2})$/, '$1:00');
        alarmAt = new Date(iso);
        if (isNaN(alarmAt.getTime())) throw new Error('data inválida');
      } catch {
        continue;
      }

      rows.push({
        remote_id,
        device_id: cells[idxDeviceId]?.trim() ?? '',
        city: cells[idxCity]?.trim() ?? '',
        unity: cells[idxUnity]?.trim() ?? '',
        alarm_type: cells[idxAlarmType]?.trim() ?? '',
        alarm_code: cells[idxAlarmCode]?.trim() ?? '',
        alarm_criticality: cells[idxCriticality]?.trim() ?? '',
        alarmAt,
      });
    }

    return rows;
  }

  // ── Banco: mapa glId → meterId (reaproveita a mesma lógica do import de leituras) ──

  static async buildGlIdToMeterIdMap(remoteIds: string[]): Promise<Map<string, string>> {
    if (remoteIds.length === 0) return new Map();
    const uniqueIds = [...new Set(remoteIds.filter((id) => id.trim() !== ''))];

    const meters = await prisma.meter.findMany({
      where: { glId: { in: uniqueIds }, deletedAt: null },
      select: { id: true, glId: true },
    });

    const map = new Map<string, string>();
    for (const meter of meters) {
      if (meter.glId) map.set(meter.glId.trim(), meter.id);
    }
    return map;
  }

  // ── Banco: importar alarmes ───────────────────────────────────────────────────

  static async importRows(
    rows: GlAlarmCsvRow[],
    glIdToMeterId: Map<string, string>,
  ): Promise<{ imported: number; errors: number }> {
    const alarmsToCreate = rows.map((row) => ({
      remoteId: row.remote_id,
      deviceId: row.device_id || null,
      meterId: glIdToMeterId.get(row.remote_id.trim()) ?? null,
      alarmType: row.alarm_type,
      alarmCode: row.alarm_code,
      criticality: row.alarm_criticality || null,
      alarmAt: row.alarmAt,
      city: row.city || null,
      unity: row.unity || null,
      deletedAt: null,
    }));

    if (alarmsToCreate.length === 0) return { imported: 0, errors: 0 };

    try {
      const result = await prisma.glAlarm.createMany({ data: alarmsToCreate });
      return { imported: result.count, errors: 0 };
    } catch (e: any) {
      console.error(`[GL Alarm Import] Erro ao salvar alarmes: ${e.message}`);
      return { imported: 0, errors: alarmsToCreate.length };
    }
  }

  // ── Método principal ──────────────────────────────────────────────────────────

  static async runImport(now: Date = new Date()): Promise<GlAlarmImportResult> {
    const skipLog: string[] = [];
    let filesFound = 0, filesProcessed = 0, rowsTotal = 0, imported = 0, errors = 0;

    try {
      const s3Keys = await GlAlarmImportService.listTodaysFiles(now);
      filesFound = s3Keys.length;

      if (filesFound === 0) {
        return { success: true, filesFound: 0, filesProcessed: 0, rowsTotal: 0, imported: 0, errors: 0, skipLog: [] };
      }

      const allRows: GlAlarmCsvRow[] = [];
      for (const s3Key of s3Keys) {
        try {
          const content = await GlAlarmImportService.downloadFile(s3Key);
          const rows = GlAlarmImportService.parseCsv(content);
          console.log(`[GL Alarm Import] ${s3Key}: ${rows.length} linhas parseadas`);
          allRows.push(...rows);
          filesProcessed++;
        } catch (e: any) {
          errors++;
          const msg = `ERRO_ARQUIVO | key=${s3Key} | ${e.message}`;
          console.error(`[GL Alarm Import] ${msg}`);
          skipLog.push(msg);
        }
      }

      rowsTotal = allRows.length;
      if (rowsTotal === 0) {
        return { success: true, filesFound, filesProcessed, rowsTotal: 0, imported: 0, errors, skipLog };
      }

      const glIdToMeterId = await GlAlarmImportService.buildGlIdToMeterIdMap(allRows.map((r) => r.remote_id));

      const result = await GlAlarmImportService.importRows(allRows, glIdToMeterId);
      imported = result.imported;
      errors += result.errors;

      console.log(`[GL Alarm Import] Resultado: importados=${imported} | erros=${errors}`);

      return { success: true, filesFound, filesProcessed, rowsTotal, imported, errors, skipLog };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GL Alarm Import] Falha crítica: ${message}`);
      return { success: false, filesFound, filesProcessed, rowsTotal, imported, errors, skipLog, error: message };
    }
  }
}
