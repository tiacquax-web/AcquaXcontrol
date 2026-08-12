import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const complex = await prisma.complex.findFirst({
    where: { aliasName: { contains: 'Laura', mode: 'insensitive' } },
  });
  console.log('Complex:', complex);

  if (!complex) {
    console.log('Complexo Laura não encontrado.');
    return;
  }

  const readings = await prisma.dealershipReading.findMany({
    where: { complexId: complex.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('DealershipReadings:', readings.map(r => ({ id: r.id, monthRef: r.monthRef, yearRef: r.yearRef })));

  if (readings.length === 0) return;

  const readingId = readings[0].id;
  const jobs = await prisma.emailJob.findMany({
    where: { dealershipReadingId: readingId },
  });
  console.log(`EmailJobs para a leitura ${readingId}:`, jobs.length);
  jobs.forEach(j => {
    console.log(`- [${j.status}] ${j.toEmail} | Subject: ${j.subject} | Error: ${j.errorMessage}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
