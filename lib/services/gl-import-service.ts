/**
 * lib/services/gl-import-service.ts
 *
 * Serviço de IMPORTAÇÃO da Group Link (GL).
 *
 * Formato real dos arquivos (confirmado em 11/Jun/2026):
 *   - Bucket:    acquax-grouplink-batch-115655017755-us-east-2-an
 *   - Região:    us-east-2
 *   - Path S3:   events/{ano}/{mes}/{dia}/{arquivo}.csv.gz
 *   - Encoding:  gzip (descompactado = UTF-8)
 *   - Separador: ponto e vírgula (;)
 *
 * Colunas do CSV GL:
 *   device_id ; channel ; unity ; city ; remote_id ; reading ;
 *   raw_pulses_delta ; reading_date ; reading_time ; latency_max ;
 *   latency_min ; records ; multiplier ; raw_pulses ; discount_offset ; result_offset
 *
 * Mapeamento para o banco:
 *   remote_id    → meter.glId  (chave de lookup)
 *   reading      → Reading.reading
 *   reading_date → Reading.readAt  (ex: "2026-05-12 14:44:00+00")
 *   device_id    → Reading.remoteId (rastreabilidade)
 *
 * Regras de negócio:
 *   - Apenas medidores com glId preenchido são processados
 *   - remote_id sem correspondência no banco → descartado + logado
 *   - Cada execução grava um GlImportLog para auditoria
 *
 * ATENÇÃO: A inserção é feita em lotes (batch) de 500 registros para evitar
 * deadlocks/timeouts de transação no MongoDB ao processar arquivos grandes
 * (20k+ leituras por arquivo GL).
 */

import prisma from '@/lib/prisma';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GlImportResult {
  success: boolean;
  filesFound: number;
  filesProcessed: number;
  rowsTotal: number;
  imported: number;
  skipped: number;
  errors: number;
  skipLog: string[];
  error?: string;
}

/** Uma linha parseada do CSV GL. */
export interface GlCsvRow {
  /** remote_id — identificador do medidor na GroupLink = meter.glId */
  remote_id: string;
  /** device_id GL — para rastreabilidade */
  device_id: string;
  /** Valor da leitura em m³ */
  reading: number;
  /** Data/hora da leitura (já convertida para Date UTC) */
  readAt: Date;
  /** Data no formato YYYY-MM-DD (para o campo readAtDate) */
  readAtDate: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Tamanho do lote para createMany — evita deadlock de transação no MongoDB */
const INSERT_BATCH_SIZE = 500;

// ─── Singleton S3 Client ──────────────────────────────────────────────────────

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.GL_S3_REGION;
    // Suporte aos dois nomes possíveis cadastrados no Vercel
    const accessKeyId = process.env.GL_S3_ACCESS_KEY_ID ?? process.env.GL_ACESS_KEY_ID;
    const secretAccessKey = process.env.GL_S3_SECRET_ACCESS_KEY ?? process.env.GL_S3_SECRET_ACESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        '[GL Import] Credenciais S3 ausentes. Configure GL_S3_REGION, GL_S3_ACCESS_KEY_ID e GL_S3_SECRET_ACCESS_KEY.',
      );
    }

    s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3Client;
}

// ─── GlImportService ──────────────────────────────────────────────────────────

export class GlImportService {
  // ── Helpers de path ─────────────────────────────────────────────────────────

