const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.glImportLog.findMany({
    orderBy: { executedAt: 'desc' },
    take: 10,
  });

  logs.forEach(l => {
    console.log(`\n${l.executedAt.toISOString()}`);
    console.log(`  filesFound: ${l.filesFound} | filesProcessed: ${l.filesProcessed} | rowsTotal: ${l.rowsTotal}`);
    console.log(`  imported: ${l.imported} | skipped: ${l.skipped} | errors: ${l.errors}`);
    if (l.errorMessage) console.log(`  ERROR: ${l.errorMessage}`);
    if (l.skipLog?.length > 0) console.log(`  skipLog sample: ${l.skipLog.slice(0,3).join(' | ')}`);
  });

  await prisma.$disconnect();
}
main().catch(e => console.error(e));
