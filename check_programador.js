const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Buscar roles com nome "Programador" ou similar
  const roles = await db.collection('Role').find({
    $or: [
      { name: /programador/i },
      { name: /administrador/i }
    ],
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  }).toArray();
  console.log('Roles encontradas:');
  roles.forEach(r => console.log(`  ${r._id} → name="${r.name}"`));

  // Buscar role assignments com contextType "system"
  const systemAssignments = await db.collection('RoleAssignment').find({
    contextType: 'system',
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  }).toArray();
  console.log('\nRoleAssignments com contextType=system:', systemAssignments.length);
  
  for (const ra of systemAssignments) {
    const role = await db.collection('Role').findOne({ _id: ra.roleId });
    const user = await db.collection('User').findOne({ _id: ra.userId });
    console.log(`  User: ${user?.email} → Role: "${role?.name}" → contextType: ${ra.contextType}`);
  }

  await client.close();
}
main().catch(e => console.error(e));
