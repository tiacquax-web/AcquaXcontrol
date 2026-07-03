const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const roles = await db.collection('Roles').find({}).toArray();
  let fixed = 0;

  for (const role of roles) {
    const updates = {};
    
    // Check each date field
    for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
      const val = role[field];
      if (val === null) continue; // null is fine
      if (typeof val === 'string') {
        // Convert string to Date object
        updates[field] = new Date(val);
        console.log(`  Fixing ${role.name}.${field}: "${val}" → Date object`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('Roles').updateOne(
        { _id: role._id },
        { $set: updates }
      );
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} role documents`);

  // Verify
  const after = await db.collection('Roles').find({}).toArray();
  after.forEach(r => {
    const types = ['createdAt', 'updatedAt', 'deletedAt'].map(f => 
      `${f}: ${typeof r[f] === 'object' && r[f] !== null ? (r[f] instanceof Date ? 'Date' : 'Timestamp') : typeof r[f]}`
    );
    console.log(`  ${r.name}: ${types.join(', ')}`);
  });

  await client.close();
}
main().catch(e => console.error(e));
