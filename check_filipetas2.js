const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Check distinct monthRef values
  const monthRefs = await db.collection('ApartmentConsumptionReports').distinct('monthRef');
  console.log('Distinct monthRef values:', monthRefs.sort());
  
  // Check reports for a specific apartment (use first apartment from a test)
  const testApt = await db.collection('ApartmentConsumptionReports').findOne({
    monthRef: "07",
    yearRef: "2026"
  });
  if (testApt) {
    console.log('\nSample report for 07/2026:');
    console.log('  apartmentId:', testApt.apartmentId);
    console.log('  complexId:', testApt.complexId);
    console.log('  monthRef:', testApt.monthRef);
    console.log('  yearRef:', testApt.yearRef);
    console.log('  consumption:', testApt.consumption);
    console.log('  totalUnit:', testApt.totalUnit);
    
    // Check if this apartment has a user linked
    const ra = await db.collection('RoleAssignments').findOne({
      contextId: testApt.apartmentId,
      contextType: 'apartment',
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    });
    console.log('  RoleAssignment for this apt:', ra ? ra.userId : 'NONE');
  }

  await client.close();
}
main().catch(e => console.error(e));
