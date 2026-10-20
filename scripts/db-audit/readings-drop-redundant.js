// Remove índices REDUNDANTES POR PREFIXO da coleção Readings.
// Um índice {a} é 100% coberto por {a,b}: qualquer query que usaria {a} usa o prefixo de {a,b}.
// Nenhum é unique. Zero risco de perda de dados. As linhas @@index correspondentes
// foram removidas de prisma/schema.prisma na mesma mudança.
// Rollback: scripts/db-audit/backups/readings-rollback-indexes.txt
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DROPS = [
  { name: 'Readings_readAt_idx', spec: { readAt: 1 } },
  { name: 'Readings_deletedAt_readAt_idx', spec: { deletedAt: 1, readAt: 1 } },
  { name: 'Readings_meterId_idx', spec: { meterId: 1 } },
  { name: 'Readings_deviceId_deletedAt_idx', spec: { deviceId: 1, deletedAt: 1 } },
  { name: 'Readings_deviceId_idx', spec: { deviceId: 1 } },
  { name: 'Readings_deletedAt_idx', spec: { deletedAt: 1 } },
  { name: 'Readings_nextReadingDate_idx', spec: { nextReadingDate: 1 } },
];

(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const coll = db.collection('Readings');

  const rollback = DROPS.map(d => `db.Readings.createIndex(${JSON.stringify(d.spec)}, {name: "${d.name}"})`).join('\n');
  const rpath = path.join(__dirname, 'backups', 'readings-rollback-indexes.txt');
  fs.mkdirSync(path.dirname(rpath), { recursive: true });
  fs.writeFileSync(rpath, rollback + '\n');

  const before = (await db.command({ collStats: 'Readings' })).totalIndexSize / 1048576;
  for (const d of DROPS) {
    try {
      await coll.dropIndex(d.name);
      console.log(`DROP OK  ${d.name}`);
    } catch (e) {
      console.log(`DROP FALHOU ${d.name}: ${e.message.slice(0, 80)}`);
    }
  }
  const after = (await db.command({ collStats: 'Readings' })).totalIndexSize / 1048576;
  console.log(`\nIndexSize Readings: ${before.toFixed(0)} MB -> ${after.toFixed(0)} MB (liberado ${(before - after).toFixed(0)} MB)`);
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
