/**
 * Pacifico: cadastra os moradores das 48 unidades a partir do PDF Omnia
 * (pacifico/pacifico_emails.json). Sem envio de email nesta etapa — o envio
 * fica em pacifico_send_welcome.ts (gotejamento anti-bloqueio Zoho).
 * Regras:
 *  - email ja existe em usuario ativo -> so vincula a unidade (sem mexer na conta)
 *  - email novo -> cria usuario (nome, email, senha provisoria, troca obrigatoria
 *    no primeiro login) + RA Morador
 *  - unidade sem email no PDF -> usuario placeholder interno @acquaxdobrasil
 *    (nao recebe boas-vindas por design)
 * Uso: npx tsx pacifico_cadastrar.ts [--apply]
 */
import fs from 'fs';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import prisma from './lib/prisma';
import { normalizeEmail } from './lib/users';

const COMPLEX_ID = 'dda0e0e5-4161-4bfb-b3df-920e4f450b47';
const DIR = '/app/conversations/69b1a9efa2b581ebfa5280ce/pacifico';
const nd = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as any;
const APPLY = process.argv.includes('--apply');

function genPwd(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let p = ''; for (let i = 0; i < 8; i++) p += chars[crypto.randomInt(0, chars.length)];
  return p;
}
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\s*e\/ou\s*/gi, ' e ').replace(/(^|\s|\/)(\S)/g, (_, a, c) => a + c.toUpperCase());

async function linkUser(userId: string, roleId: string, aptId: string) {
  await prisma.roleAssignment.create({
    data: { userId, roleId, contextId: aptId, contextType: 'apartment', createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
  });
}

async function main() {
  const rows: { bloco: string; apt: string; name: string; email: string | null }[] =
    JSON.parse(fs.readFileSync(`${DIR}/pacifico_emails.json`, 'utf8'));

  const apts = await prisma.apartment.findMany({
    where: { complexId: COMPLEX_ID, ...nd },
    select: { id: true, name: true, block: { select: { id: true, name: true } } },
  });
  const aptMap = new Map(apts.map(a => [`${a.block?.name ?? ''}/${a.name}`, a]));
  const role = await prisma.role.findFirst({ where: { name: 'Morador', ...nd } });
  if (!role) throw new Error('Role Morador nao encontrada');

  const log: any[] = [];
  const toEmail: any[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => counts[k] = (counts[k] || 0) + 1;
  const createdUserIds = new Map<string, string>(); // email -> userId (multi-unidade no mesmo lote)

  for (const row of rows) {
    const apt = aptMap.get(`${row.bloco}/${row.apt}`);
    if (!apt) { bump('unidade_nao_encontrada'); log.push({ ...row, status: 'unidade_nao_encontrada' }); continue; }

    const email = row.email ? normalizeEmail(row.email.trim()) : `pacificob${row.bloco}-a${row.apt}@acquaxdobrasil.com.br`;
    const name = titleCase(row.name);

    const ra = await prisma.roleAssignment.findFirst({
      where: { roleId: role.id, contextType: 'apartment', contextId: apt.id, ...nd },
      include: { User: { select: { id: true, email: true } } },
    });
    if (ra && ra.User) { bump('ja_tem_morador'); log.push({ ...row, status: 'ja_tem_morador', atual: ra.User.email }); continue; }

    const other = await prisma.user.findFirst({ where: { email, ...nd }, select: { id: true, name: true } });
    const userId = other?.id || createdUserIds.get(email);
    if (userId) {
      if (APPLY) await linkUser(userId, role.id, apt.id);
      bump('vinculada_a_usuario_existente');
      log.push({ ...row, status: 'vinculada_a_usuario_existente', email });
      continue;
    }

    const pwd = genPwd();
    if (APPLY) {
      const u = await prisma.user.create({
        data: {
          name, email,
          password: await hash(pwd, 10),
          mustUpdateCredentials: true,
          resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
          resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        },
      });
      createdUserIds.set(email, u.id);
      await linkUser(u.id, role.id, apt.id);
    }
    const interno = email.endsWith('@acquaxdobrasil.com.br');
    bump(interno ? 'criado_placeholder' : 'criado');
    log.push({ ...row, status: interno ? 'criado_placeholder' : 'criado', email });
    if (!interno) toEmail.push({ apt: apt.name, block: row.bloco, name, email, password: APPLY ? pwd : undefined });
  }

  console.log(APPLY ? 'MODO: APLICADO' : 'MODO: SIMULACAO (nada gravado)');
  console.log('RESUMO:', JSON.stringify(counts));
  fs.writeFileSync(`${DIR}/${APPLY ? 'apply' : 'dryrun'}_log.json`, JSON.stringify(log, null, 1));
  if (APPLY) fs.writeFileSync(`${DIR}/pending_emails.json`, JSON.stringify(toEmail, null, 1));
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
