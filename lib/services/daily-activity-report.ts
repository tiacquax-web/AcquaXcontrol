/**
 * lib/services/daily-activity-report.ts
 *
 * Monta o resumo diário de atividades (usuários, condomínios, e-mails e
 * relatórios gerados) usado pelo cron /api/cron/daily-activity-report.
 * Fica aqui, e não na rota, para poder ser testado fora do Next.
 */

import prisma from '@/lib/prisma';
import { analisarProdutividade, type AnaliseProdutividade } from '@/lib/services/team-productivity';

export const TZ = 'America/Sao_Paulo';
export const DESTINATARIOS_PADRAO = ['adm@acquaxdobrasil.com.br'];

/** 00:00 de hoje no horário de Brasília, como instante UTC. */
function inicioDoDiaBRT(): Date {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // YYYY-MM-DD
  return new Date(`${partes}T00:00:00-03:00`);
}

function faixaHora(min?: Date | string | null, max?: Date | string | null): string {
  if (!min && !max) return '—';
  const a = horaBRT(min); const b = horaBRT(max);
  return a === b ? a : `${a}–${b}`;
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

const JORNADA_ALERTA = 30;

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
    by: ['complexId', 'monthRef', 'yearRef', 'utilityType', 'createdByUserId'],
    where: { createdAt: { gte: inicio } },
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });
  const autoresRelatorio = [...new Set(relatorios.map((x: any) => x.createdByUserId).filter(Boolean))] as string[];
  if (autoresRelatorio.length) {
    const us = await prisma.user.findMany({ where: { id: { in: autoresRelatorio } }, select: { id: true, name: true } });
    for (const u of us) if (!nomeAutor.has(u.id)) nomeAutor.set(u.id, u.name);
  }
  const complexosRelatorio = relatorios.length
    ? await prisma.complex.findMany({
        where: { id: { in: [...new Set(relatorios.map((r) => r.complexId).filter(Boolean))] as string[] } },
        select: { id: true, socialName: true },
      })
    : [];
  const nomeComplexo = new Map(complexosRelatorio.map((c) => [c.id, c.socialName]));

  // ── 5. Produtividade do responsável pela atualização do sistema ──────────
  let produtividade: AnaliseProdutividade | null = null;
  try {
    produtividade = await analisarProdutividade();
  } catch (e: any) {
    console.warn('[daily-report] análise de produtividade falhou:', e?.message);
  }

  return {
    inicio,
    produtividade,
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

  const secao = (titulo: string, subtitulo: string, corpo: string, explicacao?: string) => `
    <div style="margin:0 0 22px;">
      <h2 style="margin:0 0 2px;font-size:15px;color:#0f172a;">${esc(titulo)}</h2>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">${esc(subtitulo)}</p>
      ${explicacao ? `<p style="margin:0 0 10px;font-size:11px;color:#94a3b8;font-style:italic;">${esc(explicacao)}</p>` : '<div style="height:6px"></div>'}
      ${corpo}
    </div>`;


  // ── Produtividade ────────────────────────────────────────────────────────
  const blocoProdutividade = (p: AnaliseProdutividade): string => {
    const mmss = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
    const corPct = (v: number | null) => (v === null ? '#64748b' : v >= 90 ? '#047857' : v >= 70 ? '#b45309' : '#b91c1c');
    const kpi = (rotulo: string, valor: string, cor = '#0f172a') =>
      `<td style="padding:10px 12px;border:1px solid #e2e8f0;background:#fff;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${esc(rotulo)}</div>
        <div style="font-size:16px;font-weight:700;color:${cor};margin-top:2px;">${esc(valor)}</div>
      </td>`;

    const maxHora = Math.max(1, ...p.porHora.map((h) => h.total));
    const linhasHoras = p.porHora.map((h) => {
      const largura = Math.round((h.total / maxHora) * 100);
      const barra = `<div style="background:#e2e8f0;border-radius:3px;height:8px;width:100%;max-width:150px;">
        <div style="background:${h.total ? '#0d9488' : '#e2e8f0'};height:8px;border-radius:3px;width:${largura}%;"></div></div>`;
      return `<tr>${td(`<strong>${h.hora}h</strong>`)}${td(String(h.relatorios))}${td(String(h.cadastros))}${td(String(h.outros))}${td(barra)}</tr>`;
    }).join('');

    const linhasLacunas = p.lacunas.length
      ? p.lacunas.map((l) => `<tr>${td(`${l.de} — ${l.ate}`)}${td(mmss(l.minutos), l.minutos >= 60 ? '#b91c1c' : '#b45309')}</tr>`).join('')
      : `<tr><td colspan="2" style="padding:10px 12px;color:#94a3b8;font-size:13px;">Nenhuma lacuna acima de ${JORNADA_ALERTA} minutos.</td></tr>`;

    const alertas = p.alertas.length
      ? `<div style="border-left:4px solid #f59e0b;background:#fffbeb;padding:10px 14px;margin:12px 0 0;border-radius:4px;">
          <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px;">Pontos de atenção</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#78350f;">${p.alertas.map((a) => `<li style="margin:2px 0;">${esc(a)}</li>`).join('')}</ul>
        </div>`
      : `<div style="border-left:4px solid #10b981;background:#ecfdf5;padding:10px 14px;margin:12px 0 0;border-radius:4px;font-size:13px;color:#065f46;">Dia dentro do esperado: sem lacunas relevantes e volume próximo da referência.</div>`;

    return `
    <div style="margin:0 0 22px;">
      <h2 style="margin:0 0 2px;font-size:15px;color:#0f172a;">Análise de produtividade — ${esc(p.colaborador.nome)}</h2>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">${esc(p.dia)} (${esc(p.diaSemana)}) · jornada ${p.janela.inicio}h–${p.janela.almocoInicio}h e ${p.janela.almocoFim}h–${p.janela.fim}h</p>
      <p style="margin:0 0 10px;font-size:11px;color:#94a3b8;font-style:italic;">Conta o que foi registrado no AcquaXcontrol. Reuniões, telefone e planilhas fora do sistema não aparecem aqui.</p>
      <table role="presentation" style="border-collapse:collapse;width:100%;margin-bottom:6px;">
        <tr>
          ${kpi('Tempo sem trabalho efetivo', mmss(p.minutosOciosos), p.minutosOciosos >= 120 ? '#b91c1c' : p.minutosOciosos >= 60 ? '#b45309' : '#047857')}
          ${kpi('Do tempo de jornada', `${p.percentualSemTrabalho}%`, p.percentualSemTrabalho >= 30 ? '#b91c1c' : '#0f172a')}
          ${kpi('Tempo com trabalho efetivo', mmss(p.minutosTrabalhoEfetivo))}
          ${kpi('Relatórios do dia', String(p.totais.relatorios))}
        </tr>
      </table>
      <table role="presentation" style="border-collapse:collapse;width:100%;margin-bottom:6px;">
        <tr>
          ${kpi('Primeira alteração no sistema', p.primeiraAcao ? `${p.primeiraAcao.hora}` : 'nenhuma')}
          ${kpi('Última alteração no sistema', p.ultimaAcao ? `${p.ultimaAcao.hora}` : 'nenhuma')}
          ${kpi('vs. mediana 3 semanas', p.percentualDaBase === null ? '—' : `${p.percentualDaBase}%`, corPct(p.percentualDaBase))}
          ${kpi('Cadastros', String(p.totais.cadastros))}
        </tr>
      </table>
      <p style="margin:0 0 10px;font-size:12px;color:#475569;">
        <strong>Sem trabalho efetivo</strong> = ${mmss(p.minutosOciosos)} de ${mmss(p.minutosUteis)} de jornada útil (${p.percentualSemTrabalho}%),
        somando os intervalos acima de ${JORNADA_ALERTA} min sem nenhuma alteração no AcquaXcontrol, fora do almoço.
        Primeira alteração ${p.primeiraAcao ? `<strong>${esc(p.primeiraAcao.hora)}</strong> (${esc(p.primeiraAcao.rotulo)})` : 'não houve'},
        última ${p.ultimaAcao ? `<strong>${esc(p.ultimaAcao.hora)}</strong> (${esc(p.ultimaAcao.rotulo)})` : 'não houve'}.
        ${p.minutosAntesPrimeira > 0 ? `Começou ${mmss(p.minutosAntesPrimeira)} depois do início da jornada.` : ''}
        ${p.minutosDepoisUltima > 0 ? `Ficou ${mmss(p.minutosDepoisUltima)} sem registro antes do fim.` : ''}
      </p>
      <table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#f1f5f9;color:#334155;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Hora</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Relatórios</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Cadastros</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Outros</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Volume</th>
        </tr>
        ${linhasHoras}
      </table>
      <table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px;">
        <tr style="background:#f1f5f9;color:#334155;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Período sem registro</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Duração</th>
        </tr>
        ${linhasLacunas}
      </table>
      ${alertas}
      <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">Referência: mediana de ${p.base.dias} dias com movimento (${p.base.mediana}/dia), melhor dia ${p.base.melhor}, média ${p.base.media}; ${p.base.diasSemRegistro} dia(s) sem nenhum registro nas últimas 3 semanas. ${p.horasComAtividade} de ${p.horasUteis} horas da jornada tiveram atividade.</p>
    </div>`;
  };

  // Usuários
  const linhasUsuarios = [
    ...r.usuariosCriados.map((u) =>
      `<tr>${td(`<strong>${esc(u.name)}</strong><br><span style="color:#64748b;font-size:12px;">${esc(u.email)}</span>`)}${td('criado', '#047857')}${td(horaBRT(u.createdAt))}${td('—')}</tr>`),
    ...r.usuariosAtualizados.map((u) =>
      `<tr>${td(`<strong>${esc(u.name)}</strong><br><span style="color:#64748b;font-size:12px;">${esc(u.email)}</span>`)}${td('atualizado', '#b45309')}${td(horaBRT(u.updatedAt))}${td(esc(u.updatedByUserId ? (r.nomeAutor.get(u.updatedByUserId) || 'não registrado') : 'não registrado'))}</tr>`),
  ];

  // Condomínios
  // Quantos relatórios de consumo cada condomínio gerou hoje. Serve para o leitor
  // ligar as duas seções: cadastro mexido não significa relatório gerado.
  const relatoriosPorComplexo = new Map<string, number>();
  for (const x of r.relatorios) {
    if (!x.complexId) continue;
    relatoriosPorComplexo.set(x.complexId, (relatoriosPorComplexo.get(x.complexId) || 0) + x._count._all);
  }
  const colunaRelatorios = (complexId: string | null | undefined) => {
    const n = (complexId && relatoriosPorComplexo.get(complexId)) || 0;
    return n ? td(String(n), '#047857') : td('0', '#94a3b8');
  };

  const linhasCondominios = [
    ...r.condominiosCriados.map((c) =>
      `<tr>${td(`<strong>${esc(c.socialName)}</strong>`)}${td('criado', '#047857')}${td(horaBRT(c.createdAt))}${td('—')}${colunaRelatorios(c.id)}</tr>`),
    ...r.condominiosAtualizados.map((c) =>
      `<tr>${td(`<strong>${esc(c.socialName)}</strong>`)}${td('atualizado', '#b45309')}${td(horaBRT(c.updatedAt))}${td(esc(c.updatedByUserId ? (r.nomeAutor.get(c.updatedByUserId) || 'não registrado') : 'não registrado'))}${colunaRelatorios(c.id)}</tr>`),
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
      const doDia = r.jobs.filter((j) => (j.category || 'outro') === cat).map((j) => new Date(j.createdAt).getTime());
      const hora = doDia.length ? faixaHora(new Date(Math.min(...doDia)), new Date(Math.max(...doDia))) : '—';
      return `<tr>${td(`<strong>${esc(cat)}</strong>`)}${td(String(n.total))}${td(partes.join(' · '), cor)}${td(hora)}${td(n.failed ? 'ver falhas abaixo' : '—')}</tr>`;
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
      `<tr>${td(`<strong>${esc(nomeDoRelatorio(x.complexId) || '—')}</strong>`)}${td(`${esc(x.monthRef)}/${esc(x.yearRef)}`)}${td(esc(x.utilityType || '—'))}${td(String(x._count._all))}${td(faixaHora((x as any)._min?.createdAt, (x as any)._max?.createdAt))}${td(esc(((x as any).createdByUserId && r.nomeAutor.get((x as any).createdByUserId)) || 'não registrado'))}</tr>`);

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

    ${secao('Usuários', `${r.usuariosCriados.length} criado(s) e ${r.usuariosAtualizados.length} atualizado(s)`, tabela(['Usuário', 'Ação', 'Hora', 'Responsável'], linhasUsuarios, 'Nenhum usuário criado ou alterado hoje.'), 'Cadastros de usuários criados ou alterados hoje.')}

    ${secao('Condomínios — cadastro', `${r.condominiosCriados.length} criado(s) e ${r.condominiosAtualizados.length} atualizado(s)`, tabela(['Condomínio', 'Ação', 'Hora', 'Responsável', 'Relatórios hoje'], linhasCondominios, 'Nenhum condomínio criado ou alterado hoje.'), 'Alterações no cadastro do condomínio (nome, endereço, dados). Não significa que gerou relatório de consumo hoje.')}

    ${secao('Envio de e-mails', `${totalEnviados} enviado(s) de ${totalEmails} processado(s)${r.pendentes ? ` · ${r.pendentes} ainda na fila` : ''}`, tabela(['Categoria', 'Total', 'Situação', 'Hora', 'Observação'], linhasEmails, 'Nenhum e-mail processado hoje.'))}

    ${r.falhas.length ? secao('Falhas de envio', `${r.falhas.length} e-mail(s) falharam hoje`, tabela(['Categoria', 'Destinatário', 'Hora', 'Erro'], linhasFalhas, '—')) : ''}

    ${r.produtividade ? blocoProdutividade(r.produtividade) : '<p style="font-size:12px;color:#b45309;margin:0 0 18px;">Análise de produtividade indisponível hoje (usuário do sistema não localizado).</p>'}

    ${secao('Relatórios de consumo gerados', `${totalRelatorios} relatório(s)`, tabela(['Condomínio', 'Referência', 'Utilidade', 'Relatórios', 'Hora', 'Gerado por'], linhasRelatorios, 'Nenhum relatório gerado hoje.'), 'Relatórios de consumo (por unidade e mês) calculados hoje — é o que dispara as filipetas. Um condomínio pode aparecer aqui sem ter o cadastro alterado, e vice-versa.')}

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

