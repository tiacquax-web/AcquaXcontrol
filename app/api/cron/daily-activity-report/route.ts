/**
 * app/api/cron/daily-activity-report/route.ts
 *
 * Resumo diário do que foi cadastrado/alterado no sistema, enviado por e-mail
 * todos os dias às 19h30 (BRT) — vercel.json: "30 22 * * *" (UTC).
 *
 * Seções:
 *   1. Usuários criados e atualizados no dia (com quem fez a alteração)
 *   2. Condomínios criados e atualizados no dia (com quem fez a alteração)
 *   3. E-mails: enviados, na fila, falhados e ignorados (por categoria)
 *   4. Relatórios de consumo gerados no dia (contexto das filipetas)
 *
 * Autenticação: igual aos outros crons — header do Vercel Cron ou
 * Authorization: Bearer <CRON_SECRET>.
 *
 * Destinatários: adm@acquaxdobrasil.com.br, ou env DAILY_REPORT_TO
 * (lista separada por vírgula) para trocar/adicionar.
 * Padrão: giulia.melo@acquaxdobrasil.com.br
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { montarResumo, montarHtml, textoPlano, dataBRT, DESTINATARIOS_PADRAO } from '@/lib/services/daily-activity-report';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function autorizado(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = Boolean(req.headers.get('x-vercel-cron'));
  if (!secret) return true; // sem segredo configurado: roda como os outros crons
  if (isVercelCron) return true;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'SMTP não configurado' }, { status: 503 });
    }

    const resumo = await montarResumo();
    const destinatarios = (process.env.DAILY_REPORT_TO || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const para = destinatarios.length ? destinatarios : DESTINATARIOS_PADRAO;

    const html = montarHtml(resumo);
    const text = textoPlano(resumo);
    const assunto = `Resumo do dia ${dataBRT(new Date())} — AcquaXcontrol`;

    const envios = [];
    for (const to of para) {
      const r = await sendEmail({ to, subject: assunto, html, text });
      envios.push({ to, ...r });
    }

    return NextResponse.json({
      ok: envios.every((e) => e.success),
      destinatarios: para,
      envios,
      resumo: {
        usuariosCriados: resumo.usuariosCriados.length,
        usuariosAtualizados: resumo.usuariosAtualizados.length,
        condominiosCriados: resumo.condominiosCriados.length,
        condominiosAtualizados: resumo.condominiosAtualizados.length,
        emails: resumo.jobs.length,
        emailsEnviados: resumo.jobs.filter((j) => j.status === 'sent').length,
        emailsFalhados: resumo.falhas.length,
        emailsNaFila: resumo.pendentes,
        relatorios: resumo.relatorios.reduce((s, x) => s + x._count._all, 0),
      },
    });
  } catch (error: any) {
    console.error('[DailyActivityReport] erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
