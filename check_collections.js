const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = await db.listCollections().toArray();
  console.log("Collections in DB:");
  for (const c of collections) {
    console.log(`  ${c.name}`);
  }

  // Check indexes for the actual collection names
  for (const c of collections) {
    if (c.name.startsWith('_') || c.name.includes('gl_') || c.name.includes('email') || c.name.includes('session')) continue;
    try {
      const indexes = await db.collection(c.name).indexes();
      const uniqueIndexes = indexes.filter(i => i.unique);
      if (uniqueIndexes.length > 0) {
        console.log(`\n=== ${c.name} === (unique indexes only)`);
        for (const idx of uniqueIndexes) {
          console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
        }
      }
    } catch(e) {}
  }

  await client.close();
}
main().catch(e => console.error(e));
