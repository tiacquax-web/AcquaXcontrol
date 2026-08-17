import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const jobs = await prisma.emailJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true, toEmail: true, subject: true, errorMessage: true, createdAt: true }
  });
  console.log('Recent EmailJobs:', JSON.stringify(jobs, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
