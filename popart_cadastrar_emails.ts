/**
 * Pop Art: troca o email placeholder (@acquaxdobrasil) pelo email real do
 * proprietario/pagador de cada unidade (PDF Omnia). Mesma logica da Botanica,
 * mas SEM enviar email nesta etapa (Zoho bloqueou envio em massa).
 * Uso: npx tsx popart_cadastrar_emails.ts [--apply]
 */
import fs from 'fs';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import prisma from './lib/prisma';
import { normalizeEmail } from './lib/users';

const POP_ID = 'abe1d1b7-9d43-4df6-8a8b-4f77f9a887a9';
const DIR = '/app/conversations/69b1a9efa2b581ebfa5280ce/popart';
const nd = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
const APPLY = process.argv.includes('--apply');

function genPwd(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let p = ''; for (let i = 0; i < 8; i++) p += chars[crypto.randomInt(0, chars.length)];
  return p;
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

async function main() {
  const rows: { apt: string; name: string; email: string }[] = JSON.parse(fs.readFileSync(`${DIR}/popart_emails.json`, 'utf8'));
  const apts = await prisma.apartment.findMany({ where: { complexId: POP_ID, ...nd }, select: { id: true, name: true, block: { select: { name: true } } } });
  const aptMap = new Map(apts.map(a => [a.name.trim().replace(/^0+/, ''), a]));
  const role = await prisma.role.findFirst({ where: { name: 'Morador', ...nd } });
  if (!role) throw new Error('Role Morador nao encontrada');

  const log: any[] = [];
  const toEmail: any[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => counts[k] = (counts[k] || 0) + 1;

  for (const row of rows) {
    const apt = aptMap.get(row.apt.replace(/^0+/, ''));
    if (!apt) { bump('unidade_nao_encontrada'); log.push({ ...row, status: 'unidade_nao_encontrada' }); continue; }
    const email = normalizeEmail(row.email.trim());
    const ra = await prisma.roleAssignment.findFirst({
      where: { roleId: role.id, contextType: 'apartment', contextId: apt.id, ...nd },
      include: { User: { select: { id: true, email: true, name: true } } },
    });
    if (!ra || !ra.User) { bump('sem_morador'); log.push({ ...row, status: 'sem_morador' }); continue; }
    if (ra.User.email.toLowerCase() === email) { bump('ja_igual'); log.push({ ...row, status: 'ja_igual' }); continue; }

    // Email ja pertence a outro usuario ativo (mesmo dono em varias unidades)?
    const other = await prisma.user.findFirst({ where: { email, ...nd, id: { not: ra.User.id } }, select: { id: true } });
    if (other) {
      const already = await prisma.roleAssignment.findFirst({ where: { userId: other.id, contextId: apt.id, contextType: 'apartment', roleId: role.id, ...nd } });
      if (APPLY) {
        if (already) await prisma.roleAssignment.update({ where: { id: ra.id }, data: { deletedAt: new Date() } });
        else await prisma.roleAssignment.update({ where: { id: ra.id }, data: { userId: other.id } });
        // usuario placeholder fica sem vinculo: arquiva
        const left = await prisma.roleAssignment.count({ where: { userId: ra.User.id, ...nd } });
        if (left === 0 && ra.User.email.includes('@acquaxdobrasil')) await prisma.user.update({ where: { id: ra.User.id }, data: { deletedAt: new Date() } });
      }
      bump('vinculada_a_usuario_existente');
      log.push({ ...row, status: 'vinculada_a_usuario_existente', email, placeholder: ra.User.email });
      continue;
    }

    const pwd = genPwd();
    if (APPLY) {
      try {
        await prisma.user.update({
          where: { id: ra.User.id },
          data: {
            email,
            name: titleCase(row.name) || ra.User.name,
            password: await hash(pwd, 10),
            mustUpdateCredentials: true,
            resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
            resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      } catch (e: any) { bump('erro_update'); log.push({ ...row, status: 'erro_update', error: e.message }); continue; }
    }
    bump('atualizado');
    log.push({ ...row, status: 'atualizado', email, placeholder: ra.User.email });
    toEmail.push({ apt: apt.name, block: apt.block?.name || '', name: titleCase(row.name), email, password: APPLY ? pwd : undefined });
  }

  console.log(APPLY ? 'MODO: APLICADO' : 'MODO: SIMULACAO (nada gravado)');
  console.log('RESUMO:', JSON.stringify(counts));
  fs.writeFileSync(`${DIR}/${APPLY ? 'apply' : 'dryrun'}_log.json`, JSON.stringify(log, null, 1));
  if (APPLY) fs.writeFileSync(`${DIR}/pending_emails.json`, JSON.stringify(toEmail, null, 1));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
