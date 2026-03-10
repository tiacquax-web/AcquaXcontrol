/**
 * MIGRAÇÃO: Banco Antigo → Banco Novo (Atlas)
 * =============================================
 * Copia TODAS as coleções do banco antigo para o banco novo,
 * sem apagar dados que já existem no destino (modo upsert por _id).
 *
 * USO:
 *   1. Defina SOURCE_URI com a connection string do banco ANTIGO
 *   2. Defina TARGET_URI com a connection string do banco NOVO (atual)
 *   3. Execute: node scripts/migrate-old-to-new.js
 *
 *   Ou passe via variável de ambiente:
 *   SOURCE_URI="mongodb+srv://..." TARGET_URI="mongodb+srv://..." node scripts/migrate-old-to-new.js
 */

const { MongoClient } = require('mongodb');

// ─── CONFIGURE AQUI ───────────────────────────────────────────────────────────
const SOURCE_URI = process.env.SOURCE_URI ||
  'mongodb+srv://acquaadmin:c74ji063SoB92QU5@db-mongodb-acquaxc-nyc3-81713-2abc9433.mongo.ondigitalocean.com/admin';

const TARGET_URI = process.env.TARGET_URI ||
  'mongodb+srv://ruivagiulia_db_user:MUWnoaseItSukxnY@acquaxcontrol.gtkok07.mongodb.net/acquax?appName=acquaxcontrol';

const SOURCE_DB_NAME = process.env.SOURCE_DB || 'acquax'; // nome do banco no servidor antigo
const TARGET_DB_NAME = process.env.TARGET_DB || 'acquax';

// Modo: 'upsert' = não apaga nada, só insere/atualiza | 'replace' = limpa destino antes
const MODE = process.env.MODE || 'upsert';

// Coleções que NÃO devem ser migradas (deixe vazio para migrar tudo)
const SKIP_COLLECTIONS = (process.env.SKIP_COLLECTIONS || '').split(',').filter(Boolean);
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500; // inserir em lotes para não sobrecarregar

function getDbName(uri, fallback) {
  if (fallback) return fallback;
  try {
    const u = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'));
    const path = u.pathname.replace('/', '');
    return path.split('?')[0] || 'acquax';
  } catch {
    return 'acquax';
  }
}

