const { PrismaClient } = require('@prisma/client');

// Reproduce the exact same extension from lib/prisma.ts
const client = new PrismaClient().$extends({
  model: {
    $allModels: {
      async delete({ where }) {
        const modelName = this.$name;
        const ext = client;
        return ext[modelName].update({
          where: { ...where },
          data: { deletedAt: new Date() },
        });
      },
    },
  },
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const MODELS_WITHOUT_DELETED_AT = new Set(['ScheduleOverride','SupportMessage','SuggestionVote']);
        const READ_OPS = new Set(['findFirst','findMany','count','aggregate']);
        if (READ_OPS.has(operation) && !MODELS_WITHOUT_DELETED_AT.has(model)) {
          const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
          const hasWhere = args.where != null && Object.keys(args.where).length > 0;
          args.where = hasWhere ? { AND: [args.where, notDeleted] } : notDeleted;
        }
        return query(args);
      },
    },
  },
});

async function main() {
  // Find an existing active complex to test with
  const existing = await client.complex.findFirst({ select: { id: true, socialName: true } });
  console.log('Found complex for test:', existing?.id, existing?.socialName);

  // Create a test complex
  const testComplex = await client.complex.create({
    data: {
      socialName: '__TEST_DELETE_SOFT__',
      aliasName: '__TEST_DELETE_SOFT__',
      documentCompany: '99.999.999/9999-99',
      companyId: 'e8155542-396d-495c-a092-4a7b97fc4ea3',
      type: 'RESIDENTIAL',
    }
  });
  console.log('Created test complex:', testComplex.id);

  // Now "delete" it (should be soft-delete via extension)
  try {
    const deleted = await client.complex.delete({ where: { id: testComplex.id } });
    console.log('Delete result socialName:', deleted.socialName, 'deletedAt:', deleted.deletedAt);
  } catch(e) {
    console.error('Delete failed:', e.message);
  }

  // Check raw in DB
  const { MongoClient } = require('mongodb');
  const mongoClient = new MongoClient(process.env.DATABASE_URL);
  await mongoClient.connect();
  const db = mongoClient.db();
  const raw = await db.collection('Complexes').findOne({ _id: testComplex.id });
  console.log('Raw after delete:', raw ? `deletedAt=${raw.deletedAt} (${typeof raw.deletedAt})` : 'NOT FOUND - HARD DELETE!');
  
  // Cleanup
  await db.collection('Complexes').deleteOne({ _id: testComplex.id });
  console.log('Cleaned up test record');
  
  await mongoClient.close();
}

main().catch(e => console.error('ERROR:', e)).finally(() => client.$disconnect());
