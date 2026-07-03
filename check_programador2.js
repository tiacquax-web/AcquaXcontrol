const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Check a sample RoleAssignment with system context
  const sampleRA = await db.collection('RoleAssignment').findOne({
    contextType: 'system',
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  });
  console.log('Sample RoleAssignment:');
  console.log(JSON.stringify(sampleRA, null, 2));

  // Check all roles
  const allRoles = await db.collection('Role').find({}).limit(20).toArray();
  console.log('\nAll Roles:');
  allRoles.forEach(r => {
    console.log(`  _id=${r._id} (${typeof r._id}) id=${r.id} name="${r.name}" deletedAt=${r.deletedAt}`);
  });

  // Check RoleAssignment roleId types
  const systemRAs = await db.collection('RoleAssignment').find({
    contextType: 'system',
  }).limit(5).toArray();
  console.log('\nSystem RoleAssignments (roleId details):');
  systemRAs.forEach(ra => {
    console.log(`  _id=${ra._id} userId=${ra.userId} roleId=${ra.roleId} (${typeof ra.roleId}) contextType=${ra.contextType}`);
  });

  await client.close();
}
main().catch(e => console.error(e));
