const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Test 1: Role query WITHOUT cleanWhere (replicating the bug)...');
  try {
    const whereCondition = {
      AND: [
        {
          OR: [
            { name: undefined },
            { description: undefined },
          ],
        },
        { roleId: undefined, role: undefined },
      ],
    };
    const roles = await prisma.role.findMany({
      where: whereCondition,
      take: 15,
      skip: 0,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`✅ Success: ${roles.length} roles found`);
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }

  console.log('\nTest 2: Role query WITH cleanWhere...');
  try {
    const { cleanWhere } = require('./lib/utils');
    const whereCondition = cleanWhere({
      AND: [
        {
          OR: [
            { name: undefined },
            { description: undefined },
          ],
        },
        { roleId: undefined, role: undefined },
      ],
    });
    console.log('cleanWhere result:', JSON.stringify(whereCondition));
    const roles = await prisma.role.findMany({
      where: whereCondition,
      take: 15,
      skip: 0,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`✅ Success: ${roles.length} roles found`);
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }

  await prisma.$disconnect();
}
main();
