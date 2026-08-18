import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Papéis Disponíveis no Sistema ---');
  const roles = await prisma.role.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true }
  });
  console.table(roles);

  console.log('\n--- Usuários Administradores/Master ---');
  const adminAssignments = await prisma.roleAssignment.findMany({
    where: {
      deletedAt: null,
      Role: {
        name: {
          contains: 'admin',
          mode: 'insensitive'
        }
      }
    },
    include: {
      User: { select: { id: true, name: true, email: true } },
      Role: { select: { name: true } }
    }
  });

  const masterAssignments = await prisma.roleAssignment.findMany({
    where: {
      deletedAt: null,
      Role: {
        name: {
          contains: 'master',
          mode: 'insensitive'
        }
      }
    },
    include: {
      User: { select: { id: true, name: true, email: true } },
      Role: { select: { name: true } }
    }
  });

  const allAdmins = [...adminAssignments, ...masterAssignments];
  const uniqueAdmins = allAdmins.map(a => ({
    name: a.User.name,
    email: a.User.email,
    role: a.Role.name,
    context: a.contextType,
    contextId: a.contextId
  }));
  
  console.table(uniqueAdmins);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
