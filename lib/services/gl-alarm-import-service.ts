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
import { sendEmail } from '@/lib/services/email-service';

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

      // Notificar moradores sobre alarmes vinculados ao seu medidor
      GlAlarmImportService.notifyResidentsOfAlarms(alarmsToCreate).catch(err =>
        console.error('[GL Alarm Import] Erro ao notificar moradores:', err)
      );

      return { imported: result.count, errors: 0 };
    } catch (e: any) {
      console.error(`[GL Alarm Import] Erro ao salvar alarmes: ${e.message}`);
      return { imported: 0, errors: alarmsToCreate.length };
    }
  }

  /**
   * Enfileira notificações por email para moradores cujo medidor disparou alarme.
   */
  private static async notifyResidentsOfAlarms(alarms: any[]): Promise<void> {
    for (const alarm of alarms) {
      if (!alarm.meterId) continue;

      // Buscar o medidor e apartamento vinculado
      const meter = await prisma.meter.findUnique({
        where: { id: alarm.meterId },
        select: {
          id: true,
          register: true,
          apartment: {
            select: {
              id: true,
              name: true,
              block: {
                select: {
                  name: true,
                  complex: { select: { id: true, socialName: true } },
                },
              },
              users: {
                where: { deletedAt: null },
                select: { email: true, fullName: true },
              },
            },
          },
        },
      });

      if (!meter?.apartment) continue;

      const residents = meter.apartment.users.filter(u =>
        u.email &&
        !u.email.includes('@acquax') &&
        !u.email.includes('@acquaxdobrasil') &&
        !u.email.includes('@acquaxcontrol')
      );

      if (residents.length === 0) continue;

      const complexName = meter.apartment.block?.complex?.socialName ?? '-';
      const blockName = meter.apartment.block?.name ?? '-';
      const aptName = meter.apartment.name ?? '-';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

      const alarmLabels: Record<string, string> = {
        MAX_FLOW: 'Fluxo máximo excedido',
        REVERSE_FLOW: 'Fluxo reverso detectado',
      };

      const alarmText = alarmLabels[alarm.alarmCode] || alarm.alarmCode;
      const alarmDate = alarm.alarmAt instanceof Date
        ? alarm.alarmAt.toLocaleDateString('pt-BR')
        : new Date(alarm.alarmAt).toLocaleDateString('pt-BR');

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#e53935;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Alerta do Medidor - ${complexName}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;">Olá,</p>
          <p style="margin:0 0 16px 0;font-size:14px;color:#333;line-height:1.6;">
            O medidor da sua unidade (<strong>${blockName} / ${aptName}</strong>) registrou um alerta em <strong>${alarmDate}</strong>:
          </p>
          <div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
            <p style="margin:0;font-size:15px;font-weight:600;color:#c62828;">${alarmText}</p>
            ${alarm.criticality ? `<p style="margin:4px 0 0 0;font-size:13px;color:#c62828;">Criticidade: ${alarm.criticality}</p>` : ''}
          </div>
          <p style="margin:0 0 16px 0;font-size:13px;color:#666;line-height:1.5;">
            Recomendamos verificar seu sistema hidráulico. Se o problema persistir, entre em contato com a administração do condomínio.
          </p>
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

      const text = `AcquaXControl - Alerta do Medidor - ${complexName}

O medidor da sua unidade (${blockName}/${aptName}) registrou um alerta em ${alarmDate}:

Tipo: ${alarmText}
${alarm.criticality ? `Criticidade: ${alarm.criticality}` : ''}

Recomendamos verificar seu sistema hidraulico. Se o problema persistir, entre em contato com a administracao.

Acesse ${baseUrl}/monitoring para ver os detalhes.

Em caso de duvidas: medicao@acquaxdobrasil.com.br e/ou 4003-7945.`;

      for (const resident of residents) {
        try {
          await sendEmail({
            to: resident.email,
            toName: resident.fullName,
            subject: `Alerta do Medidor - ${complexName} - ${blockName}/${aptName}`,
            html,
            text,
          });
        } catch (e) {
          console.error(`[GL Alarm] Erro ao notificar ${resident.email}:`, e);
        }
      }
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
