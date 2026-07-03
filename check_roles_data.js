const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const roles = await db.collection('Roles').find({}).toArray();
  roles.forEach(r => {
    console.log(`\n${r.name}:`);
    console.log(`  createdAt: ${JSON.stringify(r.createdAt)} (${typeof r.createdAt})`);
    console.log(`  updatedAt: ${JSON.stringify(r.updatedAt)} (${typeof r.updatedAt})`);
    console.log(`  deletedAt: ${JSON.stringify(r.deletedAt)} (${typeof r.deletedAt})`);
  });

  await client.close();
}
main().catch(e => console.error(e));
