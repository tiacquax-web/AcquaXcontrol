const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const collections = ['User', 'RoleAssignment', 'Complexes', 'Blocks', 'Apartments', 'Companies', 'Meters', 'DealershipReadings', 'ApartmentConsumptionReports'];
  
  for (const colName of collections) {
    const docs = await db.collection(colName).find({}).limit(50).toArray();
    let stringDates = 0;
    
    for (const doc of docs) {
      for (const field of ['createdAt', 'updatedAt', 'deletedAt']) {
        const val = doc[field];
        if (val !== null && val !== undefined && typeof val === 'string') {
          console.log(`  ❌ ${colName}._id=${doc._id}: ${field}="${val}" (string)`);
          stringDates++;
        }
      }
    }
    
    if (stringDates === 0) {
      console.log(`✅ ${colName}: ${docs.length} docs checked, no string dates`);
    }
  }

  await client.close();
}
main().catch(e => console.error(e));