  /**
   * Monta o prefixo S3 do dia para listagem.
   * Padrão: {GL_S3_PATH_PREFIX}/{ano}/{mes}/{dia}/
   * Ex:      events/2026/06/11/
   */
  static buildDayPrefix(now: Date): string {
    const prefix = process.env.GL_S3_PATH_PREFIX ?? 'events';
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${prefix}/${yyyy}/${mm}/${dd}/`;
  }

  // ── S3: listar arquivos ──────────────────────────────────────────────────────

  /**
   * Lista todos os arquivos .csv.gz depositados pela GL no S3 para o dia.
   * Retorna array de S3 keys.
   */
  static async listTodaysFiles(now: Date): Promise<string[]> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) throw new Error('[GL Import] GL_S3_BUCKET não configurado.');

    const prefix = GlImportService.buildDayPrefix(now);
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

    console.log(`[GL Import] Arquivos encontrados em "${prefix}": ${keys.length}`);
    return keys;
  }

  // ── S3: baixar e descompactar arquivo ────────────────────────────────────────

  /**
   * Baixa um arquivo S3, descompacta se for .gz, e retorna como string UTF-8.
   */
  static async downloadFile(s3Key: string): Promise<string> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) throw new Error('[GL Import] GL_S3_BUCKET não configurado.');

    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    );

    if (!response.Body) throw new Error(`[GL Import] Corpo vazio: ${s3Key}`);

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Descompacta gzip se necessário
    const raw = s3Key.endsWith('.gz') ? gunzipSync(buffer) : buffer;
    return raw.toString('utf-8');
  }

  // ── CSV: parse ───────────────────────────────────────────────────────────────

  /**
   * Faz parse do CSV GL (separador: ponto e vírgula) e retorna GlCsvRow[].
   *
   * Cabeçalho esperado:
   *   device_id;channel;unity;city;remote_id;reading;raw_pulses_delta;
   *   reading_date;reading_time;latency_max;latency_min;records;
   *   multiplier;raw_pulses;discount_offset;result_offset
   *
   * Datas vêm no formato: "2026-05-12 14:44:00+00"
   */
  static parseCsv(content: string): GlCsvRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return [];

    // Parse cabeçalho (case-insensitive)
    const headers = lines[0]
      .split(';')
      .map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

    const idxRemoteId   = headers.indexOf('remote_id');
    const idxDeviceId   = headers.indexOf('device_id');
    const idxReading    = headers.indexOf('reading');
    const idxReadingDate = headers.indexOf('reading_date');

    if (idxRemoteId === -1 || idxReading === -1 || idxReadingDate === -1) {
      console.error('[GL Import] Cabeçalho CSV inesperado:', headers.join(';'));
      return [];
    }

    const rows: GlCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(';');

      const remote_id   = cells[idxRemoteId]?.trim() ?? '';
      const device_id   = cells[idxDeviceId]?.trim() ?? '';
      const readingRaw  = cells[idxReading]?.trim() ?? '';
      const dateRaw     = cells[idxReadingDate]?.trim() ?? '';

      if (!remote_id || !dateRaw) continue;

      const reading = parseFloat(readingRaw);
      if (isNaN(reading)) continue;

      // Parse da data: "2026-05-12 14:44:00+00" → Date UTC
      // Substitui o espaço por T e normaliza o offset (+00 → +00:00)
      let readAt: Date;
      try {
        const iso = dateRaw
          .replace(' ', 'T')
          .replace(/\+00$/, '+00:00')
          .replace(/([+-]\d{2})$/, '$1:00');
        readAt = new Date(iso);
        if (isNaN(readAt.getTime())) throw new Error('data inválida');
      } catch {
        continue; // descarta linha com data inválida
      }

      rows.push({
        remote_id,
        device_id,
        reading,
        readAt,
        readAtDate: readAt.toISOString().slice(0, 10),
      });
    }

    return rows;
  }

  // ── Banco: mapa glId → meterId ────────────────────────────────────────────────

  /**
   * Constrói mapa { remote_id → meterId } consultando meter.glId no banco.
   * Uma única query para todos os remote_ids do arquivo.
   */
  static async buildGlIdToMeterIdMap(
    remoteIds: string[],
  ): Promise<Map<string, string>> {
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

    console.log(
      `[GL Import] remote_ids únicos: ${uniqueIds.length} | medidores encontrados: ${map.size}`,
    );
    return map;
  }

  // ── Banco: buscar userId do sistema ──────────────────────────────────────────

  /**
   * Retorna o userId para as leituras criadas pelo cron.
   * Prioridade: SYSTEM_USER_ID env → primeiro admin do banco.
   */
  static async getSystemUserId(): Promise<string> {
    if (process.env.SYSTEM_USER_ID) return process.env.SYSTEM_USER_ID;

    // Busca o primeiro usuário admin como fallback
    const admin = await prisma.user.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!admin) throw new Error('[GL Import] Nenhum usuário encontrado no banco para SYSTEM_USER_ID.');
    return admin.id;
  }

  // ── Banco: importar linhas (batched) ─────────────────────────────────────────

  /**
   * Cria registros de Reading para as linhas com remote_id válido.
   *
   * IMPORTANTE: A inserção é feita em lotes de INSERT_BATCH_SIZE (500) registros
   * para evitar deadlocks de transação no MongoDB ao processar arquivos grandes
   * (20k+ leituras por arquivo GL). Antes deste fix, o createMany com ~17k
   * registros de uma vez causava "Transaction failed due to a write conflict
   * or a deadlock" e NENHUMA leitura era gravada.
   *
   * Também busca os dados desnormalizados (apartmentId, blockId, complexId,
   * companyId) dos meters diretamente, em vez de usar bulkCreateEntity (que
   * dava throw se um único meter não fosse encontrado, derrubando todo o lote).
   */
  static async importRows(
    rows: GlCsvRow[],
    glIdToMeterId: Map<string, string>,
    userId: string,
    skipLog: string[],
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    let skipped = 0;
    let errors = 0;

    // 1. Filtra linhas com remote_id válido e constrói array de leituras
    const matchedReadings: object[] = [];

    for (const row of rows) {
      const meterId = glIdToMeterId.get(row.remote_id.trim());

      if (!meterId) {
        skipped++;
        if (skipLog.length < 500) {
          skipLog.push(
            `DESCARTADO | remote_id=${row.remote_id} | motivo=glId não encontrado no banco`,
          );
        }
        continue;
      }

      // monthRef / yearRef: necessários para relatórios de consumo mensal
      const yyyy = String(row.readAt.getUTCFullYear());
      const mm   = String(row.readAt.getUTCMonth() + 1).padStart(2, '0');

      matchedReadings.push({
        reading: row.reading,
        readAt: row.readAt,
        readAtDate: row.readAtDate,
        monthRef: mm,
        yearRef: yyyy,
        meterId,
        registerName: row.remote_id,
        remoteId: row.device_id,
        isManualReading: false,
        isPreReading: false,
      });
    }

    if (matchedReadings.length === 0) {
      return { imported: 0, skipped, errors };
    }

    console.log(`[GL Import] ${matchedReadings.length} leituras matched, inserindo em lotes de ${INSERT_BATCH_SIZE}...`);

    // 2. Buscar dados desnormalizados dos meters (uma única query)
    const uniqueMeterIds = [...new Set(matchedReadings.map((r: any) => r.meterId))];
    const metersData = await prisma.meter.findMany({
      where: { id: { in: uniqueMeterIds } },
      select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true },
    });
    const meterDataMap = new Map(metersData.map((m: any) => [m.id, m]));

    // 3. Adicionar campos desnormalizados + createdByUserId + deletedAt
    const readingsWithAllFields = matchedReadings.map((reading: any) => {
      const meterData = reading.meterId ? meterDataMap.get(reading.meterId) : null;
      return {
        ...reading,
        createdByUserId: userId,
        deletedAt: null,
        apartmentId: meterData?.apartmentId || null,
        blockId: meterData?.blockId || null,
        complexId: meterData?.complexId || null,
        companyId: meterData?.companyId || null,
      };
    });

    // 4. Inserir em lotes (batched createMany)
    let imported = 0;
    for (let i = 0; i < readingsWithAllFields.length; i += INSERT_BATCH_SIZE) {
      const batch = readingsWithAllFields.slice(i, i + INSERT_BATCH_SIZE);
      try {
        const result = await prisma.reading.createMany({ data: batch });
        imported += result.count;
        process.stdout.write('.');
      } catch (e: any) {
        const batchErrors = batch.length;
        errors += batchErrors;
        const msg = `ERRO_BATCH | offset=${i} | count=${batchErrors} | ${e.message.split('\n')[0]}`;
        console.error(`\n[GL Import] ${msg}`);
        if (skipLog.length < 500) skipLog.push(msg);
      }
    }

    console.log(`\n[GL Import] Inserção concluída: imported=${imported} | errors=${errors}`);

    return { imported, skipped, errors };
  }

  // ── Log de execução ───────────────────────────────────────────────────────────

  static async saveImportLog(opts: {
    executedAt: Date;
    filesFound: number;
    filesProcessed: number;
    rowsTotal: number;
    imported: number;
    skipped: number;
    errors: number;
    skipLog: string[];
    errorMessage?: string;
  }): Promise<void> {
    try {
      await (prisma as any).glImportLog.create({ data: { ...opts, errorMessage: opts.errorMessage ?? null } });
    } catch (e: any) {
      console.error(`[GL Import] Falha ao gravar GlImportLog: ${e.message}`);
    }
  }

  // ── Método principal ──────────────────────────────────────────────────────────

  /**
   * Orquestra o ciclo completo:
   *   1. Lista arquivos do dia no S3 (ListObjectsV2)
   *   2. Baixa e descompacta cada arquivo (GetObject + gunzip)
   *   3. Faz parse do CSV (separador ;)
   *   4. Constrói mapa remote_id → meterId (query única Prisma)
   *   5. Cria Reading records em lotes (batched createMany)
   *   6. Grava GlImportLog
   */
  static async runImport(now: Date = new Date()): Promise<GlImportResult> {
    const executedAt = now;
    const skipLog: string[] = [];
    let filesFound = 0, filesProcessed = 0, rowsTotal = 0;
    let imported = 0, skipped = 0, errors = 0;

    try {
      // 1. Listar arquivos
      const s3Keys = await GlImportService.listTodaysFiles(now);
      filesFound = s3Keys.length;

      if (filesFound === 0) {
        console.log(`[GL Import] Nenhum arquivo para ${now.toISOString().slice(0, 10)}.`);
        await GlImportService.saveImportLog({ executedAt, filesFound: 0, filesProcessed: 0, rowsTotal: 0, imported: 0, skipped: 0, errors: 0, skipLog: [] });
        return { success: true, filesFound: 0, filesProcessed: 0, rowsTotal: 0, imported: 0, skipped: 0, errors: 0, skipLog: [] };
      }

      // 2. Baixar e parsear todos os arquivos
      const allRows: GlCsvRow[] = [];

      for (const s3Key of s3Keys) {
        try {
          console.log(`[GL Import] Baixando: ${s3Key}`);
          const content = await GlImportService.downloadFile(s3Key);
          const rows = GlImportService.parseCsv(content);
          console.log(`[GL Import] ${s3Key}: ${rows.length} linhas parseadas`);
          allRows.push(...rows);
          filesProcessed++;
        } catch (e: any) {
          errors++;
          const msg = `ERRO_ARQUIVO | key=${s3Key} | ${e.message}`;
          console.error(`[GL Import] ${msg}`);
          if (skipLog.length < 500) skipLog.push(msg);
        }
      }

      rowsTotal = allRows.length;
      console.log(`[GL Import] Total: ${rowsTotal} linhas de ${filesProcessed} arquivos`);

      if (rowsTotal === 0) {
        await GlImportService.saveImportLog({ executedAt, filesFound, filesProcessed, rowsTotal: 0, imported: 0, skipped: 0, errors, skipLog });
        return { success: true, filesFound, filesProcessed, rowsTotal: 0, imported: 0, skipped: 0, errors, skipLog };
      }

      // 3. Construir mapa glId → meterId
      const allRemoteIds = allRows.map((r) => r.remote_id);
      const glIdToMeterId = await GlImportService.buildGlIdToMeterIdMap(allRemoteIds);

      // 4. Buscar userId do sistema
      const userId = await GlImportService.getSystemUserId();

      // 5. Importar leituras (batched)
      const result = await GlImportService.importRows(allRows, glIdToMeterId, userId, skipLog);
      imported = result.imported;
      skipped = result.skipped;
      errors += result.errors;

      // 6. Gravar log de execução
      await GlImportService.saveImportLog({
        executedAt,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        skipLog,
      });

      console.log(
        `[GL Import] Finalizado | filesFound=${filesFound} | filesProcessed=${filesProcessed} | ` +
          `rowsTotal=${rowsTotal} | imported=${imported} | skipped=${skipped} | errors=${errors}`,
      );

      return {
        success: true,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        skipLog,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Erro desconhecido';
      console.error(`[GL Import] ERRO CRÍTICO: ${errorMessage}`);

      await GlImportService.saveImportLog({
        executedAt,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        skipLog,
        errorMessage,
      });

      return {
        success: false,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        skipLog,
        error: errorMessage,
      };
    }
  }
}
