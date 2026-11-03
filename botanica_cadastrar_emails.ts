/**
 * Cadastra o email pessoal real dos moradores do Botânica (227 unidades),
 * substituindo os emails internos placeholder (@acquaxdobrasil.com.br)
 * gerados durante a consolidação. Reusa exatamente a mesma lógica do
 * endpoint de importação em massa (Caso 2: update + senha provisória +
 * email de boas-vindas), processando em lotes para não sobrecarregar o Mongo.
 */
import fs from 'fs';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import prisma from './lib/prisma';
import { sendEmail, isEmailConfigured } from './lib/services/email-service';
import { generateWelcomeEmail } from './lib/services/welcome-email-template';
import { isBlockedEmailDomain } from './lib/services/filipeta-email-dispatcher';
import { normalizeEmail } from './lib/users';

const BOT_ID = '760a5fab-3eb6-48d8-9107-e6ec2357e3ca';
const nd = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

function generateProvisionalPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[crypto.randomInt(0, chars.length)];
  return pwd;
}

function parseCsv(path: string) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.map(l => {
    const parts = l.split(',');
    const block = parts[0];
    const apt = parts[1];
    const email = parts[parts.length - 1];
    const name = parts.slice(2, parts.length - 1).join(',');
    return { block, apt, name, email };
  });
}

async function main() {
  const csv = parseCsv('/app/conversations/69b1a9efa2b581ebfa5280ce/botanica_emails/data.csv');
  const apts = await prisma.apartment.findMany({ where: { complexId: BOT_ID, ...nd }, select: { id: true, name: true, block: { select: { name: true } } } });
  const aptMap = new Map(apts.map(a => [`${a.block?.name.trim().toUpperCase()}|${a.name.trim().replace(/^0+/, '')}`, a]));
  const moradorRole = await prisma.role.findFirst({ where: { name: 'Morador', ...nd } });
  if (!moradorRole) throw new Error('Role Morador não encontrada');
  const complex = await prisma.complex.findFirst({ where: { id: BOT_ID }, select: { socialName: true } });
  const emailConfigured = isEmailConfigured();
  console.log('Email configurado:', emailConfigured);

  let updated = 0, skippedNotFound = 0, skippedSameEmail = 0, emailSent = 0, emailFailed = 0, emailSkippedDomain = 0;
  const log: any[] = [];

  for (const row of csv) {
    const key = `${row.block}|${row.apt.replace(/^0+/, '')}`;
    const apt = aptMap.get(key);
    if (!apt) { skippedNotFound++; log.push({ ...row, status: 'not_found' }); continue; }

    const email = normalizeEmail(row.email.trim());
    const ra = await prisma.roleAssignment.findFirst({
      where: { roleId: moradorRole.id, contextType: 'apartment', contextId: apt.id, ...nd },
      include: { User: { select: { id: true, email: true, name: true } } },
    });
    if (!ra || !ra.User) { log.push({ ...row, status: 'sem_morador' }); continue; }
    if (ra.User.email.toLowerCase() === email) { skippedSameEmail++; log.push({ ...row, status: 'ja_igual' }); continue; }

    // Verificar se o email alvo já pertence a outro usuário ativo (ex: morador com 2 unidades)
    const other = await prisma.user.findFirst({ where: { email, ...nd, id: { not: ra.User.id } }, select: { id: true } });
    if (other) {
      const otherAlreadyLinked = await prisma.roleAssignment.findFirst({ where: { userId: other.id, contextId: apt.id, contextType: 'apartment', roleId: moradorRole.id, ...nd } });
      if (otherAlreadyLinked) {
        // Apartamento já está corretamente vinculado ao usuário certo (RA duplicada/antiga) — apenas arquiva a RA antiga/placeholder
        await prisma.roleAssignment.update({ where: { id: ra.id }, data: { deletedAt: new Date() } });
        log.push({ ...row, status: 'ra_antiga_arquivada', email });
      } else {
        await prisma.roleAssignment.update({ where: { id: ra.id }, data: { userId: other.id } });
        log.push({ ...row, status: 'linked_existing', email });
      }
      updated++;
      continue;
    }

    const provisionalPassword = generateProvisionalPassword();
    const hashedPassword = await hash(provisionalPassword, 10);
    try {
      await prisma.user.update({
        where: { id: ra.User.id },
        data: {
          email,
          name: row.name || ra.User.name,
          password: hashedPassword,
          mustUpdateCredentials: true,
          resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
          resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (e: any) {
      log.push({ ...row, status: 'erro_update', error: e.message });
      continue;
    }
    updated++;

    let emailStatus = 'not_sent';
    if (emailConfigured && !isBlockedEmailDomain(email)) {
      try {
        const { subject, html, text } = generateWelcomeEmail({
          residentName: row.name || ra.User.name || `Morador ${apt.name}`,
          apartmentName: apt.name,
          blockName: apt.block?.name || '',
          complexName: complex?.socialName || 'Botânica',
          email,
          provisionalPassword,
        });
        const result = await sendEmail({ to: email, toName: row.name || undefined, subject, html, text });
        emailStatus = result.success ? 'enviado' : `falha: ${result.error}`;
        if (result.success) emailSent++; else emailFailed++;
      } catch (e: any) {
        emailStatus = `erro: ${e.message}`;
        emailFailed++;
      }
    } else {
      emailSkippedDomain++;
      emailStatus = 'dominio_bloqueado';
    }
    log.push({ ...row, status: 'updated', email, emailStatus });
    if (updated % 25 === 0) console.log(`Progresso: ${updated} atualizados...`);
    // pequeno respiro para não saturar SMTP/Mongo
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nRESUMO: atualizados=${updated}, não encontrados=${skippedNotFound}, já iguais=${skippedSameEmail}, emails enviados=${emailSent}, falhas=${emailFailed}, domínio bloqueado=${emailSkippedDomain}`);
  fs.writeFileSync('/app/conversations/69b1a9efa2b581ebfa5280ce/botanica_emails/result_log.json', JSON.stringify(log, null, 1));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
