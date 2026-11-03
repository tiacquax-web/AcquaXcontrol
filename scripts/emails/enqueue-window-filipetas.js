/**
 * Enfileira filipetas de relatórios de consumo criados em uma janela de datas,
 * respeitando a janela de referência (mês corrente + 2 anteriores).
 * Uso: node scripts/emails/enqueue-window-filipetas.js [--apply] [--desde=YYYY-MM-DD] [--ate=YYYY-MM-DD] [--refs=10/2026,11/2026]
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const APPLY = process.argv.includes('--apply');
const DESDE = arg('desde', '2026-10-30');
const ATE = arg('ate', '2026-11-03');
const REFS = arg('refs', '10/2026,11/2026').split(',').map(r => r.split('/'));

// 00:00 e 23:59:59 em America/Sao_Paulo (UTC-3)
const startUTC = new Date(`${DESDE}T00:00:00-03:00`); // meia-noite em São Paulo
const endSP = new Date(`${ATE}T23:59:59.999-03:00`);   // fim do dia em São Paulo

const BLOCKED = ['acquaxdobrasil.com.br','acquaxcontrol.com.br','acquaxcontrol.com','acquax.com','acquax.com.br'];
const isBlocked = (email) => {
  if (!email) return true;
  const domain = email.toLowerCase().trim().split('@')[1];
  if (!domain) return true;
  if (BLOCKED.some(b => domain === b || domain.endsWith('.' + b))) return true;
  return domain.includes('acquax');
};

const recipientCache = new Map();
async function recipientsFor(apartmentId) {
  if (!apartmentId) return [];
  if (recipientCache.has(apartmentId)) return recipientCache.get(apartmentId);
  const assignments = await p.roleAssignment.findMany({
    where: { contextId: apartmentId, contextType: 'apartment', deletedAt: null },
    select: { User: { select: { id: true, name: true, email: true, deletedAt: true } } },
  });
  const seen = new Set(); const out = [];
  for (const a of assignments) {
    const u = a.User;
    if (!u || u.deletedAt || !u.email || seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({ id: u.id, name: u.name, email: u.email });
  }
  recipientCache.set(apartmentId, out);
  return out;
}

(async () => {
  console.log(`janela de criação: ${DESDE} a ${ATE} (America/Sao_Paulo) | referências: ${REFS.map(r => r.join('/')).join(', ')}`);
  for (const [monthRef, yearRef] of REFS) {
    const existing = await p.emailJob.findMany({
      where: { monthRef, yearRef },
      select: { apartmentConsumptionReportId: true, status: true },
    });
    const done = new Set(existing.filter(j => ['sent', 'pending'].includes(j.status)).map(j => j.apartmentConsumptionReportId).filter(Boolean));

    let cursor = null, scanned = 0, noEmail = 0, alreadyOk = 0;
    const toCreate = [];
    while (true) {
      const batch = await p.apartmentConsumptionReport.findMany({
        where: { monthRef, yearRef, createdAt: { gte: startUTC, lte: endSP } },
        select: { id: true, apartmentId: true, dealershipReadingId: true, complexId: true, apartment: { select: { name: true } } },
        orderBy: { id: 'asc' },
        take: 400,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;
      for (const r of batch) {
        scanned++;
        if (done.has(r.id)) { alreadyOk++; continue; }
        const recs = (await recipientsFor(r.apartmentId)).filter(u => !isBlocked(u.email));
        if (recs.length === 0) { noEmail++; continue; }
        for (const u of recs) {
          toCreate.push({
            apartmentConsumptionReportId: r.id,
            dealershipReadingId: r.dealershipReadingId || null,
            toEmail: u.email, toName: u.name || null,
            subject: `Filipeta ${monthRef}/${yearRef} - ${r.apartment?.name || ''}`.trim(),
            monthRef, yearRef,
            complexId: r.complexId || null, apartmentId: r.apartmentId || null,
            status: 'pending', category: 'filipeta', origin: 'queue', priority: 5, attempts: 0,
          });
        }
      }
    }

    const byComplex = new Map();
    for (const j of toCreate) byComplex.set(j.complexId || 'sem', (byComplex.get(j.complexId || 'sem') || 0) + 1);
    if (byComplex.size) {
      const names = await p.complex.findMany({ where: { id: { in: [...byComplex.keys()].filter(k => k !== 'sem') } }, select: { id: true, socialName: true } });
      const nameOf = new Map(names.map(n => [n.id, n.socialName]));
      console.log(`  [${monthRef}/${yearRef}] por condomínio:`);
      for (const [k, v] of [...byComplex.entries()].sort((a, b) => b[1] - a[1])) console.log('   ', (nameOf.get(k) || '(sem)').slice(0, 32).padEnd(33), v);
    }
    console.log(`[${monthRef}/${yearRef}] relatórios no período: ${scanned} | já enviados/na fila: ${alreadyOk} | sem e-mail: ${noEmail} | a enfileirar: ${toCreate.length}`);

    if (APPLY && toCreate.length) {
      let created = 0, failed = 0;
      for (const job of toCreate) {
        try { await p.emailJob.create({ data: job }); created++; }
        catch (e) { failed++; if (failed <= 3) console.error('  falha:', String(e.message).slice(0, 120)); }
      }
      console.log(`[${monthRef}/${yearRef}] enfileirados: ${created} | falhas: ${failed}`);
    }
  }
  await p.$disconnect();
})();
