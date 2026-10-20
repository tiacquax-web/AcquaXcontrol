// Backup JSON de coleções pequenas que podem ser afetadas por manutenção.
// Uso: node scripts/db-audit/backup-small-colls.js [pasta_destino]
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

function serialize(doc) {
  if (doc === null || typeof doc !== 'object') return doc;
  if (Array.isArray(doc)) return doc.map(serialize);
  if (doc instanceof ObjectId) return { __oid: doc.toString() };
  const out = {};
  for (const [k, v] of Object.entries(doc)) out[k] = serialize(v);
  return out;
}

(async () => {
  const dest = process.env.BACKUP_DIR || path.join(__dirname, 'backups', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(dest, { recursive: true });
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  for (const coll of ['Permissions', 'RoleAssignment', 'Roles']) {
    const docs = await db.collection(coll).find({}).toArray();
    fs.writeFileSync(path.join(dest, `${coll}.json`), JSON.stringify(docs.map(serialize), null, 1));
    console.log(`${coll}: ${docs.length} docs -> ${dest}/${coll}.json`);
  }
  await client.close();
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
