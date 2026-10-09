/** Envia boas-vindas do Pop Art em lotes pequenos e espacados; para ao detectar bloqueio do Zoho. */
import fs from 'fs';
import { sendEmail } from './lib/services/email-service';
import { generateWelcomeEmail } from './lib/services/welcome-email-template';

const F = '/app/conversations/69b1a9efa2b581ebfa5280ce/popart/pending_emails.json';
const OK = '/app/conversations/69b1a9efa2b581ebfa5280ce/popart/sent_ok.json';
async function main() {
  const pending: any[] = JSON.parse(fs.readFileSync(F, 'utf8'));
  const limit = Number(process.argv[2] || 5), delay = Number(process.argv[3] || 8000);
  const sentOk: any[] = fs.existsSync(OK) ? JSON.parse(fs.readFileSync(OK, 'utf8')) : [];
  const left: any[] = []; let n = 0, blocked = false;
  for (const r of pending) {
    if (blocked || n >= limit) { left.push(r); continue; }
    const { subject, html, text } = generateWelcomeEmail({
      residentName: r.name, apartmentName: r.apt, blockName: r.block, complexName: 'Pop Art',
      email: r.email, provisionalPassword: r.password,
    });
    const res = await sendEmail({ to: r.email, toName: r.name, subject, html, text });
    n++;
    if (res.success) { console.log('OK  ', r.apt, r.email); sentOk.push({ apt: r.apt, email: r.email }); }
    else {
      console.log('FALHA', r.apt, r.email, String(res.error).slice(0, 90));
      left.push(r);
      if (String(res.error).includes('Unusual sending activity')) { blocked = true; console.log('>> Zoho bloqueou, parando.'); }
    }
    await new Promise(x => setTimeout(x, delay));
  }
  fs.writeFileSync(F, JSON.stringify(left, null, 1));
  fs.writeFileSync(OK, JSON.stringify(sentOk, null, 1));
  console.log(`RESUMO: enviados agora=${n - left.filter(l => pending.includes(l) && !blocked).length}, total enviados=${sentOk.length}, restantes=${left.length}`);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
