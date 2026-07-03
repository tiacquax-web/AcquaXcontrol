const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = ['Complex', 'Block', 'Apartment', 'User', 'Role', 'Company', 'Meter', 'Reservoir'];
  for (const col of collections) {
    try {
      const indexes = await db.collection(col).indexes();
      console.log(`\n=== ${col} ===`);
      for (const idx of indexes) {
        console.log(`  ${idx.name}: ${JSON.stringify(idx.key)} unique=${idx.unique || false}`);
      }
    } catch(e) {
      console.log(`\n=== ${col} === ERROR: ${e.message}`);
    }
  }

  await client.close();
}
main().catch(e => console.error(e));
