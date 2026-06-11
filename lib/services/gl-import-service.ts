/**
 * lib/services/gl-import-service.ts
 *
 * Serviço de IMPORTAÇÃO da Group Link (GL).
 *
 * Responsabilidades:
 *   1. Listar arquivos CSV depositados pela GL no S3 para o dia atual
 *        Path: {prefix}/{ano}/{mes}/{dia}/*.csv
 *        Ex:   readings/2026/06/11/readings_20260611_0700.csv
 *   2. Baixar o conteúdo de cada arquivo (GetObject)
 *   3. Fazer parse do CSV GL (UTF-8, separador vírgula)
 *   4. Buscar medidores por glId (somente medidores com glId válido)
 *   5. Criar registros de Reading no banco de dados
 *   6. Registrar o resultado de cada execução em GlImportLog
 *
 * Padrão arquitetural: static class — idêntico ao IotReadingService.
 * Dependências reutilizadas:
 *   - prisma            → lib/prisma.ts  (singleton já existente)
 *   - bulkCreateEntity  → lib/userData.ts (mesmo padrão do IotReadingService)
 *   - S3Client          → @aws-sdk/client-s3 (ListObjectsV2 + GetObject)
 *
 * Regras de negócio:
 *   - Apenas medidores com glId preenchido são processados
 *   - Medidores sem glId correspondente são descartados e logados
 *   - Cada execução grava um GlImportLog com totais e erros
 *   - Alertas GL chegam como campo "alerta" no CSV (boolean/texto)
 */

import prisma from '@/lib/prisma';
import { bulkCreateEntity } from '@/lib/userData';
import { PermissionableEntity } from '@prisma/client';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Resultado retornado pelo método principal runImport(). */
export interface GlImportResult {
  success: boolean;
  /** Arquivos encontrados no S3 para o dia */
  filesFound: number;
  /** Arquivos processados com sucesso */
  filesProcessed: number;
  /** Total de linhas lidas nos CSVs */
  rowsTotal: number;
  /** Leituras importadas com sucesso */
  imported: number;
  /** Linhas descartadas (glId não encontrado ou inválido) */
  skipped: number;
  /** Linhas com erro de parse/gravação */
  errors: number;
  /** Log de linhas descartadas/com erro (primeiros 100) */
  skipLog: string[];
  error?: string;
}

/** Layout de uma linha do CSV GL. */
export interface GlCsvRow {
  /** Identificador do medidor na Group Link */
  gl_id: string;
  /** Chassi/número de série do medidor */
  chassi: string;
  /** Valor da leitura */
  leitura: number;
  /** Data da leitura (YYYY-MM-DD) */
  data_leitura: string;
  /** Hora da leitura (HH:MM:SS) */
  hora_leitura: string;
  /** Tipo do medidor */
  tipo_medidor: string;
  /** Condomínio */
  condominio: string;
  /** Bloco */
  bloco: string;
  /** Apartamento */
  apartamento: string;
  /** Alerta (opcional — campo extra do GL) */
  alerta?: string;
}

