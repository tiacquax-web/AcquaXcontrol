const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const complex = await prisma.complex.findFirst({
    where: { socialName: { contains: 'Laura', mode: 'insensitive' } },
  });
  console.log('Complex:', complex);

  let complexId = complex?.id;
  if (!complexId) {
    const all = await prisma.complex.findMany({ select: { id: true, socialName: true, aliasName: true } });
    console.log('All complexes:', all);
    if (all.length > 0) complexId = all[0].id;
  }

  if (!complexId) return;

  const readings = await prisma.dealershipReading.findMany({
    where: { complexId },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  console.log('Readings:', readings.map(r => ({ id: r.id, month: r.monthRef, year: r.yearRef })));

  if (readings.length === 0) return;

  const readingId = readings[0].id;
  const jobs = await prisma.emailJob.findMany({
    where: { dealershipReadingId: readingId },
  });
  console.log(`Jobs for reading ${readingId}: count = ${jobs.length}`);
  jobs.forEach(j => {
    console.log(`- [${j.status}] ${j.toEmail} | ${j.subject}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