async function migrateCollection(srcDb, tgtDb, name) {
  const srcCol = srcDb.collection(name);
  const tgtCol = tgtDb.collection(name);

  const total = await srcCol.countDocuments({});
  if (total === 0) {
    console.log(`  ⏭️  ${name}: vazia, pulando`);
    return { name, total: 0, inserted: 0, updated: 0, skipped: 0 };
  }

  if (MODE === 'replace') {
    await tgtCol.deleteMany({});
    console.log(`  🗑️  ${name}: destino limpo (modo replace)`);
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let skip = 0;

  const cursor = srcCol.find({});
  let batch = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (MODE === 'upsert') {
      // Upsert por _id
      const ops = batch.map(doc => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        }
      }));
      try {
        const res = await tgtCol.bulkWrite(ops, { ordered: false });
        inserted += res.upsertedCount || 0;
        updated  += res.modifiedCount || 0;
        skip     += (batch.length - (res.upsertedCount || 0) - (res.modifiedCount || 0));
      } catch (e) {
        console.error(`    ⚠️  bulkWrite parcial em ${name}:`, e.message);
        errors += batch.length;
      }
    } else {
      // replace mode: insertMany
      try {
        const res = await tgtCol.insertMany(batch, { ordered: false });
        inserted += res.insertedCount || 0;
      } catch (e) {
        if (e.code === 11000) {
          inserted += e.result?.nInserted || 0;
        } else {
          console.error(`    ⚠️  insertMany em ${name}:`, e.message);
          errors += batch.length;
        }
      }
    }
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= CHUNK_SIZE) await flushBatch();
  }
  await flushBatch();

  const status = errors > 0 ? '⚠️ ' : '✅';
  console.log(`  ${status} ${name}: ${total} docs → inseridos: ${inserted}, atualizados: ${updated}, já existiam: ${skip}${errors > 0 ? `, erros: ${errors}` : ''}`);
  return { name, total, inserted, updated, skipped: skip, errors };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         MIGRAÇÃO DE BANCO DE DADOS - AcquaXControl       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nModo: ${MODE.toUpperCase()}`);
  console.log(`Fonte : ${SOURCE_URI.replace(/:([^@]{4})[^@]*@/, ':****@')}`);
  console.log(`Destino: ${TARGET_URI.replace(/:([^@]{4})[^@]*@/, ':****@')}\n`);

  const srcClient = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 20000, tls: true, tlsAllowInvalidCertificates: false });
  const tgtClient = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 15000 });

  try {
    process.stdout.write('Conectando ao banco ANTIGO... ');
    await srcClient.connect();
    console.log('✅');

    process.stdout.write('Conectando ao banco NOVO... ');
    await tgtClient.connect();
    console.log('✅\n');

    const srcDbName = getDbName(SOURCE_URI, SOURCE_DB_NAME);
    const srcDb = srcClient.db(srcDbName);
    const tgtDb = tgtClient.db(TARGET_DB_NAME);

    console.log(`Banco fonte : ${srcDbName}`);
    console.log(`Banco destino: ${TARGET_DB_NAME}\n`);

    // Listar coleções da fonte
    const allCollections = await srcDb.listCollections().toArray();
    const collections = allCollections
      .map(c => c.name)
      .filter(n => !SKIP_COLLECTIONS.includes(n));

    console.log(`Coleções encontradas na fonte: ${allCollections.length}`);
    if (SKIP_COLLECTIONS.length) console.log(`Pulando: ${SKIP_COLLECTIONS.join(', ')}`);
    console.log(`Migrando: ${collections.length} coleções\n`);

    // Contagem prévia no destino
    console.log('─── ESTADO ATUAL DO DESTINO ───────────────────────────────');
    for (const name of collections) {
      try {
        const n = await tgtDb.collection(name).countDocuments({});
        if (n > 0) console.log(`  ${name}: ${n} docs existentes`);
      } catch {}
    }

    console.log('\n─── INICIANDO MIGRAÇÃO ────────────────────────────────────');
    const results = [];
    for (const name of collections) {
      results.push(await migrateCollection(srcDb, tgtDb, name));
    }

    // Resumo final
    const total   = results.reduce((s, r) => s + r.total, 0);
    const ins     = results.reduce((s, r) => s + r.inserted, 0);
    const upd     = results.reduce((s, r) => s + r.updated, 0);
    const skp     = results.reduce((s, r) => s + r.skipped, 0);
    const errs    = results.reduce((s, r) => s + (r.errors || 0), 0);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                     RESUMO FINAL                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Total de documentos na fonte : ${total}`);
    console.log(`  Inseridos no destino         : ${ins}`);
    console.log(`  Atualizados no destino       : ${upd}`);
    console.log(`  Já existiam (sem alteração)  : ${skp}`);
    if (errs > 0) console.log(`  ⚠️  Erros                     : ${errs}`);

    console.log('\n─── ESTADO FINAL DO DESTINO ───────────────────────────────');
    for (const name of collections) {
      try {
        const n = await tgtDb.collection(name).countDocuments({});
        if (n > 0) console.log(`  ${name}: ${n} docs`);
      } catch {}
    }

    if (errs === 0) {
      console.log('\n✅ Migração concluída com sucesso!');
    } else {
      console.log(`\n⚠️  Migração concluída com ${errs} erros. Verifique os logs acima.`);
    }

    console.log('\n💡 Próximo passo: atualize a variável DATABASE_URL no Vercel');
    console.log(`   com: ${TARGET_URI.replace(/:([^@]{4})[^@]*@/, ':****@')}`);
    console.log('   e faça Redeploy.\n');

  } catch (err) {
    console.error('\n❌ Erro fatal:', err.message);
    process.exit(1);
  } finally {
    await srcClient.close().catch(() => {});
    await tgtClient.close().catch(() => {});
  }
}

main();
