const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { gunzipSync } = require('zlib');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const client = new S3Client({
  region: process.env.GL_S3_REGION,
  credentials: { accessKeyId: process.env.GL_S3_ACCESS_KEY_ID, secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY },
});

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const header = lines[0].split(';').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const row = {};
    header.forEach((h, idx) => row[h] = cols[idx]);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const userId = admin.id;

  const key = 'events/2026/07/02/a619dee9_events_20260702100030.csv.gz';
  const cmd = new GetObjectCommand({ Bucket: process.env.GL_S3_BUCKET, Key: key });
  const res = await client.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const content = gunzipSync(buffer).toString('utf-8');
  const rows = parseCsv(content);

  const remoteIds = [...new Set(rows.map(r => r.remote_id?.trim()).filter(Boolean))];
  const meters = await prisma.meter.findMany({ where: { glId: { in: remoteIds }, deletedAt: null }, select: { id: true, glId: true } });
  const glIdToMeterId = new Map();
  meters.forEach(m => { if (m.glId) glIdToMeterId.set(m.glId.trim(), m.id); });

  const readingsToCreate = [];
  for (const row of rows) {
    const meterId = glIdToMeterId.get(row.remote_id?.trim());
    if (!meterId) continue;
    const readAt = new Date(row.reading_time);
    const yyyy = String(readAt.getUTCFullYear());
    const mm = String(readAt.getUTCMonth() + 1).padStart(2, '0');
    readingsToCreate.push({
      reading: parseFloat(row.reading), readAt, readAtDate: row.reading_date,
      monthRef: mm, yearRef: yyyy, meterId, registerName: row.remote_id, remoteId: row.device_id,
      isManualReading: false, isPreReading: false,
      createdByUserId: userId, deletedAt: null,
    });
  }

  console.log('Total to insert:', readingsToCreate.length);

  // IMPORTANT: use a UNIQUE marker so we can clean up test data after
  const TEST_MARKER = 'TEST_BATCH_' + Date.now();
  readingsToCreate.forEach(r => r.name = TEST_MARKER);

  const BATCH_SIZE = 1000;
  let totalInserted = 0;
  const start = Date.now();
  for (let i = 0; i < readingsToCreate.length; i += BATCH_SIZE) {
    const batch = readingsToCreate.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.reading.createMany({ data: batch });
      totalInserted += result.count;
      process.stdout.write(`.`);
    } catch (e) {
      console.log(`\n❌ Batch ${i}-${i+batch.length} failed: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`\n✅ Total inserted: ${totalInserted} / ${readingsToCreate.length} in ${Date.now()-start}ms`);

  // Cleanup test data
  const del = await prisma.reading.deleteMany({ where: { name: TEST_MARKER } });
  console.log(`🧹 Cleaned up ${del.count} test records`);

  await prisma.$disconnect();
}
main().catch(e => console.error('FATAL:', e));
