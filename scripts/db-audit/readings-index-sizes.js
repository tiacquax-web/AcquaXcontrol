const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const st = await db.command({ collStats: 'Readings' });
  const sizes = st.indexSizes || {};
  const idx = await db.collection('Readings').listIndexes().toArray();
  const rows = idx.map(i => ({ name: i.name, key: JSON.stringify(i.key), unique: !!i.unique, mb: (sizes[i.name] || 0)/1048576 }))
    .sort((a, b) => b.mb - a.mb);
  let total = 0;
  for (const r of rows) { total += r.mb; console.log(`${r.mb.toFixed(0).padStart(5)} MB ${r.unique ? '[UQ]' : '    '} ${r.key}`); }
  console.log('TOTAL:', total.toFixed(0), 'MB em', rows.length, 'indices');
  await client.close();
})().catch(e => { console.error('ERRO', e.message.slice(-200)); process.exit(1); });
