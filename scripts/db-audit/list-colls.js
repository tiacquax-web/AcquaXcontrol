const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const colls = await db.listCollections().toArray();
  colls.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => console.log(c.name));
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
