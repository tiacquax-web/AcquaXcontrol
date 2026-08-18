import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Resumo da Fila de E-mails (EmailJob) ---');
  const stats = await prisma.emailJob.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.table(stats);

  console.log('\n--- Últimos 10 E-mails Pendentes ---');
  const pending = await prisma.emailJob.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      toEmail: true,
      subject: true,
      attempts: true,
      createdAt: true
    }
  });
  console.table(pending);

  console.log('\n--- Últimos 10 E-mails com Erro ---');
  const failed = await prisma.emailJob.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      toEmail: true,
      subject: true,
      errorMessage: true,
      updatedAt: true
    }
  });
  console.table(failed);

  console.log('\n--- Últimos 5 E-mails Enviados com Sucesso ---');
  const sent = await prisma.emailJob.findMany({
    where: { status: 'sent' },
    orderBy: { sentAt: 'desc' },
    take: 5,
    select: {
      toEmail: true,
      subject: true,
      sentAt: true
    }
  });
  console.table(sent);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
