const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const failedJobs = await prisma.emailJob.findMany({
    where: {
      status: 'failed',
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      toEmail: true,
      errorMessage: true,
      updatedAt: true,
      attempts: true,
    },
  });

  console.log(`Total de falhas recentes encontradas: ${failedJobs.length}`);
  
  const errorCounts = {};
  for (const job of failedJobs) {
    const err = job.errorMessage || 'Sem mensagem de erro';
    errorCounts[err] = (errorCounts[err] || 0) + 1;
  }

  console.log('Resumo de Erros:');
  console.log(errorCounts);

  console.log('Últimas falhas:');
  failedJobs.slice(0, 10).forEach(j => {
    console.log(`- [${j.updatedAt}] ${j.toEmail}: ${j.errorMessage} (Tentativas: ${j.attempts})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
