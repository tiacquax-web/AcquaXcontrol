const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const idx = await db.collection('ApartmentConsumptionReports').listIndexes().toArray();
  idx.forEach(i => console.log('  ', JSON.stringify(i.key), i.unique ? '[unique]' : ''));
  const st = await db.command({ collStats: 'ApartmentConsumptionReports' });
  console.log('size:', (st.size/1048576).toFixed(0), 'MB | storage:', (st.storageSize/1048576).toFixed(0), 'MB | indexes:', (st.totalIndexSize/1048576).toFixed(0), 'MB');
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
