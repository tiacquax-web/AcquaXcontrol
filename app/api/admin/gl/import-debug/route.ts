/**
 * POST /api/admin/gl/import-debug
 *
 * Importa UM dia específico com log verboso de cada passo.
 * Mostra exatamente onde o processo para e por quê.
 *
 * Body: { date: "YYYY-MM-DD", dryRun?: boolean }
 * - dryRun=true  → faz tudo (S3, parse, lookup) mas NÃO salva no banco
 * - dryRun=false → salva no banco (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync } from 'zlib';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: authErr } = await validateUserSession(req);
    if (authErr || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { default: prisma } = await import('@/lib/prisma');

    let body: any = {};
    try { body = await req.json(); } catch {}

    const dateStr  = (body.date ?? new Date().toISOString().slice(0, 10)) as string;
    const dryRun   = body.dryRun !== false; // default: true (seguro)
    const log: string[] = [];

    const step = (msg: string) => { log.push(`[${new Date().toISOString().slice(11,19)}] ${msg}`); };

    step(`=== IMPORT DEBUG para ${dateStr} | dryRun=${dryRun} ===`);

    // ── Credenciais ────────────────────────────────────────────────────────────
    const region = process.env.GL_S3_REGION;
    const keyId  = process.env.GL_S3_ACCESS_KEY_ID ?? process.env.GL_ACESS_KEY_ID;
    const secret = process.env.GL_S3_SECRET_ACCESS_KEY ?? process.env.GL_S3_SECRET_ACESS_KEY;
    const bucket = process.env.GL_S3_BUCKET;
    const pfx    = process.env.GL_S3_PATH_PREFIX ?? 'events';

    step(`Credenciais: region=${region ?? 'AUSENTE'} bucket=${bucket ?? 'AUSENTE'} key=${keyId ? keyId.slice(0,4)+'...' : 'AUSENTE'} secret=${secret ? 'presente' : 'AUSENTE'}`);

    if (!region || !keyId || !secret || !bucket) {
      return NextResponse.json({ ok: false, error: 'Credenciais S3 ausentes', log });
    }

    const s3 = new S3Client({ region, credentials: { accessKeyId: keyId, secretAccessKey: secret } });

    // ── Listagem ───────────────────────────────────────────────────────────────
    const date = new Date(dateStr + 'T12:00:00Z');
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const prefix = `${pfx}/${y}/${m}/${d}/`;

    step(`Listando S3: s3://${bucket}/${prefix}`);
    let s3Keys: string[];
    try {
      const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
      s3Keys = (resp.Contents ?? []).map(o => o.Key!).filter(Boolean);
      step(`Arquivos encontrados: ${s3Keys.length} → ${s3Keys.join(', ') || '(nenhum)'}`);
    } catch (e: any) {
      step(`ERRO ao listar S3: ${e.message}`);
      return NextResponse.json({ ok: false, error: e.message, log });
    }

    if (s3Keys.length === 0) {
      step(`ZERO arquivos para ${dateStr} — sem dados no S3 para este dia`);
      return NextResponse.json({ ok: true, imported: 0, skipped: 0, note: 'Sem arquivos no S3 para esta data', log });
    }

    // ── Download + parse de todos os arquivos ──────────────────────────────────
    interface ParsedRow {
      remote_id: string;
      device_id: string;
      reading: number;
      readAt: Date;
      readAtDate: string;
    }

    const allRows: ParsedRow[] = [];

    for (const key of s3Keys) {
      step(`Baixando: ${key}`);
      try {
        const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!resp.Body) throw new Error('Body vazio');
        const chunks: Uint8Array[] = [];
        for await (const c of resp.Body as AsyncIterable<Uint8Array>) chunks.push(c);
        const buf = Buffer.concat(chunks);
        const raw = key.endsWith('.gz') ? gunzipSync(buf) : buf;
        const content = raw.toString('utf-8');

        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
        const idxRId = headers.indexOf('remote_id');
        const idxDId = headers.indexOf('device_id');
        const idxR   = headers.indexOf('reading');
        const idxDt  = headers.indexOf('reading_date');

        step(`  Headers (${headers.length}): ${headers.slice(0,8).join('|')} | idxRemoteId=${idxRId} idxReading=${idxR} idxDate=${idxDt}`);

        if (idxRId === -1 || idxR === -1 || idxDt === -1) {
          step(`  ERRO: cabeçalho inválido — pulando arquivo`);
          continue;
        }

        let parsed = 0, failed = 0;
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(';');
          const remote_id = cells[idxRId]?.trim() ?? '';
          const device_id = cells[idxDId]?.trim() ?? '';
          const readingRaw = cells[idxR]?.trim() ?? '';
          const dateRaw = cells[idxDt]?.trim() ?? '';
          if (!remote_id || !dateRaw) { failed++; continue; }
          const reading = parseFloat(readingRaw);
          if (isNaN(reading)) { failed++; continue; }
          let readAt: Date;
          try {
            const iso = dateRaw.replace(' ', 'T').replace(/\+00$/, '+00:00').replace(/([+-]\d{2})$/, '$1:00');
            readAt = new Date(iso);
            if (isNaN(readAt.getTime())) throw new Error('inválida');
          } catch { failed++; continue; }
          allRows.push({ remote_id, device_id, reading, readAt, readAtDate: readAt.toISOString().slice(0, 10) });
          parsed++;
        }
        step(`  Parseadas: ${parsed} | Falhas: ${failed}`);
      } catch (e: any) {
        step(`  ERRO download/parse: ${e.message}`);
      }
    }

    step(`Total linhas parseadas de todos os arquivos: ${allRows.length}`);

    if (allRows.length === 0) {
      step('ZERO linhas parseadas — verificar formato CSV');
      return NextResponse.json({ ok: false, error: 'Zero linhas parseadas', log });
    }

    // Amostra dos remote_ids únicos
    const uniqueRemoteIds = [...new Set(allRows.map(r => r.remote_id))];
    step(`remote_ids únicos no CSV: ${uniqueRemoteIds.length} | Amostra: ${uniqueRemoteIds.slice(0, 5).join(', ')}`);

    // ── Lookup glIds → meterId ─────────────────────────────────────────────────
    step(`Buscando no banco meters com glId IN [${uniqueRemoteIds.slice(0,3).join(',')}...] (${uniqueRemoteIds.length} ids)`);

    const metersFound = await prisma.meter.findMany({
      where: { glId: { in: uniqueRemoteIds }, deletedAt: null },
      select: { id: true, glId: true, register: true, apartmentId: true, blockId: true, complexId: true, companyId: true },
    });

    step(`Meters encontrados no banco: ${metersFound.length} de ${uniqueRemoteIds.length} glIds`);

    if (metersFound.length === 0) {
      // Diagnóstico adicional
      const totalMeters = await prisma.meter.count({ where: { deletedAt: null } });
      const metersWithGlId = await prisma.meter.count({ where: { deletedAt: null, glId: { not: null } } });
      const sampleGlIds = await prisma.meter.findMany({
        where: { deletedAt: null, glId: { not: null } },
        select: { glId: true, register: true },
        take: 5,
      });
      step(`DIAGNÓSTICO: total meters=${totalMeters} | com glId=${metersWithGlId}`);
      step(`Amostra glIds no banco: ${sampleGlIds.map(m => `${m.register}=${m.glId}`).join(', ') || '(nenhum)'}`);
      step(`PROBLEMA: meter.glId não está preenchido ou os valores não batem com remote_id do CSV`);
      step(`CSV remote_id amostra: ${uniqueRemoteIds.slice(0,5).join(', ')}`);
      return NextResponse.json({ ok: false, error: 'ZERO glIds encontrados no banco', log, uniqueRemoteIdsSample: uniqueRemoteIds.slice(0,10), metersWithGlId, sampleGlIds });
    }

    const glIdMap = new Map(metersFound.map(m => [m.glId!.trim(), m]));
    const matchedRows = allRows.filter(r => glIdMap.has(r.remote_id.trim()));
    const skippedRows = allRows.filter(r => !glIdMap.has(r.remote_id.trim()));

    step(`Linhas com match: ${matchedRows.length} | Sem match (descartadas): ${skippedRows.length}`);
    step(`Amostra descartados remote_id: ${[...new Set(skippedRows.slice(0,3).map(r=>r.remote_id))].join(', ')}`);

    if (matchedRows.length === 0) {
      step('PROBLEMA: Nenhuma linha com glId encontrado — verifique os valores de meter.glId no banco');
      return NextResponse.json({ ok: false, error: 'Zero linhas com glId encontrado', log });
    }

    // ── Salvar no banco ────────────────────────────────────────────────────────
    if (dryRun) {
      step(`DRY RUN — não salvando no banco. ${matchedRows.length} readings seriam importadas.`);
      step(`Amostra: meterId=${matchedRows[0] ? glIdMap.get(matchedRows[0].remote_id.trim())?.id.slice(-8) : '?'} reading=${matchedRows[0]?.reading} readAt=${matchedRows[0]?.readAt.toISOString()}`);
      return NextResponse.json({ ok: true, dryRun: true, would_import: matchedRows.length, skipped: skippedRows.length, log });
    }

    step(`Salvando ${matchedRows.length} readings no banco...`);

    const readingsData = matchedRows.map(row => {
      const meterData = glIdMap.get(row.remote_id.trim())!;
      const yyyy = String(row.readAt.getUTCFullYear());
      const mm   = String(row.readAt.getUTCMonth() + 1).padStart(2, '0');
      return {
        reading:         row.reading,
        readAt:          row.readAt,
        readAtDate:      row.readAtDate,
        monthRef:        mm,
        yearRef:         yyyy,
        meterId:         meterData.id,
        registerName:    row.remote_id,
        remoteId:        row.device_id,
        isManualReading: false,
        isPreReading:    false,
        deletedAt:       null,
        apartmentId:     meterData.apartmentId ?? null,
        blockId:         meterData.blockId ?? null,
        complexId:       meterData.complexId ?? null,
        companyId:       meterData.companyId ?? null,
      };
    });

    try {
      // Cast para any: o $extends do Prisma client perde a tipagem de skipDuplicates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (prisma as any).reading.createMany({ data: readingsData, skipDuplicates: true });
      step(`✅ Salvo com sucesso: ${result.count} readings inseridas`);
      return NextResponse.json({ ok: true, imported: result.count, skipped: skippedRows.length, log });
    } catch (e: any) {
      step(`❌ ERRO AO SALVAR: ${e.message}`);
      step(`Stack: ${e.stack?.slice(0, 500)}`);
      return NextResponse.json({ ok: false, error: `Erro ao salvar: ${e.message}`, log });
    }

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e), stack: e.stack?.slice(0,500) }, { status: 500 });
  }
}
