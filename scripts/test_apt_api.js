const prisma = require('../lib/prisma').default;

async function main() {
  try {
    const apts = await prisma.apartment.findMany({ take: 5 });
    console.log('Apartments count:', apts.length);
  } catch (e) {
    console.error('Prisma apartment error:', e);
  }
}

main().catch(console.error);
