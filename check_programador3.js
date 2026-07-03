const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Get all system RoleAssignments with user email and role name
  const systemRAs = await db.collection('RoleAssignment').find({
    contextType: 'system',
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  }).toArray();

  console.log('System RoleAssignments:');
  for (const ra of systemRAs) {
    const user = await db.collection('User').findOne({ _id: ra.userId });
    const role = await db.collection('Roles').findOne({ _id: ra.roleId });
    console.log(`  ${user?.email ?? 'N/A'} → role="${role?.name ?? 'N/A'}" (roleId=${ra.roleId})`);
  }

  // Also check if admin@acquax.com has any other role assignments
  const adminUser = await db.collection('User').findOne({ email: 'admin@acquax.com' });
  if (adminUser) {
    const adminRAs = await db.collection('RoleAssignment').find({
      userId: adminUser._id,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    }).toArray();
    console.log(`\nadmin@acquax.com all role assignments (${adminRAs.length}):`);
    for (const ra of adminRAs) {
      const role = await db.collection('Roles').findOne({ _id: ra.roleId });
      console.log(`  role="${role?.name ?? 'N/A'}" contextType=${ra.contextType} contextId=${ra.contextId}`);
    }
  }

  await client.close();
}
main().catch(e => console.error(e));
