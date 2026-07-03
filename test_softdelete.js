const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // 1. Find soft-deleted complexes
  const deletedComplexes = await db.collection('Complexes').find({ 
    deletedAt: { $type: "date" } 
  }).toArray();
  console.log(`Soft-deleted Complexes: ${deletedComplexes.length}`);
  for (const c of deletedComplexes.slice(0, 5)) {
    console.log(`  ${c.socialName} | deletedAt=${c.deletedAt} | aliasName=${c.aliasName}`);
    
    // Check if there's an active complex with the same socialName
    const active = await db.collection('Complexes').findOne({ 
      socialName: c.socialName, 
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] 
    });
    console.log(`    Active with same socialName: ${active ? active.socialName + ' (' + active.id + ')' : 'NONE'}`);
  }

  // 2. Find soft-deleted blocks
  const deletedBlocks = await db.collection('Blocks').find({ 
    deletedAt: { $type: "date" } 
  }).toArray();
  console.log(`\nSoft-deleted Blocks: ${deletedBlocks.length}`);
  for (const b of deletedBlocks.slice(0, 5)) {
    console.log(`  ${b.name} | complexId=${b.complexId} | deletedAt=${b.deletedAt}`);
  }

  // 3. Find soft-deleted apartments
  const deletedApts = await db.collection('Apartments').find({ 
    deletedAt: { $type: "date" } 
  }).toArray();
  console.log(`\nSoft-deleted Apartments: ${deletedApts.length}`);
  for (const a of deletedApts.slice(0, 5)) {
    console.log(`  ${a.name} | blockId=${a.blockId} | deletedAt=${a.deletedAt}`);
  }

  // 4. Find soft-deleted users
  const deletedUsers = await db.collection('User').find({ 
    deletedAt: { $type: "date" } 
  }).toArray();
  console.log(`\nSoft-deleted Users: ${deletedUsers.length}`);
  for (const u of deletedUsers.slice(0, 5)) {
    console.log(`  ${u.email} | name=${u.name} | deletedAt=${u.deletedAt}`);
    
    // Check if there's an active user with the same email
    const active = await db.collection('User').findOne({ 
      email: u.email, 
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] 
    });
    console.log(`    Active with same email: ${active ? active.email + ' (' + active.id + ')' : 'NONE'}`);
  }

  // 5. Check for records where deletedAt is stored as STRING (bug from migration)
  const stringDeletedComplexes = await db.collection('Complexes').find({ 
    deletedAt: { $type: "string" } 
  }).toArray();
  console.log(`\nComplexes with STRING deletedAt (BUG): ${stringDeletedComplexes.length}`);
  for (const c of stringDeletedComplexes) {
    console.log(`  ${c.socialName} | deletedAt=${c.deletedAt} (STRING!)`);
  }

  const stringDeletedUsers = await db.collection('User').find({ 
    deletedAt: { $type: "string" } 
  }).toArray();
  console.log(`\nUsers with STRING deletedAt (BUG): ${stringDeletedUsers.length}`);
  for (const u of stringDeletedUsers) {
    console.log(`  ${u.email} | deletedAt=${u.deletedAt} (STRING!)`);
  }

  await client.close();
}
main().catch(e => console.error(e));
