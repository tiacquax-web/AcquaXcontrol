const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Check recent ApartmentConsumptionReports
  const reports = await db.collection('ApartmentConsumptionReports').find({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  }).sort({ createdAt: -1 }).limit(10).toArray();
  
  console.log(`Total active reports: ${await db.collection('ApartmentConsumptionReports').countDocuments({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  })}`);
  
  console.log('\nLast 10 reports:');
  for (const r of reports) {
    console.log(`  aptId=${r.apartmentId} month=${r.monthRef}/${r.yearRef} complexId=${r.complexId} createdAt=${r.createdAt}`);
  }
  
  // Check by month/year
  const pipeline = [
    { $match: { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } },
    { $group: { _id: { month: "$monthRef", year: "$yearRef" }, count: { $sum: 1 } } },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: 12 }
  ];
  const byMonth = await db.collection('ApartmentConsumptionReports').aggregate(pipeline).toArray();
  console.log('\nReports by month/year:');
  for (const m of byMonth) {
    console.log(`  ${m._id.month}/${m._id.year}: ${m.count} reports`);
  }

  await client.close();
}
main().catch(e => console.error(e));
