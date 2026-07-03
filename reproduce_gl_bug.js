const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { gunzipSync } = require('zlib');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const client = new S3Client({
  region: process.env.GL_S3_REGION,
  credentials: {
    accessKeyId: process.env.GL_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY,
  },
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
  return { header, rows };
}

async function main() {
  const key = 'events/2026/07/02/a619dee9_events_20260702100030.csv.gz';
  const cmd = new GetObjectCommand({ Bucket: process.env.GL_S3_BUCKET, Key: key });
  const res = await client.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const content = gunzipSync(buffer).toString('utf-8');

  const { header, rows } = parseCsv(content);
  console.log('Header:', header);
  console.log('Total rows:', rows.length);
  console.log('Sample row:', rows[0]);

  // Get unique remote_ids
  const remoteIds = [...new Set(rows.map(r => r.remote_id?.trim()).filter(Boolean))];
  console.log('Unique remote_ids:', remoteIds.length);

  const meters = await prisma.meter.findMany({
    where: { glId: { in: remoteIds }, deletedAt: null },
    select: { id: true, glId: true },
  });
  console.log('Meters found by glId:', meters.length);

  const glIdToMeterId = new Map();
  meters.forEach(m => { if (m.glId) glIdToMeterId.set(m.glId.trim(), m.id); });

  // Build candidate readings
  const matchedMeterIds = new Set();
  let matched = 0, unmatched = 0;
  for (const row of rows) {
    const mid = glIdToMeterId.get(row.remote_id?.trim());
    if (mid) { matched++; matchedMeterIds.add(mid); }
    else unmatched++;
  }
  console.log(`Matched: ${matched} | Unmatched: ${unmatched}`);
  console.log('Unique matched meterIds:', matchedMeterIds.size);

  // Now check if ALL matched meterIds actually exist in a plain meter.findMany WITHOUT glId filter (like bulkCreateEntity does)
  const uniqueMeterIdsArr = [...matchedMeterIds];
  const metersData = await prisma.meter.findMany({
    where: { id: { in: uniqueMeterIdsArr } },
    select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true, deletedAt: true },
  });
  console.log('metersData found (2nd query, by id):', metersData.length, 'of', uniqueMeterIdsArr.length);

  if (metersData.length !== uniqueMeterIdsArr.length) {
    const foundIds = new Set(metersData.map(m => m.id));
    const missing = uniqueMeterIdsArr.filter(id => !foundIds.has(id));
    console.log('❌ MISSING meterIds in 2nd query:', missing.slice(0, 10));

    // check those missing meters directly, bypassing soft-delete middleware assumption
    for (const mid of missing.slice(0, 5)) {
      const m = await prisma.meter.findUnique({ where: { id: mid } });
      console.log(`  meter ${mid}:`, m ? `deletedAt=${m.deletedAt}` : 'NOT FOUND AT ALL');
    }
  } else {
    console.log('✅ All matched meterIds found consistently');
  }

  await prisma.$disconnect();
}
main().catch(e => console.error('FATAL:', e));
