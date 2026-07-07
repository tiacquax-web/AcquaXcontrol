// Importação retroativa local — processa dias perdidos do GL
// Roda com o código NOVO (batched createMany) direto do sandbox

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { gunzipSync } = require('zlib');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

const s3 = new S3Client({
  region: process.env.GL_S3_REGION,
  credentials: {
    accessKeyId: process.env.GL_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY,
  },
});

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const idxRemoteId = headers.indexOf('remote_id');
  const idxDeviceId = headers.indexOf('device_id');
  const idxReading = headers.indexOf('reading');
  const idxReadingDate = headers.indexOf('reading_date');
  if (idxRemoteId === -1 || idxReading === -1 || idxReadingDate === -1) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';');
    const remote_id = cells[idxRemoteId]?.trim() ?? '';
    const device_id = cells[idxDeviceId]?.trim() ?? '';
    const readingRaw = cells[idxReading]?.trim() ?? '';
    const dateRaw = cells[idxReadingDate]?.trim() ?? '';
    if (!remote_id || !dateRaw) continue;
    const reading = parseFloat(readingRaw);
    if (isNaN(reading)) continue;
    let readAt;
    try {
      const iso = dateRaw.replace(' ', 'T').replace(/\+00$/, '+00:00').replace(/([+-]\d{2})$/, '$1:00');
      readAt = new Date(iso);
      if (isNaN(readAt.getTime())) throw new Error('bad date');
    } catch { continue; }
    rows.push({ remote_id, device_id, reading, readAt, readAtDate: readAt.toISOString().slice(0,10) });
  }
  return rows;
}

async function processDay(dateStr) {
  const prefix = `events/${dateStr.replace(/-/g, '/')}/`;
  console.log(`\n📅 Processando ${dateStr} (prefix: ${prefix})`);

  // List files
  const listRes = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.GL_S3_BUCKET,
    Prefix: prefix,
  }));
  const keys = (listRes.Contents || []).map(o => o.Key).filter(Boolean);
  console.log(`  Arquivos: ${keys.length}`);
  if (keys.length === 0) return { date: dateStr, files: 0, rows: 0, imported: 0, skipped: 0, errors: 0 };

  // Download + parse all files
  const allRows = [];
  for (const key of keys) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.GL_S3_BUCKET, Key: key }));
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const content = gunzipSync(buf).toString('utf-8');
      const rows = parseCsv(content);
      allRows.push(...rows);
      console.log(`  ${key}: ${rows.length} linhas`);
    } catch (e) {
      console.error(`  ❌ Erro no arquivo ${key}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`  Total de linhas: ${allRows.length}`);

  // Build glId → meterId map
  const remoteIds = [...new Set(allRows.map(r => r.remote_id.trim()).filter(Boolean))];
  const meters = await prisma.meter.findMany({
    where: { glId: { in: remoteIds }, deletedAt: null },
    select: { id: true, glId: true },
  });
  const glMap = new Map();
  meters.forEach(m => { if (m.glId) glMap.set(m.glId.trim(), m.id); });
  console.log(`  Medidores matched: ${glMap.size} / ${remoteIds.length} remote_ids`);

  // Build readings array with denormalized fields
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const userId = admin.id;

  const uniqueMeterIds = [...new Set([...glMap.values()])];
  const metersData = await prisma.meter.findMany({
    where: { id: { in: uniqueMeterIds } },
    select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true },
  });
  const meterDataMap = new Map(metersData.map(m => [m.id, m]));

  let skipped = 0;
  const readings = [];
  for (const row of allRows) {
    const meterId = glMap.get(row.remote_id.trim());
    if (!meterId) { skipped++; continue; }
    const yyyy = String(row.readAt.getUTCFullYear());
    const mm = String(row.readAt.getUTCMonth() + 1).padStart(2, '0');
    const md = meterDataMap.get(meterId);
    readings.push({
      reading: row.reading, readAt: row.readAt, readAtDate: row.readAtDate,
      monthRef: mm, yearRef: yyyy, meterId,
      registerName: row.remote_id, remoteId: row.device_id,
      isManualReading: false, isPreReading: false,
      createdByUserId: userId, deletedAt: null,
      apartmentId: md?.apartmentId || null, blockId: md?.blockId || null,
      complexId: md?.complexId || null, companyId: md?.companyId || null,
    });
  }

  console.log(`  Leituras para inserir: ${readings.length} | skip: ${skipped}`);

  // Batched insert
  let imported = 0, errors = 0;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const batch = readings.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.reading.createMany({ data: batch });
      imported += result.count;
      process.stdout.write('.');
    } catch (e) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${i} falhou: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`\n  ✅ ${dateStr}: imported=${imported} | errors=${errors} | skipped=${skipped}`);

  // Save import log
  try {
    await prisma.glImportLog.create({
      data: {
        executedAt: new Date(),
        filesFound: keys.length, filesProcessed: keys.length,
        rowsTotal: allRows.length, imported, skipped, errors,
        skipLog: [],
      },
    });
  } catch (e) { console.error('  Erro ao salvar log:', e.message); }

  return { date: dateStr, files: keys.length, rows: allRows.length, imported, skipped, errors };
}

async function main() {
  // Dias perdidos: 22/06 a 03/07
  const dates = [
    '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
    '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30',
    '2026-07-01', '2026-07-02', '2026-07-03',
  ];

  console.log(`🚀 Iniciando importação retroativa: ${dates.length} dias`);
  const results = [];
  for (const d of dates) {
    try {
      const r = await processDay(d);
      results.push(r);
    } catch (e) {
      console.error(`❌ Falha no dia ${d}: ${e.message}`);
      results.push({ date: d, files: 0, rows: 0, imported: 0, skipped: 0, errors: 0 });
    }
  }

  console.log('\n\n=== RESUMO ===');
  let totalImported = 0, totalErrors = 0, totalSkipped = 0;
  results.forEach(r => {
    console.log(`  ${r.date}: imported=${r.imported} | errors=${r.errors} | skipped=${r.skipped}`);
    totalImported += r.imported;
    totalErrors += r.errors;
    totalSkipped += r.skipped;
  });
  console.log(`\n  TOTAL: imported=${totalImported} | errors=${totalErrors} | skipped=${totalSkipped}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
