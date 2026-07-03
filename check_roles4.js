const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const count = await db.collection('Roles').countDocuments();
  console.log(`Roles collection: ${count} documents`);
  const docs = await db.collection('Roles').find({}).toArray();
  docs.forEach(d => {
    console.log(`  _id=${d._id} id=${d.id} name="${d.name}" deletedAt=${d.deletedAt}`);
  });

  // Now check what roleId values are used in RoleAssignment
  const distinctRoleIds = await db.collection('RoleAssignment').distinct('roleId');
  console.log('\nDistinct roleIds in RoleAssignment:', distinctRoleIds.length);
  distinctRoleIds.forEach(id => console.log(`  ${id} (${typeof id})`));

  // Check if any roleId matches Roles._id or Roles.id
  const roleIds = docs.map(d => d._id?.toString());
  const roleIdsField = docs.map(d => d.id?.toString());
  distinctRoleIds.forEach(rid => {
    const matchId = roleIds.includes(rid);
    const matchField = roleIdsField.includes(rid);
    console.log(`  roleId ${rid}: matches _id=${matchId}, matches id=${matchField}`);
  });

  await client.close();
}
main().catch(e => console.error(e));
