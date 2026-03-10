/**
 * MIGRAÇÃO AcquaXControl - Script Standalone
 * Banco Antigo (DigitalOcean) → Banco Novo (Atlas)
 *
 * COMO USAR:
 * 1. Certifique-se de ter Node.js instalado (node --version)
 * 2. Instale só o mongodb: npm install mongodb
 * 3. Execute: node migrar.js
 */

const { MongoClient } = require('mongodb');

const SOURCE_URI = 'mongodb+srv://acquaadmin:c74ji063SoB92QU5@db-mongodb-acquaxc-nyc3-81713-2abc9433.mongo.ondigitalocean.com/admin';
const TARGET_URI = 'mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol';

const SOURCE_DB = 'acquax';
const TARGET_DB = 'acquax';
const CHUNK_SIZE = 200;

async function migrateCollection(srcDb, tgtDb, name) {
  const srcCol = srcDb.collection(name);
  const tgtCol = tgtDb.collection(name);
  const total = await srcCol.countDocuments({});
  if (total === 0) { console.log('  ⏭️  ' + name + ': vazia'); return { total:0, inserted:0, updated:0 }; }

  let inserted = 0, updated = 0, errors = 0;
  const cursor = srcCol.find({});
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    const ops = batch.map(doc => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }));
    try {
      const res = await tgtCol.bulkWrite(ops, { ordered: false });
      inserted += res.upsertedCount || 0;
      updated  += res.modifiedCount || 0;
    } catch(e) { console.error('    ⚠️ erro em ' + name + ':', e.message); errors += batch.length; }
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= CHUNK_SIZE) await flush();
  }
  await flush();

  const icon = errors > 0 ? '⚠️ ' : '✅';
  console.log('  ' + icon + ' ' + name + ': ' + total + ' docs → novos: ' + inserted + ', atualizados: ' + updated + (errors?' erros:'+errors:''));
  return { total, inserted, updated };
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   MIGRAÇÃO AcquaXControl - DigitalOcean→Atlas ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const src = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 20000 });
  const tgt = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 20000 });

  try {
    process.stdout.write('Conectando banco ANTIGO (DigitalOcean)... ');
    await src.connect();
    console.log('✅');

    process.stdout.write('Conectando banco NOVO (Atlas)...          ');
    await tgt.connect();
    console.log('✅');
    console.log('');

    const srcDb = src.db(SOURCE_DB);
    const tgtDb = tgt.db(TARGET_DB);

    const cols = (await srcDb.listCollections().toArray()).map(c => c.name);
    console.log('Coleções encontradas: ' + cols.length);
    console.log('');

    // Mostrar o que já tem no destino
    console.log('── Estado atual do banco NOVO ──────────────────');
    for (const name of cols) {
      try {
        const n = await tgtDb.collection(name).countDocuments({});
        if (n > 0) console.log('  ' + name + ': ' + n + ' docs');
      } catch(e) {}
    }

    console.log('');
    console.log('── Iniciando migração ──────────────────────────');

    let totalDocs=0, totalIns=0, totalUpd=0;
    for (const name of cols) {
      const r = await migrateCollection(srcDb, tgtDb, name);
      totalDocs += r.total; totalIns += r.inserted; totalUpd += r.updated;
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║               RESUMO FINAL                    ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('  Total migrado : ' + totalDocs + ' documentos');
    console.log('  Inseridos     : ' + totalIns);
    console.log('  Atualizados   : ' + totalUpd);
    console.log('');

    console.log('── Estado final do banco NOVO ──────────────────');
    for (const name of cols) {
      try {
        const n = await tgtDb.collection(name).countDocuments({});
        if (n > 0) console.log('  ' + name + ': ' + n + ' docs');
      } catch(e) {}
    }

    console.log('');
    console.log('✅ Migração concluída!');
    console.log('');

  } catch(e) {
    console.error('❌ Erro fatal:', e.message);
    console.error('');
    console.error('Verifique:');
    console.error('  1. Se o banco DigitalOcean permite conexão do seu IP');
    console.error('     (cloud.digitalocean.com → Databases → seu cluster → Settings → Trusted Sources)');
    console.error('  2. Se as credenciais estão corretas');
  } finally {
    await src.close().catch(()=>{});
    await tgt.close().catch(()=>{});
    process.exit(0);
  }
}

main();
