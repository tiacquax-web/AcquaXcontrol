/**
 * Atualiza o papel Programador para acesso total ao sistema,
 * exceto deleção de usuários (protege o admin).
 */

const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/acquax?directConnection=true';

// Permissões completas para o Programador
// user: create, read, update — mas NÃO delete (proteção ao admin)
const PROGRAMADOR_PERMISSIONS = {
  company:                    ['create','read','update','delete'],
  complex:                    ['create','read','update','delete'],
  block:                      ['create','read','update','delete'],
  apartment:                  ['create','read','update','delete'],
  user:                       ['create','read','update'],        // ⚠️ SEM delete
  role:                       ['create','read','update','delete'],
  roleAssignment:             ['create','read','update','delete'],
  permission:                 ['create','read','update','delete'],
  typeMeter:                  ['create','read','update','delete'],
  meter:                      ['create','read','update','delete'],
  iotDevice:                  ['create','read','update','delete'],
  reading:                    ['create','read','update','delete'],
  meterDeviceLink:            ['create','read','update','delete'],
  dealershipReading:          ['create','read','update','delete','do'],
  apartmentConsumptionReport: ['create','read','update','delete','do'],
  dealership:                 ['create','read','update','delete'],
  reservoir:                  ['create','read','update','delete'],
  reservoirReading:           ['create','read','update','delete'],
  scheduledTask:              ['create','read','update','delete'],
  recurringSchedule:          ['create','read','update','delete'],
  scheduleOverride:           ['create','read','update','delete'],
  monitoringDashboard:        ['read','do'],
  generateFilipeta:           ['do'],
};

async function main() {
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB\n');

    const db = client.db();

    // Buscar o papel Programador
    const role = await db.collection('Roles').findOne({ name: 'Programador', deletedAt: null });
    if (!role) {
      console.error('❌ Papel "Programador" não encontrado!');
      return;
    }
    console.log(`✅ Papel encontrado: ${role.name} (ID: ${role._id})`);

    // Buscar admin para usar como updater
    const adminUser = await db.collection('User').findOne({ email: 'admin@acquax.com', deletedAt: null });
    const now = new Date();

    // Remover todas as permissões antigas do Programador
    const deleted = await db.collection('Permissions').deleteMany({ roleId: role._id });
    console.log(`🗑️  ${deleted.deletedCount} permissões antigas removidas`);

    // Atualizar descrição do papel
    await db.collection('Roles').updateOne(
      { _id: role._id },
      { $set: {
        description: 'Acesso completo ao sistema. Pode criar, editar e gerenciar todos os recursos, exceto excluir usuários.',
        updatedAt: now,
        updatedByUserId: adminUser._id,
      }}
    );

    // Inserir novas permissões
    let total = 0;
    for (const [entity, actions] of Object.entries(PROGRAMADOR_PERMISSIONS)) {
      for (const action of actions) {
        await db.collection('Permissions').insertOne({
          _id: uuidv4(),
          roleId: role._id,
          entity,
          action,
          description: `${action} ${entity}`,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          createdByUserId: adminUser._id,
          updatedByUserId: adminUser._id,
        });
        total++;
      }
    }

    console.log(`✅ ${total} novas permissões criadas para o Programador`);
    console.log('\n📋 Resumo das permissões do Programador:');
    for (const [entity, actions] of Object.entries(PROGRAMADOR_PERMISSIONS)) {
      console.log(`   ${entity}: [${actions.join(', ')}]`);
    }
    console.log('\n🔒 Proteção ativa: usuário "Programador" NÃO pode excluir usuários (admin protegido)');

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
