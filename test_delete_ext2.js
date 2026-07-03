const { PrismaClient } = require('@prisma/client');

const client = new PrismaClient().$extends({
  model: {
    $allModels: {
      async delete({ where }) {
        const modelName = this.$name;
        return client[modelName].update({
          where: { ...where },
          data: { deletedAt: new Date() },
        });
      },
    },
  },
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const READ_OPS = new Set(['findFirst','findMany','count','aggregate']);
        if (READ_OPS.has(operation)) {
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
  // Create a test complex using company relation
  const testComplex = await client.complex.create({
    data: {
      socialName: '__TEST_SOFT_DELETE__',
      aliasName: '__TEST_SOFT_DELETE__',
      documentCompany: '99.999.999/9999-99',
      company: { connect: { id: 'e8155542-396d-495c-a092-4a7b97fc4ea3' } },
      type: 'RESIDENTIAL',
    }
  });
  console.log('Created:', testComplex.id);

  // "Delete" it
  try {
    const deleted = await client.complex.delete({ where: { id: testComplex.id } });
    console.log('After delete - deletedAt:', deleted.deletedAt);
  } catch(e) {
    console.error('Delete failed:', e.message.substring(0, 200));
  }

  // Check raw
  const { MongoClient } = require('mongodb');
  const mongoClient = new MongoClient(process.env.DATABASE_URL);
  await mongoClient.connect();
  const db = mongoClient.db();
  const raw = await db.collection('Complexes').findOne({ _id: testComplex.id });
  console.log('Raw in DB after delete:', raw ? `deletedAt=${raw.deletedAt} (${typeof raw.deletedAt})` : 'NOT FOUND - HARD DELETE!');
  
  // Now try to create another with the same socialName
  try {
    const dup = await client.complex.create({
      data: {
        socialName: '__TEST_SOFT_DELETE__',
        aliasName: '__TEST_SOFT_DELETE__',
        documentCompany: '88.888.888/8888-88',
        company: { connect: { id: 'e8155542-396d-495c-a092-4a7b97fc4ea3' } },
        type: 'RESIDENTIAL',
      }
    });
    console.log('SUCCESS: Created duplicate after soft-delete! New id:', dup.id);
    // Clean up
    await db.collection('Complexes').deleteOne({ _id: testComplex.id });
    await db.collection('Complexes').deleteOne({ _id: dup.id });
  } catch(e) {
    console.error('FAILED to create duplicate:', e.code, e.message.substring(0, 300));
    // Clean up
    await db.collection('Complexes').deleteOne({ _id: testComplex.id });
  }
  
  await mongoClient.close();
}

main().catch(e => console.error('ERROR:', e)).finally(() => client.$disconnect());
