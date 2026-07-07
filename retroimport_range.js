const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { gunzipSync } = require('zlib');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BATCH_SIZE = 500;
const s3 = new S3Client({ region: process.env.GL_S3_REGION, credentials: { accessKeyId: process.env.GL_S3_ACCESS_KEY_ID, secretAccessKey: process.env.GL_S3_SECRET_ACCESS_KEY } });

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const iR = headers.indexOf('remote_id'), iD = headers.indexOf('device_id'), iV = headers.indexOf('reading'), iDt = headers.indexOf('reading_date');
  if (iR === -1 || iV === -1 || iDt === -1) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';');
    const remote_id = c[iR]?.trim() ?? '', device_id = c[iD]?.trim() ?? '', v = c[iV]?.trim() ?? '', dt = c[iDt]?.trim() ?? '';
    if (!remote_id || !dt) continue;
    const reading = parseFloat(v);
    if (isNaN(reading)) continue;
    let readAt;
    try { readAt = new Date(dt.replace(' ','T').replace(/\+00$/,'+00:00').replace(/([+-]\d{2})$/,'$1:00')); if (isNaN(readAt.getTime())) throw 0; } catch { continue; }
    rows.push({ remote_id, device_id, reading, readAt, readAtDate: readAt.toISOString().slice(0,10) });
  }
  return rows;
}

async function processDay(ds) {
  const prefix = `events/${ds.replace(/-/g,'/')}/`;
  console.log(`\n📅 ${ds}`);
  const lr = await s3.send(new ListObjectsV2Command({ Bucket: process.env.GL_S3_BUCKET, Prefix: prefix }));
  const keys = (lr.Contents||[]).map(o=>o.Key).filter(Boolean);
  if (!keys.length) { console.log('  Nenhum arquivo.'); return { date: ds, imported: 0, errors: 0, skipped: 0 }; }
  const allRows = [];
  for (const key of keys) {
    try { const o = await s3.send(new GetObjectCommand({ Bucket: process.env.GL_S3_BUCKET, Key: key })); const ch=[]; for await (const c of o.Body) ch.push(c); allRows.push(...parseCsv(gunzipSync(Buffer.concat(ch)).toString('utf-8'))); }
    catch(e) { console.error(`  ❌ ${key}: ${e.message.split('\n')[0]}`); }
  }
  const rids = [...new Set(allRows.map(r=>r.remote_id.trim()).filter(Boolean))];
  const meters = await prisma.meter.findMany({ where: { glId: { in: rids }, deletedAt: null }, select: { id: true, glId: true } });
  const gm = new Map(); meters.forEach(m=>{ if(m.glId) gm.set(m.glId.trim(), m.id); });
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const mds = await prisma.meter.findMany({ where: { id: { in: [...gm.values()] } }, select: { id: true, apartmentId: true, blockId: true, complexId: true, companyId: true } });
  const mdm = new Map(mds.map(m=>[m.id,m]));
  let skipped=0; const readings=[];
  for (const row of allRows) {
    const mid = gm.get(row.remote_id.trim()); if (!mid) { skipped++; continue; }
    const md = mdm.get(mid);
    readings.push({ reading: row.reading, readAt: row.readAt, readAtDate: row.readAtDate, monthRef: String(row.readAt.getUTCMonth()+1).padStart(2,'0'), yearRef: String(row.readAt.getUTCFullYear()), meterId: mid, registerName: row.remote_id, remoteId: row.device_id, isManualReading: false, isPreReading: false, createdByUserId: admin.id, deletedAt: null, apartmentId: md?.apartmentId||null, blockId: md?.blockId||null, complexId: md?.complexId||null, companyId: md?.companyId||null });
  }
  console.log(`  ${readings.length} leituras, ${skipped} skip`);
  let imported=0, errors=0;
  for (let i=0; i<readings.length; i+=BATCH_SIZE) {
    try { const r = await prisma.reading.createMany({ data: readings.slice(i, i+BATCH_SIZE) }); imported += r.count; process.stdout.write('.'); }
    catch(e) { errors += readings.slice(i,i+BATCH_SIZE).length; console.error(`\n  ❌ Batch ${i}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`\n  ✅ imported=${imported} errors=${errors} skipped=${skipped}`);
  try { await prisma.glImportLog.create({ data: { executedAt: new Date(), filesFound: keys.length, filesProcessed: keys.length, rowsTotal: allRows.length, imported, skipped, errors, skipLog: [] } }); } catch {}
  return { date: ds, imported, errors, skipped };
}

async function main() {
  const dates = process.argv.slice(2);
  console.log(`🚀 Importando ${dates.length} dia(s): ${dates.join(', ')}`);
  for (const d of dates) { try { await processDay(d); } catch(e) { console.error(`❌ ${d}: ${e.message}`); } }
  await prisma.$disconnect();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
