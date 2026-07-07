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
  console.log(`📅 Processando ${dateStr} (prefix: ${prefix})`);

  const listRes = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.GL_S3_BUCKET, Prefix: prefix,
  }));
  const keys = (listRes.Contents || []).map(o => o.Key).filter(Boolean);
  console.log(`  Arquivos: ${keys.length}`);
  if (keys.length === 0) { console.log('  Nenhum arquivo.'); return; }

  const allRows = [];
  for (const key of keys) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.GL_S3_BUCKET, Key: key }));
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const content = gunzipSync(Buffer.concat(chunks)).toString('utf-8');
      const rows = parseCsv(content);
      allRows.push(...rows);
      console.log(`  ${key}: ${rows.length} linhas`);
    } catch (e) { console.error(`  ❌ ${key}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`  Total: ${allRows.length} linhas`);

  const remoteIds = [...new Set(allRows.map(r => r.remote_id.trim()).filter(Boolean))];
  const meters = await prisma.meter.findMany({ where: { glId: { in: remoteIds }, deletedAt: null }, select: { id: true, glId: true } });
  const glMap = new Map();
  meters.forEach(m => { if (m.glId) glMap.set(m.glId.trim(), m.id); });
  console.log(`  Medidores: ${glMap.size} / ${remoteIds.length} remote_ids`);

  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const uniqueMeterIds = [...glMap.values()];
  const metersData = await prisma.meter.findMany({ where: { id: { in: uniqueMeterIds } }, select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true } });
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
      createdByUserId: admin.id, deletedAt: null,
      apartmentId: md?.apartmentId || null, blockId: md?.blockId || null,
      complexId: md?.complexId || null, companyId: md?.companyId || null,
    });
  }
  console.log(`  Inserindo: ${readings.length} leituras em lotes de ${BATCH_SIZE}...`);

  let imported = 0, errors = 0;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const batch = readings.slice(i, i + BATCH_SIZE);
    try {
      const r = await prisma.reading.createMany({ data: batch });
      imported += r.count;
      process.stdout.write('.');
    } catch (e) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${i}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`\n  ✅ ${dateStr}: imported=${imported} | errors=${errors} | skipped=${skipped}`);

  try {
    await prisma.glImportLog.create({ data: { executedAt: new Date(), filesFound: keys.length, filesProcessed: keys.length, rowsTotal: allRows.length, imported, skipped, errors, skipLog: [] } });
  } catch (e) { console.error('  Log error:', e.message); }

  await prisma.$disconnect();
}

processDay('2026-07-03').catch(e => { console.error('FATAL:', e); process.exit(1); });
