const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = await db.listCollections().toArray();
  const colNames = collections.map(c => c.name);
  let totalFixed = 0;

  for (const colName of colNames) {
    const docs = await db.collection(colName).find({}).toArray();
    let fixed = 0;

    for (const doc of docs) {
      const updates = {};
      for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
        const val = doc[field];
        if (val !== null && val !== undefined && typeof val === 'string') {
          updates[field] = new Date(val);
        }
      }
      if (Object.keys(updates).length > 0) {
        await db.collection(colName).updateOne({ _id: doc._id }, { $set: updates });
        fixed++;
      }
    }

    if (fixed > 0) {
      console.log(`  Fixed ${fixed} docs in ${colName}`);
      totalFixed += fixed;
    }
  }

  console.log(`\n✅ Total: ${totalFixed} documents fixed across all collections`);
  await client.close();
}
main().catch(e => console.error(e));
