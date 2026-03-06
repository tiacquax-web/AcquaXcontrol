/**
 * Script para criar Role de Administrador com TODAS as permissões
 * e atribuir ao usuário admin@acquax.com
 */

const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/acquax?replicaSet=rs0&directConnection=true';

const ALL_ENTITIES = [
  'company', 'complex', 'block', 'apartment',
  'user', 'role', 'roleAssignment', 'permission',
  'typeMeter', 'meter', 'iotDevice',
  'reading', 'meterDeviceLink',
  'dealershipReading', 'apartmentConsumptionReport', 'dealership',
  'reservoir', 'reservoirReading',
  'scheduledTask', 'recurringSchedule', 'scheduleOverride',
  'monitoringDashboard', 'generateFilipeta',
];

const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'do'];

async function main() {
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB');

    const db = client.db();

    // 1. Buscar o usuário admin
    const adminUser = await db.collection('User').findOne({ email: 'admin@acquax.com', deletedAt: null });
    if (!adminUser) {
      console.error('❌ Usuário admin@acquax.com não encontrado!');
      return;
    }
    console.log('✅ Usuário admin encontrado:', adminUser.name);

    // 2. Verificar se o Role de Admin já existe
    let adminRole = await db.collection('Roles').findOne({ name: 'Administrador', deletedAt: null });

    if (!adminRole) {
      // 3. Criar o Role de Administrador
      const roleId = uuidv4();
      const now = new Date();
      await db.collection('Roles').insertOne({
        _id: roleId,
        name: 'Administrador',
        description: 'Acesso total ao sistema',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        createdByUserId: adminUser._id,
        updatedByUserId: adminUser._id,
      });
      adminRole = { _id: roleId };
      console.log('✅ Role "Administrador" criado! ID:', roleId);
    } else {
      console.log('ℹ️  Role "Administrador" já existe. ID:', adminRole._id);
    }

    // 4. Criar todas as permissões para o Role
    let permsCriadas = 0;
    let permsExistentes = 0;
    const now = new Date();

    for (const entity of ALL_ENTITIES) {
      for (const action of ALL_ACTIONS) {
        const existing = await db.collection('Permissions').findOne({
          roleId: adminRole._id,
          entity,
          action,
          deletedAt: null,
        });

        if (!existing) {
          await db.collection('Permissions').insertOne({
            _id: uuidv4(),
            roleId: adminRole._id,
            entity,
            action,
            description: `${action} ${entity}`,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdByUserId: adminUser._id,
            updatedByUserId: adminUser._id,
          });
          permsCriadas++;
        } else {
          permsExistentes++;
        }
      }
    }
    console.log(`✅ Permissões criadas: ${permsCriadas} | Já existiam: ${permsExistentes}`);

    // 5. Atribuir o Role ao usuário admin no contexto "system"
    const existingAssignment = await db.collection('RoleAssignment').findOne({
      userId: adminUser._id,
      roleId: adminRole._id,
      contextType: 'system',
      deletedAt: null,
    });

    if (!existingAssignment) {
      await db.collection('RoleAssignment').insertOne({
        _id: uuidv4(),
        userId: adminUser._id,
        roleId: adminRole._id,
        contextId: 'system',
        contextType: 'system',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        createdByUserId: adminUser._id,
        updatedByUserId: adminUser._id,
      });
      console.log('✅ Role atribuído ao usuário admin no contexto "system"!');
    } else {
      console.log('ℹ️  Role já estava atribuído ao usuário admin.');
    }

    console.log('\n🎉 Pronto! O administrador agora tem acesso total ao sistema.');
    console.log('   Faça logout e login novamente para ver as mudanças.\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
