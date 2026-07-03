const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Only check collections likely to have soft-delete string dates
  const targetCols = ['Companies', 'RoleAssignment', 'Roles', 'User', 'Complexes', 'Blocks', 'Apartments', 'Meters', 'TypeMeters', 'Dealerships', 'DealershipReadings', 'Reservoirs', 'IotDevices', 'Permissions', 'Sessions'];
  let totalFixed = 0;

  for (const colName of targetCols) {
    // Use filter to find only docs with string dates (more efficient)
    const cursor = db.collection(colName).find({
      $or: [
        { createdAt: { $type: 'string' } },
        { updatedAt: { $type: 'string' } },
        { deletedAt: { $type: 'string' } },
      ]
    });

    let fixed = 0;
    let doc;
    while ((doc = await cursor.next()) !== null) {
      const updates = {};
      for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
        if (typeof doc[field] === 'string') {
          updates[field] = new Date(doc[field]);
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
    } else {
      console.log(`  ✅ ${colName}: clean`);
    }
  }

  console.log(`\n✅ Total: ${totalFixed} documents fixed`);
  await client.close();
}
main().catch(e => console.error(e));
