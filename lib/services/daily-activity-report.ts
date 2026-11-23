/**
 * lib/services/daily-activity-report.ts
 *
 * Monta o resumo diário de atividades (usuários, condomínios, e-mails e
 * relatórios gerados) usado pelo cron /api/cron/daily-activity-report.
 * Fica aqui, e não na rota, para poder ser testado fora do Next.
 */

import prisma from '@/lib/prisma';

export const TZ = 'America/Sao_Paulo';
export const DESTINATARIOS_PADRAO = ['giulia.melo@acquaxdobrasil.com.br'];

/** 00:00 de hoje no horário de Brasília, como instante UTC. */
function inicioDoDiaBRT(): Date {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // YYYY-MM-DD
  return new Date(`${partes}T00:00:00-03:00`);
}

function horaBRT(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  }).format(new Date(d));
}

export function dataBRT(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

const ROTULO_STATUS: Record<string, string> = {
  sent: 'enviado', pending: 'na fila', failed: 'falhou', skipped: 'ignorado', processing: 'processando',
};

export async function montarResumo() {
  const inicio = inicioDoDiaBRT();

  // ── 1. Usuários ────────────────────────────────────────────────────────────
  const usuariosCriados = await prisma.user.findMany({
    where: { createdAt: { gte: inicio } },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const usuariosAtualizados = await prisma.user.findMany({
    where: { updatedAt: { gte: inicio }, createdAt: { lt: inicio } },
    select: { id: true, name: true, email: true, updatedAt: true, updatedByUserId: true },
    orderBy: { updatedAt: 'asc' },
    take: 300,
  });

  // ── 2. Condomínios ─────────────────────────────────────────────────────────
  const condominiosCriados = await prisma.complex.findMany({
    where: { createdAt: { gte: inicio } },
    select: { id: true, socialName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const condominiosAtualizados = await prisma.complex.findMany({
    where: { updatedAt: { gte: inicio }, createdAt: { lt: inicio } },
    select: { id: true, socialName: true, updatedAt: true, updatedByUserId: true },
    orderBy: { updatedAt: 'asc' },
    take: 100,
  });

  // Nomes de quem executou as alterações (usuários + condomínios)
  const autorIds = [
    ...new Set([
      ...usuariosAtualizados.map((u) => u.updatedByUserId).filter(Boolean),
      ...condominiosAtualizados.map((c) => c.updatedByUserId).filter(Boolean),
    ]),
  ] as string[];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nomeAutor = new Map(autores.map((a) => [a.id, a.name || a.email]));

  // ── 3. E-mails ─────────────────────────────────────────────────────────────
  const jobs = await prisma.emailJob.findMany({
    where: { createdAt: { gte: inicio } },
    select: { id: true, status: true, category: true, origin: true, createdAt: true, sentAt: true, errorMessage: true, toEmail: true },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  const porCategoria = new Map<string, { total: number; sent: number; pending: number; failed: number; skipped: number }>();
  for (const j of jobs) {
    const cat = j.category || 'outro';
    const linha = porCategoria.get(cat) || { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0 };
    linha.total++;
    if (j.status === 'sent') linha.sent++;
    else if (j.status === 'pending') linha.pending++;
    else if (j.status === 'failed') linha.failed++;
    else if (j.status === 'skipped') linha.skipped++;
    porCategoria.set(cat, linha);
  }
  const falhas = jobs.filter((j) => j.status === 'failed').slice(0, 25);
  const pendentes = jobs.filter((j) => j.status === 'pending').length;

  // ── 4. Relatórios de consumo gerados ──────────────────────────────────────
  const relatorios = await prisma.apartmentConsumptionReport.groupBy({
    by: ['complexId', 'monthRef', 'yearRef', 'utilityType'],
    where: { createdAt: { gte: inicio } },
    _count: { _all: true },
  });
  const complexosRelatorio = relatorios.length
    ? await prisma.complex.findMany({
        where: { id: { in: [...new Set(relatorios.map((r) => r.complexId).filter(Boolean))] as string[] } },
        select: { id: true, socialName: true },
      })
    : [];
  const nomeComplexo = new Map(complexosRelatorio.map((c) => [c.id, c.socialName]));

  return {
    inicio,
    usuariosCriados,
    usuariosAtualizados,
    condominiosCriados,
    condominiosAtualizados,
    nomeAutor,
    jobs,
    porCategoria,
    falhas,
    pendentes,
    relatorios,
    nomeComplexo,
  };
}

export function montarHtml(r: Awaited<ReturnType<typeof montarResumo>>): string {
  const hoje = dataBRT(new Date());
  const linhaVazia = (txt: string) =>
    `<tr><td colspan="4" style="padding:10px 12px;color:#94a3b8;font-size:13px;">${esc(txt)}</td></tr>`;

  const tabela = (cabecalhos: string[], linhas: string[], vazio: string) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;">
          ${cabecalhos.map((h) => `<th align="left" style="padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:600;">${esc(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody style="font-size:13px;color:#1e293b;">
        ${linhas.length ? linhas.join('') : linhaVazia(vazio)}
      </tbody>
    </table>`;

  const td = (txt: string, cor = '#1e293b') => `<td style="padding:9px 12px;border-top:1px solid #f1f5f9;color:${cor};">${txt}</td>`;

  const secao = (titulo: string, subtitulo: string, corpo: string) => `
    <div style="margin:0 0 22px;">
      <h2 style="margin:0 0 2px;font-size:15px;color:#0f172a;">${esc(titulo)}</h2>
      <p style="margin:0 0 10px;font-size:12px;color:#64748b;">${esc(subtitulo)}</p>
      ${corpo}
    </div>`;

  // Usuários
  const linhasUsuarios = [
    ...r.usuariosCriados.map((u) =>
      `<tr>${td(`<strong>${esc(u.name)}</strong><br><span style="color:#64748b;font-size:12px;">${esc(u.email)}</span>`)}${td('criado', '#047857')}${td(horaBRT(u.createdAt))}${td('—')}</tr>`),
    ...r.usuariosAtualizados.map((u) =>
      `<tr>${td(`<strong>${esc(u.name)}</strong><br><span style="color:#64748b;font-size:12px;">${esc(u.email)}</span>`)}${td('atualizado', '#b45309')}${td(horaBRT(u.updatedAt))}${td(esc(u.updatedByUserId ? (r.nomeAutor.get(u.updatedByUserId) || 'não registrado') : 'não registrado'))}</tr>`),
  ];

  // Condomínios
  const linhasCondominios = [
    ...r.condominiosCriados.map((c) =>
      `<tr>${td(`<strong>${esc(c.socialName)}</strong>`)}${td('criado', '#047857')}${td(horaBRT(c.createdAt))}${td('—')}</tr>`),
    ...r.condominiosAtualizados.map((c) =>
      `<tr>${td(`<strong>${esc(c.socialName)}</strong>`)}${td('atualizado', '#b45309')}${td(horaBRT(c.updatedAt))}${td(esc(c.updatedByUserId ? (r.nomeAutor.get(c.updatedByUserId) || 'não registrado') : 'não registrado'))}</tr>`),
  ];

  // E-mails por categoria
  const linhasEmails = [...r.porCategoria.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, n]) => {
      const partes = [`${n.sent} enviados`];
      if (n.pending) partes.push(`${n.pending} na fila`);
      if (n.failed) partes.push(`${n.failed} falharam`);
      if (n.skipped) partes.push(`${n.skipped} ignorados`);
      const cor = n.failed ? '#b91c1c' : n.pending ? '#b45309' : '#047857';
      return `<tr>${td(`<strong>${esc(cat)}</strong>`)}${td(String(n.total))}${td(partes.join(' · '), cor)}${td(n.failed ? 'ver falhas abaixo' : '—')}</tr>`;
    });

  const totalEmails = r.jobs.length;
  const totalEnviados = r.jobs.filter((j) => j.status === 'sent').length;

  const linhasFalhas = r.falhas.map((j) =>
    `<tr>${td(esc(j.category || 'outro'))}${td(esc(j.toEmail || '—'))}${td(horaBRT(j.createdAt))}${td(esc((j.errorMessage || 'sem detalhe').slice(0, 160)), '#b91c1c')}</tr>`);

  // Relatórios
  const nomeDoRelatorio = (id: string | null | undefined) => (id ? r.nomeComplexo.get(id) : '') || ''
  const linhasRelatorios = r.relatorios
    .sort((a, b) => nomeDoRelatorio(a.complexId).localeCompare(nomeDoRelatorio(b.complexId)))
    .map((x) =>
      `<tr>${td(`<strong>${esc(nomeDoRelatorio(x.complexId) || '—')}</strong>`)}${td(`${esc(x.monthRef)}/${esc(x.yearRef)}`)}${td(esc(x.utilityType || '—'))}${td(String(x._count._all))}</tr>`);

  const totalRelatorios = r.relatorios.reduce((s, x) => s + x._count._all, 0);

  const cards = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr>
        ${[
          ['Usuários', String(r.usuariosCriados.length + r.usuariosAtualizados.length)],
          ['Condomínios', String(r.condominiosCriados.length + r.condominiosAtualizados.length)],
          ['E-mails', `${totalEnviados}/${totalEmails}`],
          ['Relatórios', String(totalRelatorios)],
        ].map(([rotulo, valor]) => `
          <td style="padding:0 5px;" width="25%">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;">${esc(rotulo)}</div>
              <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;">${esc(valor)}</div>
            </div>
          </td>`).join('')}
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px;">
    <div style="border-bottom:3px solid #0d9488;padding-bottom:12px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:20px;color:#0d9488;">Resumo do dia — ${esc(hoje)}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Tudo que foi cadastrado e alterado no AcquaXcontrol hoje.</p>
    </div>

    ${cards}

    ${secao('Usuários', `${r.usuariosCriados.length} criado(s) e ${r.usuariosAtualizados.length} atualizado(s)`, tabela(['Usuário', 'Ação', 'Hora', 'Responsável'], linhasUsuarios, 'Nenhum usuário criado ou alterado hoje.'))}

    ${secao('Condomínios', `${r.condominiosCriados.length} criado(s) e ${r.condominiosAtualizados.length} atualizado(s)`, tabela(['Condomínio', 'Ação', 'Hora', 'Responsável'], linhasCondominios, 'Nenhum condomínio criado ou alterado hoje.'))}

    ${secao('Envio de e-mails', `${totalEnviados} enviado(s) de ${totalEmails} processado(s)${r.pendentes ? ` · ${r.pendentes} ainda na fila` : ''}`, tabela(['Categoria', 'Total', 'Situação', 'Observação'], linhasEmails, 'Nenhum e-mail processado hoje.'))}

    ${r.falhas.length ? secao('Falhas de envio', `${r.falhas.length} e-mail(s) falharam hoje`, tabela(['Categoria', 'Destinatário', 'Hora', 'Erro'], linhasFalhas, '—')) : ''}

    ${secao('Relatórios de consumo gerados', `${totalRelatorios} relatório(s)`, tabela(['Condomínio', 'Referência', 'Utilidade', 'Relatórios'], linhasRelatorios, 'Nenhum relatório gerado hoje.'))}

    <p style="margin:18px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
      Relatório automático do AcquaXcontrol · todos os dias às 19h30 (horário de Brasília)
    </p>
  </div>
</body></html>`;
}

export function textoPlano(r: Awaited<ReturnType<typeof montarResumo>>): string {
  const linhas = [
    `Resumo do dia — ${dataBRT(new Date())}`,
    '',
    `Usuários: ${r.usuariosCriados.length} criado(s), ${r.usuariosAtualizados.length} atualizado(s)`,
    ...r.usuariosCriados.map((u) => `  + ${u.name} <${u.email}> ${horaBRT(u.createdAt)}`),
    ...r.usuariosAtualizados.map((u) => `  ~ ${u.name} <${u.email}> ${horaBRT(u.updatedAt)} por ${u.updatedByUserId ? (r.nomeAutor.get(u.updatedByUserId) || 'não registrado') : 'não registrado'}`),
    '',
    `Condomínios: ${r.condominiosCriados.length} criado(s), ${r.condominiosAtualizados.length} atualizado(s)`,
    ...r.condominiosCriados.map((c) => `  + ${c.socialName} ${horaBRT(c.createdAt)}`),
    ...r.condominiosAtualizados.map((c) => `  ~ ${c.socialName} ${horaBRT(c.updatedAt)} por ${c.updatedByUserId ? (r.nomeAutor.get(c.updatedByUserId) || 'não registrado') : 'não registrado'}`),
    '',
    `E-mails: ${r.jobs.filter((j) => j.status === 'sent').length} enviado(s) de ${r.jobs.length}`,
    ...[...r.porCategoria.entries()].map(([cat, n]) => `  ${cat}: ${n.sent} enviados, ${n.pending} na fila, ${n.failed} falharam, ${n.skipped} ignorados`),
    ...r.falhas.map((j) => `  ! ${j.category} → ${j.toEmail}: ${(j.errorMessage || '').slice(0, 120)}`),
    '',
    `Relatórios gerados: ${r.relatorios.reduce((s, x) => s + x._count._all, 0)}`,
    ...r.relatorios.map((x) => `  ${(x.complexId && r.nomeComplexo.get(x.complexId)) || '—'} ${x.monthRef}/${x.yearRef} ${x.utilityType || ''}: ${x._count._all}`),
  ];
  return linhas.join('\n');
}

