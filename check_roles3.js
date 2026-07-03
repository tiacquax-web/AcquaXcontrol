const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // List all collections
  const collections = await db.listCollections().toArray();
  console.log('Collections:');
  collections.forEach(c => console.log(`  ${c.name}`));

  // Try different collection names for Role
  for (const name of ['Role', 'role', 'roles', 'RoleModel']) {
    const count = await db.collection(name).countDocuments();
    console.log(`\n${name}: ${count} documents`);
    if (count > 0) {
      const docs = await db.collection(name).find({}).limit(5).toArray();
      docs.forEach(d => console.log(`  ${JSON.stringify({ _id: d._id, id: d.id, name: d.name, deletedAt: d.deletedAt })}`));
    }
  }

  await client.close();
}
main().catch(e => console.error(e));
