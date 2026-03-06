/**
 * Migra todos os dados do MongoDB local para o MongoDB Atlas
 */

const { MongoClient } = require('mongodb');

const LOCAL_URL = 'mongodb://127.0.0.1:27017/acquax?directConnection=true';
const ATLAS_URL = 'mongodb+srv://ruivagiulia_db_user:TA6sFicLYx36r7LF@acquaxcontrol.btmiqax.mongodb.net/acquax?appName=acquaxcontrol';

const COLLECTIONS = [
  'User',
  'Sessions',
  'Roles',
  'Permissions',
  'RoleAssignment',
  'Companies',
  'Complexes',
  'Blocks',
  'Apartments',
  'TypeMeters',
  'Meters',
  'Readings',
];

async function migrate() {
  const localClient = new MongoClient(LOCAL_URL);
  const atlasClient = new MongoClient(ATLAS_URL);

  try {
    await localClient.connect();
    console.log('✅ Conectado ao MongoDB local');

    await atlasClient.connect();
    console.log('✅ Conectado ao MongoDB Atlas\n');

    const localDb = localClient.db('acquax');
    const atlasDb = atlasClient.db('acquax');

    // Listar coleções que realmente existem no local
    const existingCollections = await localDb.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);
    console.log('📦 Coleções encontradas no local:', existingNames.join(', '));

    for (const colName of existingNames) {
      const localCol = localDb.collection(colName);
      const atlasCol = atlasDb.collection(colName);

      const docs = await localCol.find({}).toArray();

      if (docs.length === 0) {
        console.log(`   ⏭️  ${colName}: vazia, pulando`);
        continue;
      }

      // Limpar coleção no Atlas antes de inserir
      await atlasCol.deleteMany({});

      // Inserir documentos no Atlas
      const result = await atlasCol.insertMany(docs);
      console.log(`   ✅ ${colName}: ${result.insertedCount} documentos migrados`);
    }

    console.log('\n🎉 Migração concluída com sucesso!');

    // Verificar dados no Atlas
    console.log('\n📊 Verificando dados no Atlas:');
    for (const colName of existingNames) {
      const count = await atlasDb.collection(colName).countDocuments();
      if (count > 0) console.log(`   ${colName}: ${count} documentos`);
    }

  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    process.exit(1);
  } finally {
    await localClient.close();
    await atlasClient.close();
  }
}

migrate();
