// Análise (somente leitura) de permissões órfãs:
// - Permissions cujo roleId não existe em Roles
// - RoleAssignments cujo roleId/userId não existem
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db('AcquaXControl_PRD');
  const roleIds = new Set((await db.collection('Roles').find({}, { projection: { _id: 1 } }).toArray()).map(r => r._id.toString()));
  const userIds = new Set((await db.collection('User').find({}, { projection: { _id: 1 } }).toArray()).map(u => u._id.toString()));

  const perms = await db.collection('Permissions').find({}).toArray();
  const orphanPerms = perms.filter(p => !p.roleId || !roleIds.has(p.roleId.toString()));
  console.log(`Permissions: ${perms.length} total, ${orphanPerms.length} órfãs (roleId inexistente)`);

  let orphanRa = 0, orphanRaUser = 0, totalRa = 0;
  await db.collection('RoleAssignment').find({}).forEach(ra => {
    totalRa++;
    if (!ra.roleId || !roleIds.has(ra.roleId.toString())) orphanRa++;
    else if (!ra.userId || !userIds.has(ra.userId.toString())) orphanRaUser++;
  });
  console.log(`RoleAssignment: ${totalRa} total, ${orphanRa} com roleId inexistente, ${orphanRaUser} com userId inexistente`);
  await client.close();
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
