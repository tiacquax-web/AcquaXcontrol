import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const step = process.argv[2];
async function run() {
  const u = await prisma.user.findFirst({ where: { email: 'teste.celular@acquaxcontrol.com.br' }, select: { id: true } });
  if (!u) { console.log('usuario ja nao existe'); return; }
  if (step === 'ra') console.log('roleAssignments', (await prisma.roleAssignment.deleteMany({ where: { userId: u.id } })).count);
  if (step === 'sess') console.log('sessions', (await prisma.session.deleteMany({ where: { userId: u.id } })).count);
  if (step === 'user') console.log('users', (await prisma.user.deleteMany({ where: { id: u.id } })).count);
  if (step === 'claim') console.log('claims', (await prisma.registrationClaim.deleteMany({ where: { apartmentId: 'eccb79bb-5232-4c94-9a14-76a3ea4cacbb' } })).count);
}
run().catch(e => console.error('ERR', e.message)).finally(() => prisma.$disconnect());
