/** Re-reset dos 2 usuarios cujo email falhou no bloqueio Zoho (Acquax bl1 101/102). */
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import prisma from './lib/prisma';
import { sendEmail } from './lib/services/email-service';

function genPwd() { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 8; i++) p += c[crypto.randomInt(0, c.length)]; return p; }

const html = (pwd: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
<h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
<p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p></div>
<div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
<h2 style="color: #333;">Senha Redefinida</h2>
<p style="color: #555; line-height: 1.6;">Sua senha de acesso ao sistema AcquaXcontrol foi redefinida.</p>
<div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: center;">
<p style="color: #999; font-size: 12px; margin: 0 0 4px;">Sua nova senha temporaria:</p>
<p style="font-size: 24px; font-weight: bold; color: #0066B3; margin: 0; letter-spacing: 2px;">${pwd}</p></div>
<p style="color: #555; line-height: 1.6;">Acesse <a href="https://www.acquaxcontrol.com.br" style="color: #0066B3;">www.acquaxcontrol.com.br</a> e faca login com esta senha. Voce sera solicitado a criar uma nova senha no primeiro acesso.</p>
<div style="text-align: center; margin: 24px 0;"><a href="https://www.acquaxcontrol.com.br" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a></div>
<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
<p style="color: #999; font-size: 12px;">Este e um email automatico do sistema AcquaXcontrol. Nao responda.<br/>AcquaX do Brasil - Sistema de medicao e controle</p></div></div>`;

async function main() {
  for (const email of ['degoudanielle1@gmail.com', 'marquesarmando1947@gmail.com']) {
    const u = await prisma.user.findFirst({ where: { email, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } });
    if (!u) { console.log('não achou', email); continue; }
    const pwd = genPwd();
    await prisma.user.update({ where: { id: u.id }, data: { password: await hash(pwd, 10), mustUpdateCredentials: true, resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN', resetTokenExpiry: new Date(Date.now() + 365*24*60*60*1000) } });
    const r = await sendEmail({ to: email, toName: u.name || undefined, subject: 'Senha Redefinida - AcquaXcontrol', html: html(pwd), text: `Sua senha foi redefinida. Nova senha temporaria: ${pwd}. Acesse www.acquaxcontrol.com.br e faca login.` });
    console.log(r.success ? 'OK ' : 'FALHA ', email, r.error || '');
    await new Promise(x => setTimeout(x, 6000));
  }
  await prisma.$disconnect();
}
main().finally(() => process.exit(0));