// ─── Singleton S3 Client ──────────────────────────────────────────────────────

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.GL_S3_REGION;
    const accessKeyId = process.env.GL_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.GL_S3_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        '[GL Import] Credenciais S3 ausentes. Configure GL_S3_REGION, GL_S3_ACCESS_KEY_ID e GL_S3_SECRET_ACCESS_KEY no .env.',
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
   * Ex:      readings/2026/06/11/
   */
  static buildDayPrefix(now: Date): string {
    const prefix = process.env.GL_S3_PATH_PREFIX ?? 'readings';
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${prefix}/${yyyy}/${mm}/${dd}/`;
  }

  // ── S3: listar arquivos ──────────────────────────────────────────────────────

  /**
   * Lista todos os arquivos .csv depositados pela GL no S3 para o dia informado.
   * Usa ListObjectsV2Command com o prefixo do dia.
   * Retorna array de S3 keys.
   */
  static async listTodaysFiles(now: Date): Promise<string[]> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) {
      throw new Error('[GL Import] GL_S3_BUCKET não configurado no .env.');
    }

    const prefix = GlImportService.buildDayPrefix(now);
    const client = getS3Client();

    const keys: string[] = [];
    let continuationToken: string | undefined;

    // Pagina todos os objetos do prefixo (cada página tem até 1000 itens)
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.Key.toLowerCase().endsWith('.csv')) {
            keys.push(obj.Key);
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`[GL Import] Arquivos encontrados em "${prefix}": ${keys.length}`);
    return keys;
  }

  // ── S3: baixar arquivo ───────────────────────────────────────────────────────

  /**
   * Baixa o conteúdo de um arquivo S3 e retorna como string UTF-8.
   * Usa GetObjectCommand.
   */
  static async downloadFile(s3Key: string): Promise<string> {
    const bucket = process.env.GL_S3_BUCKET;
    if (!bucket) {
      throw new Error('[GL Import] GL_S3_BUCKET não configurado no .env.');
    }

    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    const response = await client.send(command);

    if (!response.Body) {
      throw new Error(`[GL Import] Corpo vazio para o arquivo: ${s3Key}`);
    }

    // Converte o stream para string
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  }

  // ── CSV: parse ───────────────────────────────────────────────────────────────

  /**
   * Faz parse de uma string CSV GL e retorna array de GlCsvRow.
   *
   * Formato esperado (documentação oficial GL):
   *   gl_id, chassi, leitura, data_leitura, hora_leitura, tipo_medidor,
   *   condominio, bloco, apartamento [, alerta]
   *
   * Regras:
   *   - Primeira linha: cabeçalho (case-insensitive, com ou sem espaços)
   *   - Separador: vírgula
   *   - Encoding: UTF-8
   *   - Linhas vazias são ignoradas
   */
  static parseCsv(content: string): GlCsvRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return [];

    // Parse cabeçalho
    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

    const rows: GlCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split simples por vírgula (CSV GL não usa aspas nas colunas numéricas/simples)
      // Para campos com aspas, faz unwrap básico
      const cells = GlImportService.splitCsvLine(line);

      const get = (col: string): string => {
        const idx = headers.indexOf(col);
        if (idx === -1) return '';
        return (cells[idx] ?? '').trim().replace(/^["']|["']$/g, '');
      };

      const leituraRaw = get('leitura');
      const leitura = parseFloat(leituraRaw.replace(',', '.'));

      if (!get('gl_id')) continue; // linha sem gl_id → ignora silenciosamente

      rows.push({
        gl_id: get('gl_id'),
        chassi: get('chassi'),
        leitura: isNaN(leitura) ? 0 : leitura,
        data_leitura: get('data_leitura'),
        hora_leitura: get('hora_leitura'),
        tipo_medidor: get('tipo_medidor'),
        condominio: get('condominio'),
        bloco: get('bloco'),
        apartamento: get('apartamento'),
        alerta: get('alerta') || undefined,
      });
    }

    return rows;
  }

  /**
   * Faz split de uma linha CSV respeitando campos entre aspas.
   */
  private static splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // ── Banco: mapa glId → meterId ────────────────────────────────────────────────

  /**
   * Constrói um mapa { glId → meterId } a partir do banco de dados.
   * Apenas medidores com glId preenchido e deletedAt null são incluídos.
   */
  static async buildGlIdToMeterIdMap(
    glIds: string[],
  ): Promise<Map<string, string>> {
    if (glIds.length === 0) return new Map();

    const uniqueGlIds = [...new Set(glIds.filter((id) => id.trim() !== ''))];

    const meters = await prisma.meter.findMany({
      where: {
        glId: { in: uniqueGlIds },
        deletedAt: null,
      },
      select: { id: true, glId: true },
    });

    const map = new Map<string, string>();
    for (const meter of meters) {
      if (meter.glId) {
        map.set(meter.glId.trim(), meter.id);
      }
    }

    console.log(
      `[GL Import] glIds recebidos: ${uniqueGlIds.length} | medidores encontrados: ${map.size}`,
    );
    return map;
  }

  // ── Banco: importar linhas ────────────────────────────────────────────────────

  /**
   * Cria registros de Reading para as linhas do CSV com glId válido.
   *
   * Regras:
   *   - Linhas sem correspondência no mapa glId→meterId são descartadas e logadas
   *   - Alertas são registrados no campo "name" do Reading para rastreabilidade
   *   - userId da importação automática: usa SYSTEM_USER_ID do env ou "system"
   */
  static async importRows(
    rows: GlCsvRow[],
    glIdToMeterId: Map<string, string>,
    skipLog: string[],
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    const userId = process.env.SYSTEM_USER_ID ?? 'system';

    // Separa linhas válidas das descartadas
    const readingsToCreate: object[] = [];

    for (const row of rows) {
      const meterId = glIdToMeterId.get(row.gl_id.trim());

      if (!meterId) {
        skipped++;
        if (skipLog.length < 500) {
          skipLog.push(
            `DESCARTADO | gl_id=${row.gl_id} | chassi=${row.chassi} | motivo=glId não encontrado no banco`,
          );
        }
        continue;
      }

      // Monta data/hora da leitura a partir dos campos separados do CSV
      let readAt: Date;
      try {
        const dateTimeStr = `${row.data_leitura}T${row.hora_leitura || '00:00:00'}`;
        readAt = new Date(dateTimeStr);
        if (isNaN(readAt.getTime())) {
          throw new Error(`data/hora inválida: ${dateTimeStr}`);
        }
      } catch (e: any) {
        errors++;
        if (skipLog.length < 500) {
          skipLog.push(
            `ERRO | gl_id=${row.gl_id} | chassi=${row.chassi} | motivo=data inválida: ${e.message}`,
          );
        }
        continue;
      }

      // readAtDate no formato YYYY-MM-DD
      const readAtDate = row.data_leitura || readAt.toISOString().slice(0, 10);

      readingsToCreate.push({
        reading: row.leitura,
        readAt,
        readAtDate,
        meterId,
        registerName: row.chassi || row.gl_id,
        isManualReading: false,
        isPreReading: false,
        // Alerta GL armazenado no campo name para rastreabilidade
        name: row.alerta ? `[GL Alert] ${row.alerta}` : undefined,
        // Campos extras para rastreabilidade da origem GL
        deviceId: undefined,
        remoteId: row.gl_id,
      });
    }

    if (readingsToCreate.length === 0) {
      return { imported: 0, skipped, errors };
    }

    // Usa bulkCreateEntity — mesmo padrão do IotReadingService.saveReadings()
    const result = await bulkCreateEntity(
      userId,
      PermissionableEntity.reading,
      readingsToCreate,
    );

    if (result.error) {
      console.error(`[GL Import] Erro ao salvar leituras: ${result.error}`);
      errors += readingsToCreate.length;
    } else {
      imported = readingsToCreate.length;
    }

    return { imported, skipped, errors };
  }

  // ── Log de execução ───────────────────────────────────────────────────────────

  /**
   * Grava um registro em GlImportLog com o resultado da execução.
   * Falha silenciosa — não propaga erro para não quebrar o cron.
   */
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
      await (prisma as any).glImportLog.create({
        data: {
          executedAt: opts.executedAt,
          filesFound: opts.filesFound,
          filesProcessed: opts.filesProcessed,
          rowsTotal: opts.rowsTotal,
          imported: opts.imported,
          skipped: opts.skipped,
          errors: opts.errors,
          skipLog: opts.skipLog,
          errorMessage: opts.errorMessage ?? null,
        },
      });
    } catch (e: any) {
      // Não propaga — log de execução não pode quebrar o fluxo principal
      console.error(`[GL Import] Falha ao gravar GlImportLog: ${e.message}`);
    }
  }

  // ── Método principal ──────────────────────────────────────────────────────────

  /**
   * Orquestra o ciclo completo de importação GL:
   *   1. Lista arquivos do dia no S3 (ListObjectsV2)
   *   2. Baixa cada arquivo (GetObject)
   *   3. Faz parse do CSV
   *   4. Constrói mapa glId → meterId
   *   5. Importa leituras (bulkCreateEntity)
   *   6. Grava GlImportLog
   *   7. Retorna GlImportResult
   *
   * @param now - Momento de referência (default: new Date()). Injetável para testes.
   */
  static async runImport(now: Date = new Date()): Promise<GlImportResult> {
    const executedAt = now;
    const skipLog: string[] = [];

    let filesFound = 0;
    let filesProcessed = 0;
    let rowsTotal = 0;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // 1. Listar arquivos do dia
      const s3Keys = await GlImportService.listTodaysFiles(now);
      filesFound = s3Keys.length;

      if (filesFound === 0) {
        console.log(`[GL Import] Nenhum arquivo encontrado para ${now.toISOString().slice(0, 10)}.`);
        await GlImportService.saveImportLog({
          executedAt,
          filesFound: 0,
          filesProcessed: 0,
          rowsTotal: 0,
          imported: 0,
          skipped: 0,
          errors: 0,
          skipLog: [],
        });
        return {
          success: true,
          filesFound: 0,
          filesProcessed: 0,
          rowsTotal: 0,
          imported: 0,
          skipped: 0,
          errors: 0,
          skipLog: [],
        };
      }

      // Coleta todas as linhas de todos os arquivos antes de montar o mapa
      // (otimização: uma única query Prisma para todos os glIds do dia)
      const allRows: GlCsvRow[] = [];
      const processedFiles: string[] = [];

      for (const s3Key of s3Keys) {
        try {
          console.log(`[GL Import] Baixando: ${s3Key}`);
          const content = await GlImportService.downloadFile(s3Key);
          const rows = GlImportService.parseCsv(content);
          console.log(`[GL Import] ${s3Key}: ${rows.length} linhas parseadas`);
          allRows.push(...rows);
          processedFiles.push(s3Key);
          filesProcessed++;
        } catch (e: any) {
          errors++;
          const msg = `ERRO_ARQUIVO | key=${s3Key} | ${e.message}`;
          console.error(`[GL Import] ${msg}`);
          if (skipLog.length < 500) skipLog.push(msg);
        }
      }

      rowsTotal = allRows.length;
      console.log(`[GL Import] Total de linhas: ${rowsTotal} (de ${filesProcessed} arquivos)`);

      if (rowsTotal === 0) {
        await GlImportService.saveImportLog({
          executedAt,
          filesFound,
          filesProcessed,
          rowsTotal: 0,
          imported: 0,
          skipped: 0,
          errors,
          skipLog,
        });
        return {
          success: true,
          filesFound,
          filesProcessed,
          rowsTotal: 0,
          imported: 0,
          skipped: 0,
          errors,
          skipLog,
        };
      }

      // 2. Construir mapa glId → meterId (query única para todos os glIds)
      const allGlIds = allRows.map((r) => r.gl_id);
      const glIdToMeterId = await GlImportService.buildGlIdToMeterIdMap(allGlIds);

      // 3. Importar leituras
      const importResult = await GlImportService.importRows(allRows, glIdToMeterId, skipLog);
      imported = importResult.imported;
      skipped += importResult.skipped;
      errors += importResult.errors;

      console.log(
        `[GL Import] Resultado: importadas=${imported} | descartadas=${skipped} | erros=${errors}`,
      );

      if (skipLog.length > 0) {
        console.warn(
          `[GL Import] Log de descartes (primeiros ${Math.min(skipLog.length, 20)}):\n` +
            skipLog.slice(0, 20).join('\n') +
            (skipLog.length > 20 ? `\n... (+${skipLog.length - 20} mais)` : ''),
        );
      }

      // 4. Gravar log de execução
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
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GL Import] Falha crítica: ${message}`);

      await GlImportService.saveImportLog({
        executedAt,
        filesFound,
        filesProcessed,
        rowsTotal,
        imported,
        skipped,
        errors,
        skipLog,
        errorMessage: message,
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
        error: message,
      };
    }
  }
}
