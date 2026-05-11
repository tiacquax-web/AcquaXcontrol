const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const noCascade = args.has('--no-cascade');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const sampleLimitArg = process.argv.find((arg) => arg.startsWith('--sample='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const sampleLimit = sampleLimitArg ? Number(sampleLimitArg.split('=')[1]) : 20;

function isActive(doc) {
  return doc.deletedAt === null || doc.deletedAt === undefined;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Run this in the production/runtime environment.');
    process.exit(2);
  }

  const client = new MongoClient(url);
  await client.connect();

  try {
    const db = client.db();
    const apartmentsCol = db.collection('Apartments');
    const blocksCol = db.collection('Blocks');
    const backupCol = db.collection('ApartmentOrphanBackups');
    const runCol = db.collection('ApartmentOrphanRepairRuns');

    const activeFilter = {
      $or: [
        { deletedAt: null },
        { deletedAt: { $exists: false } },
      ],
    };

    const findOptions = {
      projection: {
        _id: 1,
        name: 1,
        blockId: 1,
        complexId: 1,
        companyId: 1,
        deletedAt: 1,
      },
    };
    if (Number.isFinite(limit) && limit > 0) findOptions.limit = limit;

    const apartments = await apartmentsCol.find(activeFilter, findOptions).toArray();
    const blockIds = [...new Set(apartments.map((apt) => apt.blockId).filter(Boolean))];
    const blocks = blockIds.length
      ? await blocksCol.find(
          { _id: { $in: blockIds } },
          { projection: { _id: 1, name: 1, complexId: 1, companyId: 1, deletedAt: 1 } },
        ).toArray()
      : [];
    const blockById = new Map(blocks.map((block) => [block._id, block]));

    const orphans = [];
    const denormalizedMismatches = [];

    for (const apartment of apartments) {
      const blockId = apartment.blockId;
      if (!blockId) {
        orphans.push({ apartment, reason: 'missingBlockId' });
        continue;
      }

      const block = blockById.get(blockId);
      if (!block) {
        orphans.push({ apartment, reason: 'missingBlock' });
        continue;
      }

      if (!isActive(block)) {
        orphans.push({ apartment, block, reason: 'softDeletedBlock' });
        continue;
      }

      if (apartment.complexId !== block.complexId || apartment.companyId !== block.companyId) {
        denormalizedMismatches.push({ apartment, block, reason: 'denormalizedMismatch' });
      }
    }

    const runId = randomUUID();
    const now = new Date();
    const orphanIds = orphans.map((item) => item.apartment._id);
    const mismatchIds = denormalizedMismatches.map((item) => item.apartment._id);

    const summary = {
      runId,
      mode: apply ? 'apply' : 'dry-run',
      scannedActiveApartments: apartments.length,
      orphanApartments: orphans.length,
      denormalizedMismatches: denormalizedMismatches.length,
      orphanReasonCounts: orphans.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
      orphanSamples: orphans.slice(0, sampleLimit).map((item) => ({
        id: item.apartment._id,
        name: item.apartment.name,
        blockId: item.apartment.blockId,
        reason: item.reason,
        blockDeletedAt: item.block?.deletedAt,
      })),
      denormalizedMismatchSamples: denormalizedMismatches.slice(0, sampleLimit).map((item) => ({
        id: item.apartment._id,
        name: item.apartment.name,
        blockId: item.apartment.blockId,
        apartmentComplexId: item.apartment.complexId,
        blockComplexId: item.block.complexId,
        apartmentCompanyId: item.apartment.companyId,
        blockCompanyId: item.block.companyId,
      })),
    };

    if (!apply) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const backupDocs = [
      ...orphans.map((item) => ({
        runId,
        backedUpAt: now,
        type: 'orphanApartment',
        reason: item.reason,
        apartmentId: item.apartment._id,
        apartment: item.apartment,
        block: item.block || null,
      })),
      ...denormalizedMismatches.map((item) => ({
        runId,
        backedUpAt: now,
        type: 'denormalizedMismatch',
        reason: item.reason,
        apartmentId: item.apartment._id,
        apartment: item.apartment,
        block: item.block,
      })),
    ];

    if (backupDocs.length > 0) {
      for (const docs of chunk(backupDocs, 500)) {
        await backupCol.insertMany(docs, { ordered: false });
      }
    }

    let apartmentsSoftDeleted = 0;
    let childMetersSoftDeleted = 0;
    let childReadingsSoftDeleted = 0;
    let childReportsSoftDeleted = 0;
    let childRoleAssignmentsSoftDeleted = 0;
    let apartmentsDenormalized = 0;

    if (orphanIds.length > 0) {
      const result = await apartmentsCol.updateMany(
        { _id: { $in: orphanIds }, ...activeFilter },
        {
          $set: {
            deletedAt: now,
            updatedAt: now,
            orphanedAt: now,
            orphanedReason: 'parent block is missing or inactive',
          },
        },
      );
      apartmentsSoftDeleted = result.modifiedCount || 0;

      if (!noCascade) {
        const activeChildFilter = { apartmentId: { $in: orphanIds }, ...activeFilter };
        childMetersSoftDeleted = (await db.collection('Meters').updateMany(activeChildFilter, { $set: { deletedAt: now, updatedAt: now } })).modifiedCount || 0;
        childReadingsSoftDeleted = (await db.collection('Readings').updateMany(activeChildFilter, { $set: { deletedAt: now, updatedAt: now } })).modifiedCount || 0;
        childReportsSoftDeleted = (await db.collection('ApartmentConsumptionReports').updateMany(activeChildFilter, { $set: { deletedAt: now, updatedAt: now } })).modifiedCount || 0;
        childRoleAssignmentsSoftDeleted = (await db.collection('RoleAssignment').updateMany(
          { contextType: 'apartment', contextId: { $in: orphanIds }, ...activeFilter },
          { $set: { deletedAt: now, updatedAt: now } },
        )).modifiedCount || 0;
      }
    }

    for (const item of denormalizedMismatches) {
      const result = await apartmentsCol.updateOne(
        { _id: item.apartment._id, ...activeFilter },
        {
          $set: {
            complexId: item.block.complexId || null,
            companyId: item.block.companyId || null,
            updatedAt: now,
          },
        },
      );
      apartmentsDenormalized += result.modifiedCount || 0;
    }

    const appliedSummary = {
      ...summary,
      appliedAt: now,
      backupCollection: 'ApartmentOrphanBackups',
      runCollection: 'ApartmentOrphanRepairRuns',
      apartmentsSoftDeleted,
      childMetersSoftDeleted,
      childReadingsSoftDeleted,
      childReportsSoftDeleted,
      childRoleAssignmentsSoftDeleted,
      apartmentsDenormalized,
      cascadeChildren: !noCascade,
      orphanIds,
      denormalizedMismatchIds: mismatchIds,
    };

    await runCol.insertOne(appliedSummary);
    console.log(JSON.stringify(appliedSummary, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
