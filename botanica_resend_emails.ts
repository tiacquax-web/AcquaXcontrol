/**
 * Reenvia o email de boas-vindas (com NOVA senha provisória) para os moradores
 * cujo envio original falhou por rate-limit do Zoho. A senha anterior foi
 * perdida (só o hash ficou salvo), então regeneramos uma nova senha válida
 * e reenviamos com espaçamento maior entre os envios.
 */
import fs from 'fs';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import prisma from './lib/prisma';
import { sendEmail, isEmailConfigured } from './lib/services/email-service';
import { generateWelcomeEmail } from './lib/services/welcome-email-template';

const BOT_ID = '760a5fab-3eb6-48d8-9107-e6ec2357e3ca';
const nd = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

function generateProvisionalPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[crypto.randomInt(0, chars.length)];
  return pwd;
}

async function main() {
  const pending = JSON.parse(fs.readFileSync('/app/conversations/69b1a9efa2b581ebfa5280ce/botanica_emails/pending_resend.json', 'utf8'));
  const limit = Number(process.argv[2] || pending.length);
  const delayMs = Number(process.argv[3] || 4000);
  const complex = await prisma.complex.findFirst({ where: { id: BOT_ID }, select: { socialName: true } });
  const emailConfigured = isEmailConfigured();

  const stillFailed: any[] = [];
  const succeeded: any[] = [];
  let count = 0;

  for (const row of pending) {
    if (count >= limit) { stillFailed.push(row); continue; }
    const email = row.email.toLowerCase().trim();
    const user = await prisma.user.findFirst({ where: { email, ...nd }, select: { id: true, name: true } });
    if (!user) { console.log('Usuário não encontrado para', email); stillFailed.push(row); continue; }

    const provisionalPassword = generateProvisionalPassword();
    const hashedPassword = await hash(provisionalPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword, mustUpdateCredentials: true } });

    try {
      const { subject, html, text } = generateWelcomeEmail({
        residentName: row.name || user.name || `Morador ${row.apt}`,
        apartmentName: row.apt,
        blockName: row.block,
        complexName: complex?.socialName || 'Botânica',
        email,
        provisionalPassword,
      });
      const result = await sendEmail({ to: email, toName: row.name || undefined, subject, html, text });
      if (result.success) {
        console.log('OK:', email);
        succeeded.push({ ...row });
      } else {
        console.log('FALHA:', email, result.error);
        stillFailed.push({ ...row, lastError: result.error });
        if (String(result.error).includes('Unusual sending activity')) {
          console.log('Rate limit detectado novamente — abortando este lote.');
          // devolve o restante não tentado também
          const idx = pending.indexOf(row);
          for (const r of pending.slice(idx + 1)) stillFailed.push(r);
          break;
        }
      }
    } catch (e: any) {
      console.log('ERRO:', email, e.message);
      stillFailed.push({ ...row, lastError: e.message });
    }
    count++;
    await new Promise(r => setTimeout(r, delayMs));
  }

  console.log(`\nRESUMO reenvio: sucesso=${succeeded.length}, ainda pendentes=${stillFailed.length}`);
  fs.writeFileSync('/app/conversations/69b1a9efa2b581ebfa5280ce/botanica_emails/pending_resend.json', JSON.stringify(stillFailed, null, 1));
  fs.appendFileSync('/app/conversations/69b1a9efa2b581ebfa5280ce/botanica_emails/resend_succeeded.json', JSON.stringify(succeeded, null, 1) + '\n');
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
