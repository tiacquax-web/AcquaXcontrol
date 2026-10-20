const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const st = await db.command({ collStats: 'Readings' });
  console.log('Readings:', st.count, 'docs | data', (st.size/1048576).toFixed(2), 'MB | storage', (st.storageSize/1048576).toFixed(0), 'MB | indexSize', (st.totalIndexSize/1048576).toFixed(0), 'MB');
  console.log('\n== $indexStats (desde o último restart do mongod) ==');
  const stats = await db.collection('Readings').aggregate([{ $indexStats: {} }]).toArray();
  for (const s of stats) {
    const k = Object.keys(s.key).map(f => f + (s.key[f] > 0 ? '↑' : '↓')).join(',');
    console.log(`${String(s.accesses.ops).padStart(8)} ops | ${String(s.accesses.since).slice(0,10)} | ${k}${s.unique ? ' [unique]' : ''}${s.name.startsWith('unique') || s.name.includes('_1_') ? '' : ''}`);
  }
  // uptime do servidor (janela de observação)
  const si = await db.command({ serverStatus: 1 });
  console.log('\nUptime do mongod:', Math.round(si.uptime/3600), 'horas | WiredTiger cache em uso:', (si.wiredTiger.cache['bytes currently in the cache']/1048576).toFixed(0), 'MB | max:', (si.wiredTiger.cache['maximum bytes configured']/1048576).toFixed(0), 'MB');
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
