// Uso: node scripts/db-audit/list-indexes.js (usa DATABASE_URL do ambiente)
const { MongoClient } = require('mongodb');
(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Defina DATABASE_URL'); process.exit(1); }
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  for (const coll of ['Apartments', 'Blocks', 'Complexes', 'User', 'Meters', 'RoleAssignment', 'Permissions', 'ApartmentConsumptionReports']) {
    const idx = await db.collection(coll).listIndexes().toArray();
    const count = await db.collection(coll).countDocuments({});
    console.log(`\n== ${coll} (${count} docs) ==`);
    idx.forEach(i => console.log('  ', JSON.stringify(i.key), i.unique ? '[unique]' : ''));
  }
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
