/**
 * GET /api/admin/gl/test-full
 *
 * Endpoint de teste E2E da integração GL.
 * Executa cada etapa de forma isolada e reporta exatamente onde falha.
 *
 * Etapas testadas:
 *  A. Credenciais S3 (env vars)
 *  B. Listagem de arquivos S3 (para data especificada em ?date=YYYY-MM-DD)
 *  C. Download + parse do primeiro arquivo CSV
 *  D. Lookup de glIds no banco (quantos remote_ids encontram meter)
 *  E. Estado do banco: medidores com glId, readings existentes
 *  F. Teste de escrita: salva 1 reading de teste e apaga em seguida
 *
 * Usar: GET /api/admin/gl/test-full?date=2026-06-18
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string | null): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date();
  return new Date(s + 'T12:00:00Z');
}

function buildPrefix(date: Date): string {
  const prefix = process.env.GL_S3_PATH_PREFIX ?? 'events';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${prefix}/${y}/${m}/${d}/`;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: authErr } = await validateUserSession(req);
    if (authErr || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { default: prisma } = await import('@/lib/prisma');
    const testDate = parseDate(req.nextUrl.searchParams.get('date'));

    const report: Record<string, any> = {
      testDate: testDate.toISOString().slice(0, 10),
    };

    // ── A. Env vars ───────────────────────────────────────────────────────────
    const region    = process.env.GL_S3_REGION;
    const keyId     = process.env.GL_S3_ACCESS_KEY_ID   ?? process.env.GL_ACESS_KEY_ID;
    const secret    = process.env.GL_S3_SECRET_ACCESS_KEY ?? process.env.GL_S3_SECRET_ACESS_KEY;
    const bucket    = process.env.GL_S3_BUCKET;
    const pathPfx   = process.env.GL_S3_PATH_PREFIX ?? 'events';

    report.A_envVars = {
      GL_S3_REGION:     region     ? `✅ ${region}`                          : '❌ AUSENTE',
      GL_S3_BUCKET:     bucket     ? `✅ ${bucket}`                          : '❌ AUSENTE',
      GL_ACCESS_KEY_ID: keyId      ? `✅ ${keyId.slice(0,4)}...`             : '❌ AUSENTE',
      GL_SECRET_KEY:    secret     ? `✅ (${secret.length} chars)`           : '❌ AUSENTE',
      GL_S3_PATH_PREFIX: pathPfx,
      allPresent: !!(region && keyId && secret && bucket),
    };

    if (!report.A_envVars.allPresent) {
      report.PAROU_EM = 'A — Credenciais S3 ausentes';
      return NextResponse.json(report);
    }

    // ── B. Listagem S3 ────────────────────────────────────────────────────────
    let s3Keys: string[] = [];
    try {
      const s3 = new S3Client({ region: region!, credentials: { accessKeyId: keyId!, secretAccessKey: secret! } });
      const prefix = buildPrefix(testDate);
      const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket!, Prefix: prefix }));
      s3Keys = (resp.Contents ?? []).map(o => o.Key!).filter(Boolean);
      report.B_s3List = {
        prefix,
        arquivosEncontrados: s3Keys.length,
        keys: s3Keys.slice(0, 10),
        isTruncated: resp.IsTruncated,
        status: s3Keys.length > 0 ? `✅ ${s3Keys.length} arquivos` : '⚠️ 0 arquivos (data sem dados no S3)',
      };
    } catch (e: any) {
      report.B_s3List = { status: `❌ ERRO: ${e.message}`, code: e.Code ?? e.code ?? e.name };
      report.PAROU_EM = 'B — Falha ao listar S3';
      return NextResponse.json(report);
    }

    if (s3Keys.length === 0) {
      report.PAROU_EM = 'B — Nenhum arquivo no S3 para esta data. Tente outra data (ex: ontem).';
      report.sugestao = 'Use ?date=YYYY-MM-DD com uma data que tenha dados no S3';
      return NextResponse.json(report);
    }

    // ── C. Download + parse ───────────────────────────────────────────────────
    const firstKey = s3Keys[0];
    let csvRows: any[] = [];
    try {
      const s3 = new S3Client({ region: region!, credentials: { accessKeyId: keyId!, secretAccessKey: secret! } });
      const resp = await s3.send(new GetObjectCommand({ Bucket: bucket!, Key: firstKey }));
      if (!resp.Body) throw new Error('Body vazio');
      const chunks: Uint8Array[] = [];
      for await (const c of resp.Body as AsyncIterable<Uint8Array>) chunks.push(c);
      const buf = Buffer.concat(chunks);
      const raw = firstKey.endsWith('.gz') ? gunzipSync(buf) : buf;
      const content = raw.toString('utf-8');

      // Parse CSV
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const idxRemoteId = headers.indexOf('remote_id');
      const idxReading  = headers.indexOf('reading');
      const idxDate     = headers.indexOf('reading_date');
      const idxDeviceId = headers.indexOf('device_id');

      report.C_csvParse = {
        arquivo: firstKey,
        totalLinhas: lines.length - 1,
        headers,
        idxRemoteId, idxReading, idxDate, idxDeviceId,
        headerValido: idxRemoteId !== -1 && idxReading !== -1 && idxDate !== -1,
        primeiros3: lines.slice(1, 4),
      };

      if (!report.C_csvParse.headerValido) {
        report.PAROU_EM = 'C — Cabeçalho CSV inválido (remote_id/reading/reading_date não encontrados)';
        return NextResponse.json(report);
      }

      // Parse linhas
      for (let i = 1; i < Math.min(lines.length, 5001); i++) {
        const cells = lines[i].split(';');
        const remote_id = cells[idxRemoteId]?.trim() ?? '';
        const readingRaw = cells[idxReading]?.trim() ?? '';
        const dateRaw = cells[idxDate]?.trim() ?? '';
        if (!remote_id || !dateRaw) continue;
        const reading = parseFloat(readingRaw);
        if (isNaN(reading)) continue;
        csvRows.push({ remote_id, reading, dateRaw });
      }

      report.C_csvParse.linhasParseadas = csvRows.length;
      report.C_csvParse.remote_idAmostra = [...new Set(csvRows.slice(0, 5).map(r => r.remote_id))];
      report.C_csvParse.status = `✅ ${csvRows.length} linhas parseadas`;
    } catch (e: any) {
      report.C_csvParse = { status: `❌ ERRO: ${e.message}` };
      report.PAROU_EM = 'C — Falha no download/parse do CSV';
      return NextResponse.json(report);
    }

    // ── D. Lookup glIds no banco ──────────────────────────────────────────────
    const uniqueRemoteIds = [...new Set(csvRows.map(r => r.remote_id))];
    let glIdMap = new Map<string, string>();
    try {
      const metersFound = await prisma.meter.findMany({
        where: { glId: { in: uniqueRemoteIds }, deletedAt: null },
        select: { id: true, glId: true, register: true },
      });
      for (const m of metersFound) {
        if (m.glId) glIdMap.set(m.glId.trim(), m.id);
      }

      // Amostra dos que NÃO foram encontrados
      const notFound = uniqueRemoteIds.filter(id => !glIdMap.has(id)).slice(0, 10);
      const found    = uniqueRemoteIds.filter(id =>  glIdMap.has(id)).slice(0, 10);

      report.D_glIdLookup = {
        uniqueRemoteIdsNoCSV: uniqueRemoteIds.length,
        meteresEncontrados: glIdMap.size,
        taxaMatch: `${Math.round(glIdMap.size / uniqueRemoteIds.length * 100)}%`,
        amostraEncontrados: found,
        amostraNaoEncontrados: notFound,
        status: glIdMap.size > 0
          ? `✅ ${glIdMap.size} de ${uniqueRemoteIds.length} glIds encontrados no banco`
          : `❌ ZERO glIds encontrados! remote_ids CSV não batem com meter.glId no banco`,
      };

      // Diagnóstico adicional: o que está salvo como glId no banco?
      const metersWithGlId = await prisma.meter.findMany({
        where: { deletedAt: null, glId: { not: null } },
        select: { glId: true, register: true },
        take: 10,
      });
      report.D_glIdLookup.metersComGlIdNoBanco = metersWithGlId.map(m => ({ register: m.register, glId: m.glId }));
      report.D_glIdLookup.totalMetersComGlId = await prisma.meter.count({ where: { deletedAt: null, glId: { not: null } } });

    } catch (e: any) {
      report.D_glIdLookup = { status: `❌ ERRO: ${e.message}` };
      report.PAROU_EM = 'D — Falha no lookup de glIds';
      return NextResponse.json(report);
    }

    if (glIdMap.size === 0) {
      report.PAROU_EM = 'D — ZERO glIds encontrados. Meter.glId não está preenchido ou os valores não batem com o CSV.';
      return NextResponse.json(report);
    }

    // ── E. Estado do banco ────────────────────────────────────────────────────
    try {
      const totalReadings    = await prisma.reading.count({ where: { deletedAt: null } });
      const glMeterIds       = Array.from(glIdMap.values());
      const glReadingsCount  = await prisma.reading.count({ where: { deletedAt: null, meterId: { in: glMeterIds } } });
      const lastGlReading    = await prisma.reading.findFirst({
        where: { deletedAt: null, meterId: { in: glMeterIds } },
        orderBy: { readAt: 'desc' },
        select: { readAt: true, reading: true, meterId: true, registerName: true },
      });

      report.E_bancoDados = {
        totalReadingsNosBanco: totalReadings,
        readingsGL: glReadingsCount,
        ultimaReadingGL: lastGlReading,
        status: glReadingsCount > 0
          ? `✅ ${glReadingsCount} readings GL no banco`
          : `⚠️ 0 readings GL — importação ainda não foi executada ou todas falharam`,
      };
    } catch (e: any) {
      report.E_bancoDados = { status: `❌ ERRO: ${e.message}` };
    }

    // ── F. Teste de escrita ───────────────────────────────────────────────────
    // Pega o primeiro meter encontrado e tenta salvar + deletar uma reading de teste
    const testMeterId = Array.from(glIdMap.values())[0];
    const testGlId    = Array.from(glIdMap.entries())[0][0];
    try {
      const meterData = await prisma.meter.findUnique({
        where: { id: testMeterId },
        select: { id: true, register: true, apartmentId: true, blockId: true, complexId: true, companyId: true },
      });

      const testReading = await prisma.reading.create({
        data: {
          reading:         -9999.0,   // valor impossível para identificar como teste
          readAt:          new Date('2000-01-01T00:00:00Z'),
          readAtDate:      '2000-01-01',
          monthRef:        '01',
          yearRef:         '2000',
          meterId:         testMeterId,
          registerName:    testGlId,
          isManualReading: false,
          isPreReading:    false,
          deletedAt:       null,
          apartmentId:     meterData?.apartmentId ?? null,
          blockId:         meterData?.blockId ?? null,
          complexId:       meterData?.complexId ?? null,
          companyId:       meterData?.companyId ?? null,
        },
      });

      // Apaga imediatamente (soft-delete)
      await prisma.reading.update({
        where: { id: testReading.id },
        data: { deletedAt: new Date() },
      });

      report.F_testeEscrita = {
        status: '✅ Escrita no banco OK — reading de teste criada e deletada com sucesso',
        meterTestado: meterData?.register,
        readingId: testReading.id,
      };
    } catch (e: any) {
      report.F_testeEscrita = {
        status: `❌ FALHA NA ESCRITA: ${e.message}`,
        detalhe: 'O Prisma não consegue salvar readings — este é o bug que impede o import de funcionar',
      };
      report.PAROU_EM = 'F — Falha na escrita de readings no banco';
    }

    // ── Conclusão ─────────────────────────────────────────────────────────────
    if (!report.PAROU_EM) {
      report.CONCLUSAO = report.E_bancoDados?.readingsGL > 0
        ? '✅ TUDO OK — GL import deve funcionar. Se monitoring ainda não mostra dados, execute a Importação Retroativa.'
        : '⚠️ Import parece funcionar mas ainda não há readings GL. Execute a Importação Retroativa.';
    }

    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e), stack: e.stack }, { status: 500 });
  }
}
