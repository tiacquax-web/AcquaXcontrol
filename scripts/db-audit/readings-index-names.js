const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const idx = await db.collection('Readings').listIndexes().toArray();
  idx.forEach(i => console.log(`${i.name.padEnd(60)} ${JSON.stringify(i.key)}${i.unique ? ' [UQ]' : ''}`));
  await client.close();
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
