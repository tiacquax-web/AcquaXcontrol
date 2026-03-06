const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const ATLAS_URL = 'mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol';

// =====================================================
// SÍNDICO e ADMINISTRADORA:
// Podem VER (read) dados do condomínio atribuído.
// SEM: usuários, papéis, agendamentos.
// COM: filipeta (gerar/visualizar).
// =====================================================
const SINDICO_ADMIN_PERMISSIONS = [
  // Estrutura do condomínio
  { entity: 'complex',                      action: 'read' },
  { entity: 'block',                        action: 'read' },
  { entity: 'apartment',                    action: 'read' },
  // Medição e leituras
  { entity: 'meter',                        action: 'read' },
  { entity: 'typeMeter',                    action: 'read' },
  { entity: 'reading',                      action: 'read' },
  { entity: 'dealership',                   action: 'read' },
  { entity: 'dealershipReading',            action: 'read' },
  { entity: 'meterDeviceLink',              action: 'read' },
  // Relatórios
  { entity: 'apartmentConsumptionReport',   action: 'read' },
  { entity: 'apartmentConsumptionReport',   action: 'do'   },
  // Monitoramento
  { entity: 'monitoringDashboard',          action: 'read' },
  { entity: 'monitoringDashboard',          action: 'do'   },
  { entity: 'reservoir',                    action: 'read' },
  { entity: 'reservoirReading',             action: 'read' },
  // Filipeta (gerar/visualizar a do condomínio)
  { entity: 'generateFilipeta',             action: 'do'   },
  // IoT
  { entity: 'iotDevice',                    action: 'read' },
  // SEM: user, role, roleAssignment, scheduledTask, recurringSchedule, scheduleOverride
];

// =====================================================
// MORADOR:
// Pode VER apenas dados da sua unidade (apartamento).
// PODE: ver filipeta da sua unidade.
// SEM: reservatórios, monitoramento, usuários, papéis, agendamentos.
// =====================================================
const MORADOR_PERMISSIONS = [
  { entity: 'apartment',                    action: 'read' },
  { entity: 'meter',                        action: 'read' },
  { entity: 'reading',                      action: 'read' },
  { entity: 'apartmentConsumptionReport',   action: 'read' },
  { entity: 'apartmentConsumptionReport',   action: 'do'   },
  // Filipeta da sua unidade
  { entity: 'generateFilipeta',             action: 'do'   },
  // SEM: monitoringDashboard, reservoir, reservoirReading, user, role, roleAssignment,
  //      scheduledTask, recurringSchedule, iotDevice, dealership, dealershipReading
];

async function updateRolePermissions(db, roleName, permissions, adminId) {
  const role = await db.collection('Roles').findOne({ name: roleName, deletedAt: null });
  if (!role) {
    console.error(`❌ Papel "${roleName}" não encontrado!`);
    return;
  }

  const roleId = role._id;

  // Soft-delete todas as permissões antigas
  const deleted = await db.collection('Permissions').updateMany(
    { roleId, deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date(), updatedByUserId: adminId } }
  );
  console.log(`  🗑️  ${deleted.modifiedCount} permissões antigas removidas`);

  // Criar novas permissões
  const now = new Date();
  const newPerms = permissions.map(p => ({
    _id: uuidv4(),
    id: uuidv4(),
    roleId,
    entity: p.entity,
    action: p.action,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    createdByUserId: adminId,
    updatedByUserId: adminId,
  }));

  await db.collection('Permissions').insertMany(newPerms);
  console.log(`  ✅ ${newPerms.length} permissões criadas para "${roleName}"`);

  // Atualizar descrição do papel
  const descriptions = {
    'Síndico': 'Visualiza dados dos condomínios atribuídos (sem usuários, papéis ou agendamentos). Somente leitura.',
    'Administradora': 'Visualiza dados dos condomínios atribuídos (sem usuários, papéis ou agendamentos). Somente leitura.',
    'Morador': 'Visualiza apenas os dados da sua unidade: apartamento, medidores, leituras, relatório e filipeta. Somente leitura.',
  };
  if (descriptions[roleName]) {
    await db.collection('Roles').updateOne(
      { _id: roleId },
      { $set: { description: descriptions[roleName], updatedAt: now, updatedByUserId: adminId } }
    );
  }
}

async function main() {
  const client = new MongoClient(ATLAS_URL);
  try {
    await client.connect();
    console.log('✅ Conectado ao Atlas\n');
    const db = client.db('acquax');
    const adminId = 'afb2c57c-fcb1-4cb0-b021-68a813c298e9';

    console.log('📋 Atualizando permissões do SÍNDICO...');
    await updateRolePermissions(db, 'Síndico', SINDICO_ADMIN_PERMISSIONS, adminId);

    console.log('\n📋 Atualizando permissões da ADMINISTRADORA...');
    await updateRolePermissions(db, 'Administradora', SINDICO_ADMIN_PERMISSIONS, adminId);

    console.log('\n📋 Atualizando permissões do MORADOR...');
    await updateRolePermissions(db, 'Morador', MORADOR_PERMISSIONS, adminId);

    // Verificação final
    console.log('\n📊 Resumo final:');
    for (const roleName of ['Síndico', 'Administradora', 'Morador']) {
      const role = await db.collection('Roles').findOne({ name: roleName, deletedAt: null });
      const count = await db.collection('Permissions').countDocuments({ roleId: role._id, deletedAt: null });
      const actions = await db.collection('Permissions').distinct('action', { roleId: role._id, deletedAt: null });
      console.log(`  ${roleName}: ${count} permissões | ações: ${actions.join(', ')}`);
    }

    console.log('\n✅ Permissões atualizadas com sucesso!');
  } finally {
    await client.close();
  }
}

main().catch(console.error);
