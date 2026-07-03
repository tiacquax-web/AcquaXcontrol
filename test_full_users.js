const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Test: Users query with Roles include...');
  try {
    const users = await prisma.user.findMany({
      where: {},
      take: 5,
      include: {
        Roles: {
          where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          select: { id: true, contextType: true, Role: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ Users: ${users.length} found`);
    users.forEach(u => {
      const roles = u.Roles?.map(r => `${r.Role?.name}(${r.contextType})`).filter(Boolean) || [];
      console.log(`  ${u.email} → [${roles.join(', ')}]`);
    });
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }

  console.log('\nTest: Roles query...');
  try {
    const roles = await prisma.role.findMany({
      where: {
        AND: [
          { OR: [{ name: undefined }, { description: undefined }] },
          { roleId: undefined, role: undefined },
        ],
      },
      take: 15,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`✅ Roles: ${roles.length} found`);
    roles.forEach(r => console.log(`  ${r.name} (deletedAt: ${r.deletedAt})`));
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }

  await prisma.$disconnect();
}
main();
