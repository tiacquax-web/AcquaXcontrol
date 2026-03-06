const { MongoClient } = require('mongodb');

const LOCAL_URL = 'mongodb://127.0.0.1:27017/acquax?replicaSet=rs0&directConnection=true';
const ATLAS_URL = 'mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol';

const COLLECTIONS = ['User', 'Roles', 'Permissions', 'RoleAssignment', 'Sessions', 'Companies', 'Complexes'];

async function migrate() {
  console.log('🚀 Iniciando migração para MongoDB Atlas...\n');

  const localClient = new MongoClient(LOCAL_URL);
  const atlasClient = new MongoClient(ATLAS_URL);

  try {
    await localClient.connect();
    console.log('✅ Conectado ao MongoDB local');

    await atlasClient.connect();
    console.log('✅ Conectado ao MongoDB Atlas\n');

    const localDb = localClient.db('acquax');
    const atlasDb = atlasClient.db('acquax');

    for (const collectionName of COLLECTIONS) {
      try {
        const localCol = localDb.collection(collectionName);
        const atlasCol = atlasDb.collection(collectionName);

        const docs = await localCol.find({}).toArray();

        if (docs.length === 0) {
          console.log(`⏭️  ${collectionName}: vazia, pulando...`);
          continue;
        }

        // Limpar coleção no Atlas antes de inserir
        await atlasCol.deleteMany({});

        // Inserir documentos
        const result = await atlasCol.insertMany(docs);
        console.log(`✅ ${collectionName}: ${result.insertedCount} documentos migrados`);
      } catch (err) {
        console.error(`❌ Erro em ${collectionName}:`, err.message);
      }
    }

    console.log('\n📊 Verificando dados no Atlas...');
    for (const collectionName of COLLECTIONS) {
      try {
        const count = await atlasDb.collection(collectionName).countDocuments();
        if (count > 0) console.log(`   ${collectionName}: ${count} documentos`);
      } catch (e) {}
    }

    console.log('\n✅ Migração concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro geral:', err.message);
  } finally {
    await localClient.close();
    await atlasClient.close();
  }
}

migrate();
