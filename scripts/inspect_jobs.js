const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- DIAGNÓSTICO DE EMAIL JOBS ---');
  const jobs = await prisma.emailJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`Total de jobs recentes: ${jobs.length}`);
  for (const j of jobs) {
    console.log(`[Job ${j.id}] ApId: ${j.apartmentId} | Email: ${j.toEmail} | Status: ${j.status} | Erro: ${j.errorMessage || 'Nenhum'}`);
  }

  console.log('--- APARTAMENTOS E USUÁRIOS VINCULADOS ---');
  const apartments = await prisma.apartment.findMany({
    take: 10,
    select: { id: true, name: true },
  });

  for (const apt of apartments) {
    const assignments = await prisma.roleAssignment.findMany({
      where: { contextId: apt.id, contextType: 'apartment', deletedAt: null },
      include: { User: { select: { id: true, name: true, email: true } } },
    });
    console.log(`Apartamento ${apt.name} (ID: ${apt.id}): ${assignments.length} usuários vinculados`);
    for (const a of assignments) {
      console.log(`  -> Usuário: ${a.User?.name} (${a.User?.email})`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
