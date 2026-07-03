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
  return rows;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const userId = admin.id;
  console.log('Using userId:', userId);

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
    const readAtDate = row.reading_date;
    const yyyy = String(readAt.getUTCFullYear());
    const mm = String(readAt.getUTCMonth() + 1).padStart(2, '0');

    readingsToCreate.push({
      reading: parseFloat(row.reading),
      readAt,
      readAtDate,
      monthRef: mm,
      yearRef: yyyy,
      meterId,
      registerName: row.remote_id,
      remoteId: row.device_id,
      isManualReading: false,
      isPreReading: false,
    });
  }

  console.log('readingsToCreate:', readingsToCreate.length);
  console.log('sample:', readingsToCreate[0]);

  // Check for invalid dates
  const invalidDates = readingsToCreate.filter(r => isNaN(r.readAt.getTime()));
  console.log('Invalid readAt dates:', invalidDates.length);

  // Now replicate the exact bulkCreateEntity reading-case logic
  const uniqueMeterIds = [...new Set(readingsToCreate.map(r => r.meterId))].filter(id => id);
  const metersData = await prisma.meter.findMany({
    where: { id: { in: uniqueMeterIds } },
    select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true },
  });
  const meterDataMap = new Map(metersData.map(m => [m.id, m]));

  let thrown = null;
  let readingsWithDenormalizedFields;
  try {
    readingsWithDenormalizedFields = readingsToCreate.map(reading => {
      const meterData = reading.meterId ? meterDataMap.get(reading.meterId) : null;
      if (reading.meterId && !meterData) {
        throw new Error(`Meter ${reading.meterId} not found or no permission`);
      }
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
    console.log('✅ Map succeeded, count:', readingsWithDenormalizedFields.length);
  } catch (e) {
    thrown = e;
    console.log('❌ Map threw:', e.message);
  }

  if (!thrown) {
    try {
      const result = await prisma.reading.createMany({ data: readingsWithDenormalizedFields });
      console.log('✅ createMany succeeded:', result);
    } catch (e) {
      console.log('❌ createMany FAILED:', e.message);
      console.log(e.stack?.split('\n').slice(0,8).join('\n'));
    }
  }

  await prisma.$disconnect();
}
main().catch(e => console.error('FATAL:', e));
