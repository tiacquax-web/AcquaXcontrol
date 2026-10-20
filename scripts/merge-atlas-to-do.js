const { MongoClient } = require('mongodb');
const DO_URI = process.env.DO_URI || (() => { throw new Error('Defina DO_URI (mongodb+srv://...)'); })();
const ATLAS_URI = process.env.ATLAS_URI || (() => { throw new Error('Defina ATLAS_URI (mongodb+srv://...)'); })();

const COLLECTIONS = [
  'Apartments','TypeMeters','Meters',
  'Dealerships','DealershipReadings','Readings','ApartmentConsumptionReports',
  'Reservoirs','ReservoirReadings','IotDevices','MeterDeviceLinks',
  'User','Roles','RoleAssignment','ScheduledTasks','RecurringSchedules','ScheduleOverrides'
];

async function mergeCollection(doDB, atlasDB, col) {
  const atlasDocs = await atlasDB.collection(col).find({}).toArray();
  if (atlasDocs.length === 0) { console.log(col + ': vazio, pulando'); return; }

  let upserted = 0, modified = 0, errors = 0;
  const BATCH = 500;
  for (let i = 0; i < atlasDocs.length; i += BATCH) {
    const batch = atlasDocs.slice(i, i + BATCH);
    const ops = batch.map(doc => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true }
    }));
    try {
      const r = await doDB.collection(col).bulkWrite(ops, { ordered: false });
      upserted += r.upsertedCount || 0;
      modified += r.modifiedCount || 0;
    } catch(e) {
      // BulkWriteError — pega resultados parciais
      if (e.result) {
        upserted += e.result.nUpserted || 0;
        modified += e.result.nModified || 0;
        errors += (e.result.writeErrors || []).length;
      } else {
        errors += batch.length;
      }
    }
  }
  console.log(col + ': Atlas=' + atlasDocs.length + ' novos=' + upserted + ' atualizados=' + modified + (errors?' erros='+errors:'') + ' ✓');
}

async function run() {
  const doClient = new MongoClient(DO_URI, { serverSelectionTimeoutMS: 20000 });
  const atlasClient = new MongoClient(ATLAS_URI, { serverSelectionTimeoutMS: 20000 });
  try {
    await doClient.connect();
    await atlasClient.connect();
    console.log('Conectado a ambos os bancos. Iniciando mesclagem...\n');
    const doDB = doClient.db('AcquaXControl_PRD');
    const atlasDB = atlasClient.db('acquax');
    for (const col of COLLECTIONS) {
      await mergeCollection(doDB, atlasDB, col);
    }
    console.log('\n✅ Mesclagem concluída!');
  } finally {
    await doClient.close();
    await atlasClient.close();
  }
}
run().catch(e => console.error('ERRO FATAL:', e.message));
