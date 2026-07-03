const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Check meters with glId
  const metersWithGL = await db.collection('Meters').find({
    glId: { $exists: true, $ne: null, $ne: "" }
  }).toArray();
  
  const complexIdsWithGL = [...new Set(metersWithGL.map(m => m.complexId).filter(Boolean))];
  console.log(`Meters with glId: ${metersWithGL.length}`);
  console.log(`Complexes with GL meters: ${complexIdsWithGL.length}`);
  for (const cid of complexIdsWithGL) {
    const cx = await db.collection('Complexes').findOne({ _id: cid });
    console.log(`  ${cid}: ${cx?.socialName || 'UNKNOWN'}`);
  }

  // Check IoT devices
  const iotDevices = await db.collection('IotDevices').find({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  }).toArray();
  console.log(`\nIoT devices: ${iotDevices.length}`);

  await client.close();
}
main().catch(e => console.error(e));
