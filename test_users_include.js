const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Test 1: findMany with Roles include...');
  try {
    const users = await prisma.user.findMany({
      where: {},
      take: 3,
      include: {
        Roles: {
          where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          select: { id: true, contextType: true, Role: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Success: ${users.length} users found`);
    users.forEach(u => {
      const roles = u.Roles?.map(r => r.Role?.name).filter(Boolean) || [];
      console.log(`  ${u.email} → roles: [${roles.join(', ')}]`);
    });
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
    console.log(e.stack?.split('\n').slice(0,5).join('\n'));
  }

  console.log('\nTest 2: findMany without include (old behavior)...');
  try {
    const users = await prisma.user.findMany({
      where: {},
      take: 3,
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Success: ${users.length} users found`);
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }

  await prisma.$disconnect();
}
main();
