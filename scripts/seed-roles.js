/**
 * Script para criar os Papéis (Roles) padrão do sistema Acqua-X
 * Papéis: Administrador, Síndico, Programador, Administradora, Morador
 */

const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/acquax?directConnection=true';

// Todas as ações e entidades possíveis
const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'do'];

// Definição dos papéis e suas permissões
const ROLES = [
  {
    name: 'Administrador',
    description: 'Acesso total ao sistema. Pode gerenciar todos os recursos.',
    permissions: {
      // Acesso total a tudo
      company:                    ['create','read','update','delete'],
      complex:                    ['create','read','update','delete'],
      block:                      ['create','read','update','delete'],
      apartment:                  ['create','read','update','delete'],
      user:                       ['create','read','update','delete'],
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
    }
  },
  {
    name: 'Síndico',
    description: 'Gerencia o condomínio. Acesso a leituras, relatórios, moradores e configurações do condomínio.',
    permissions: {
      complex:                    ['read','update'],
      block:                      ['read','update'],
      apartment:                  ['read','update'],
      user:                       ['create','read','update'],
      role:                       ['read'],
      roleAssignment:             ['create','read','update','delete'],
      typeMeter:                  ['read'],
      meter:                      ['create','read','update','delete'],
      reading:                    ['create','read','update','delete'],
      dealershipReading:          ['create','read','update','delete','do'],
      apartmentConsumptionReport: ['create','read','update','delete','do'],
      dealership:                 ['read'],
      reservoir:                  ['read','update'],
      reservoirReading:           ['create','read','update','delete'],
      scheduledTask:              ['create','read','update','delete'],
      monitoringDashboard:        ['read','do'],
      generateFilipeta:           ['do'],
    }
  },
  {
    name: 'Programador',
    description: 'Realiza a leitura dos medidores nos apartamentos.',
    permissions: {
      complex:                    ['read'],
      block:                      ['read'],
      apartment:                  ['read'],
      meter:                      ['read'],
      reading:                    ['create','read','update'],
      typeMeter:                  ['read'],
      monitoringDashboard:        ['read'],
    }
  },
  {
    name: 'Administradora',
    description: 'Empresa administradora do condomínio. Acesso gerencial amplo.',
    permissions: {
      company:                    ['read','update'],
      complex:                    ['create','read','update','delete'],
      block:                      ['create','read','update','delete'],
      apartment:                  ['create','read','update','delete'],
      user:                       ['create','read','update','delete'],
      role:                       ['read'],
      roleAssignment:             ['create','read','update','delete'],
      typeMeter:                  ['read'],
      meter:                      ['create','read','update','delete'],
      reading:                    ['read'],
      dealershipReading:          ['create','read','update','delete','do'],
      apartmentConsumptionReport: ['create','read','update','delete','do'],
      dealership:                 ['create','read','update','delete'],
      reservoir:                  ['read','update'],
      reservoirReading:           ['read'],
      monitoringDashboard:        ['read','do'],
      generateFilipeta:           ['do'],
    }
  },
  {
    name: 'Morador',
    description: 'Morador do apartamento. Visualiza apenas suas próprias leituras e consumo.',
    permissions: {
      apartment:                  ['read'],
      meter:                      ['read'],
      reading:                    ['read'],
      apartmentConsumptionReport: ['read'],
      monitoringDashboard:        ['read'],
    }
  },
];

async function main() {
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB\n');

    const db = client.db();

    // Buscar usuário admin para usar como criador
    const adminUser = await db.collection('User').findOne({ email: 'admin@acquax.com', deletedAt: null });
    if (!adminUser) {
      console.error('❌ Usuário admin@acquax.com não encontrado!');
      return;
    }

    const now = new Date();

    for (const roleDef of ROLES) {
      console.log(`\n📋 Processando papel: "${roleDef.name}"...`);

      // Verificar se já existe
      let role = await db.collection('Roles').findOne({ name: roleDef.name, deletedAt: null });

      if (!role) {
        const roleId = uuidv4();
        await db.collection('Roles').insertOne({
          _id: roleId,
          name: roleDef.name,
          description: roleDef.description,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          createdByUserId: adminUser._id,
          updatedByUserId: adminUser._id,
        });
        role = { _id: roleId };
        console.log(`   ✅ Papel criado! ID: ${roleId}`);
      } else {
        console.log(`   ℹ️  Papel já existe. ID: ${role._id}`);
      }

      // Criar permissões
      let criadas = 0;
      let existentes = 0;

      for (const [entity, actions] of Object.entries(roleDef.permissions)) {
        for (const action of actions) {
          const existing = await db.collection('Permissions').findOne({
            roleId: role._id,
            entity,
            action,
            deletedAt: null,
          });

          if (!existing) {
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
            criadas++;
          } else {
            existentes++;
          }
        }
      }

      console.log(`   ✅ Permissões: ${criadas} criadas | ${existentes} já existiam`);
    }

    // Confirmar papéis no banco
    const totalRoles = await db.collection('Roles').countDocuments({ deletedAt: null });
    console.log(`\n🎉 Concluído! Total de papéis no sistema: ${totalRoles}`);
    console.log('\nPapéis disponíveis:');
    const allRoles = await db.collection('Roles').find({ deletedAt: null }).toArray();
    allRoles.forEach(r => console.log(`  - ${r.name}: ${r.description}`));

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
