/**
 * lib/services/team-productivity.ts
 *
 * Análise de produtividade por colaborador, usada no resumo diário.
 *
 * O que conta como "trabalho no sistema": registros criados ou alterados por
 * aquela conta (relatórios de consumo, cadastros de condomínio/bloco/
 * apartamento/medidor/usuário, leituras de concessionária e e-mails).
 *
 * Limitação honesta: reuniões, telefone, WhatsApp e planilha fora do sistema
 * não aparecem aqui — uma lacuna no gráfico não prova ociosidade, apenas
 * ausência de registro no AcquaXcontrol.
 */

import prisma from '@/lib/prisma';

export const TZ_PROD = 'America/Sao_Paulo';

/** Jornada combinada: 08h-18h, almoço 12h-13h, sexta sai às 17h. */
export const JORNADA = {
  inicio: 8,
  almocoInicio: 12,
  almocoFim: 13,
  fim: 18,
  fimSexta: 17,
  /** lacuna mínima para virar alerta */
  lacunaMinimaMin: 30,
  /** lacuna mínima para contar como tempo sem registro */
  lacunaContaMin: 15,
} as const;

export const COLABORADOR_PADRAO = {
  nome: 'Gustavo Gomes',
  email: 'sistema@acquaxdobrasil.com.br',
} as const;

export type TipoEvento = 'relatorio' | 'cadastro' | 'concessionaria' | 'email';

export interface EventoProdutividade {
  at: Date;
  tipo: TipoEvento;
  rotulo: string;
}

export interface Lacuna {
  de: string;
  ate: string;
  minutos: number;
}

export interface AnaliseProdutividade {
  colaborador: { id: string | null; nome: string; email: string };
  dia: string;
  diaSemana: string;
  janela: { inicio: number; almocoInicio: number; almocoFim: number; fim: number };
  porHora: { hora: number; relatorios: number; cadastros: number; outros: number; total: number }[];
  totais: { relatorios: number; cadastros: number; outros: number; total: number };
  primeiraAtividade: string | null;
  ultimaAtividade: string | null;
  /** Primeira e última alteração do dia, com o tipo de registro. */
  primeiraAcao: { hora: string; rotulo: string } | null;
  ultimaAcao: { hora: string; rotulo: string } | null;
  /** Trabalho efetivo = jornada útil menos o tempo sem registro. */
  minutosTrabalhoEfetivo: number;
  percentualSemTrabalho: number;
  /** Minutos entre o início da jornada e a primeira ação / da última ação até o fim. */
  minutosAntesPrimeira: number;
  minutosDepoisUltima: number;
  horasComAtividade: number;
  horasUteis: number;
  minutosOciosos: number;
  minutosUteis: number;
  lacunas: Lacuna[];
  base: { mediana: number; melhor: number; media: number; dias: number; diasSemRegistro: number };
  percentualDaBase: number | null;
  alertas: string[];
}

function fmtHora(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, hour: '2-digit', minute: '2-digit' }).format(d);
}

function partesBRT(d: Date): { ano: string; mes: string; dia: string; diaSemana: number } {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_PROD, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => s.find((p) => p.type === t)?.value || '';
  const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ano: get('year'), mes: get('month'), dia: get('day'), diaSemana: mapa[get('weekday')] ?? 1 };
}

function inicioDoDiaBRT(d: Date): Date {
  const p = partesBRT(d);
  return new Date(`${p.ano}-${p.mes}-${p.dia}T00:00:00-03:00`);
}

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Coleta os eventos do colaborador no dia informado. */
async function coletarEventos(userId: string, de: Date, ate: Date): Promise<EventoProdutividade[]> {
  const eventos: EventoProdutividade[] = [];

  const relatorios = await prisma.apartmentConsumptionReport.findMany({
    where: { createdByUserId: userId, createdAt: { gte: de, lt: ate } },
    select: { createdAt: true },
    take: 20000,
  });
  for (const r of relatorios) {
    if (r.createdAt) eventos.push({ at: new Date(r.createdAt), tipo: 'relatorio', rotulo: 'relatório de consumo' });
  }

  const concessionarias = await prisma.dealershipReading.findMany({
    where: { createdByUserId: userId, createdAt: { gte: de, lt: ate } },
    select: { createdAt: true },
    take: 5000,
  });
  for (const r of concessionarias) {
    if (r.createdAt) eventos.push({ at: new Date(r.createdAt), tipo: 'concessionaria', rotulo: 'leitura de concessionária' });
  }

  const emails = await prisma.emailJob.findMany({
    where: { createdByUserId: userId, createdAt: { gte: de, lt: ate } },
    select: { createdAt: true },
    take: 5000,
  });
  for (const e of emails) {
    if (e.createdAt) eventos.push({ at: new Date(e.createdAt), tipo: 'email', rotulo: 'e-mail disparado' });
  }

  const cadastros: { modelo: any; campo: string; data: string; rotulo: string }[] = [
    { modelo: prisma.complex, campo: 'createdByUserId', data: 'createdAt', rotulo: 'condomínio criado' },
    { modelo: prisma.complex, campo: 'updatedByUserId', data: 'updatedAt', rotulo: 'condomínio alterado' },
    { modelo: prisma.block, campo: 'createdByUserId', data: 'createdAt', rotulo: 'bloco criado' },
    { modelo: prisma.apartment, campo: 'createdByUserId', data: 'createdAt', rotulo: 'apartamento criado' },
    { modelo: prisma.meter, campo: 'createdByUserId', data: 'createdAt', rotulo: 'medidor criado' },
    { modelo: prisma.user, campo: 'createdByUserId', data: 'createdAt', rotulo: 'usuário criado' },
    { modelo: prisma.user, campo: 'updatedByUserId', data: 'updatedAt', rotulo: 'usuário alterado' },
  ];
  for (const c of cadastros) {
    const linhas = await c.modelo.findMany({
      where: { [c.campo]: userId, [c.data]: { gte: de, lt: ate } },
      select: { [c.data]: true },
      take: 5000,
    });
    for (const l of linhas) {
      const valor = (l as any)[c.data];
      if (valor) eventos.push({ at: new Date(valor), tipo: 'cadastro', rotulo: c.rotulo });
    }
  }

  return eventos.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Volume diário de relatórios nos últimos N dias (para servir de referência). */
async function baseRelatorios(userId: string, dias: number): Promise<{ mediana: number; melhor: number; media: number; dias: number; diasSemRegistro: number }> {
  const hoje = inicioDoDiaBRT(new Date());
  const de = new Date(hoje.getTime() - dias * 24 * 3600 * 1000);
  const valores: number[] = [];
  for (let i = dias; i >= 1; i--) {
    const ini = new Date(hoje.getTime() - i * 24 * 3600 * 1000);
    const fim = new Date(ini.getTime() + 24 * 3600 * 1000);
    const n = await prisma.apartmentConsumptionReport.count({
      where: { createdByUserId: userId, createdAt: { gte: ini, lt: fim } },
    });
    valores.push(n);
  }
  // Dias sem nenhum registro não entram na mediana: eles são reportados
  // separadamente (um dia parado não pode baixar a régua do que é normal).
  const diasSemRegistro = valores.filter((v) => v === 0).length;
  const comMovimento = valores.filter((v) => v > 0).sort((a, b) => a - b);
  const valores2 = comMovimento.length ? comMovimento : [0];
  valores.length = 0;
  valores.push(...valores2);
  if (!valores.length) return { mediana: 0, melhor: 0, media: 0, dias: 0, diasSemRegistro };
  const meio = Math.floor(valores.length / 2);
  const mediana = valores.length % 2 ? valores[meio] : Math.round((valores[meio - 1] + valores[meio]) / 2);
  const soma = valores.reduce((a, b) => a + b, 0);
  return { mediana, melhor: valores[valores.length - 1], media: Math.round(soma / valores.length), dias: valores.length, diasSemRegistro };
}

export async function analisarProdutividade(opts?: {
  email?: string;
  nome?: string;
  data?: Date;
  baseDias?: number;
}): Promise<AnaliseProdutividade | null> {
  const email = opts?.email || process.env.PRODUCTIVITY_USER_EMAIL || COLABORADOR_PADRAO.email;
  const nome = opts?.nome || COLABORADOR_PADRAO.nome;
  const usuario = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true, name: true, email: true } });
  if (!usuario) return null;

  const referencia = opts?.data || new Date();
  const de = inicioDoDiaBRT(referencia);
  const ate = new Date(de.getTime() + 24 * 3600 * 1000);
  const p = partesBRT(de);
  const sexta = p.diaSemana === 5;
  const fim = sexta ? JORNADA.fimSexta : JORNADA.fim;

  const eventos = await coletarEventos(usuario.id, de, ate);
  const base = await baseRelatorios(usuario.id, opts?.baseDias ?? 21);

  const porHora = Array.from({ length: fim - JORNADA.inicio }, (_, i) => ({
    hora: JORNADA.inicio + i, relatorios: 0, cadastros: 0, outros: 0, total: 0,
  }));
  const horaBRT = (d: Date) => Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, hour: '2-digit', hour12: false }).format(d));

  for (const e of eventos) {
    const h = horaBRT(e.at);
    const linha = porHora.find((x) => x.hora === h);
    if (!linha) continue;
    if (e.tipo === 'relatorio') linha.relatorios++;
    else if (e.tipo === 'cadastro') linha.cadastros++;
    else linha.outros++;
    linha.total++;
  }

  const totais = {
    relatorios: eventos.filter((e) => e.tipo === 'relatorio').length,
    cadastros: eventos.filter((e) => e.tipo === 'cadastro').length,
    outros: eventos.filter((e) => e.tipo === 'concessionaria' || e.tipo === 'email').length,
    total: eventos.length,
  };

  // Janela útil em minutos: 08-12 + 13-fim
  const minutosUteis = (JORNADA.almocoInicio - JORNADA.inicio + (fim - JORNADA.almocoFim)) * 60;

  const dentroDaJanela = eventos.filter((e) => {
    const h = horaBRT(e.at);
    const min = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, minute: '2-digit' }).format(e.at));
    const emMinutos = h * 60 + min;
    if (emMinutos < JORNADA.inicio * 60 || emMinutos >= fim * 60) return false;
    if (emMinutos >= JORNADA.almocoInicio * 60 && emMinutos < JORNADA.almocoFim * 60) return false;
    return true;
  });

  // Lacunas entre eventos consecutivos (ignorando o almoço)
  const lacunas: Lacuna[] = [];
  const pontos: Date[] = [];
  for (const e of dentroDaJanela) {
    const h = horaBRT(e.at);
    const min = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, minute: '2-digit' }).format(e.at));
    const emMin = h * 60 + min;
    pontos.push(new Date(de.getTime() + emMin * 60 * 1000));
  }
  const inicioJornada = new Date(de.getTime() + JORNADA.inicio * 3600 * 1000);
  const fimAlmoco = new Date(de.getTime() + JORNADA.almocoFim * 3600 * 1000);
  const fimJornada = new Date(de.getTime() + fim * 3600 * 1000);
  const marcos = [inicioJornada, ...pontos.filter((x) => x >= inicioJornada), fimJornada];
  let minutosOciosos = 0;
  for (let i = 1; i < marcos.length; i++) {
    let ini = marcos[i - 1];
    let f = marcos[i];
    // desconta o almoço do intervalo
    if (ini < fimAlmoco && f > new Date(de.getTime() + JORNADA.almocoInicio * 3600 * 1000)) {
      const almocoIni = new Date(de.getTime() + JORNADA.almocoInicio * 3600 * 1000);
      const antes = Math.max(0, almocoIni.getTime() - ini.getTime());
      const depois = Math.max(0, f.getTime() - fimAlmoco.getTime());
      const total = Math.round((antes + depois) / 60000);
      if (total > JORNADA.lacunaMinimaMin) lacunas.push({ de: fmtHora(ini), ate: fmtHora(f), minutos: total });
      if (total >= JORNADA.lacunaContaMin) minutosOciosos += total;
      continue;
    }
    const minutos = Math.round((f.getTime() - ini.getTime()) / 60000);
    if (minutos > JORNADA.lacunaMinimaMin) {
      lacunas.push({ de: fmtHora(ini), ate: fmtHora(f), minutos });
    }
    if (minutos >= JORNADA.lacunaContaMin) minutosOciosos += minutos;
  }

  const horasComAtividade = porHora.filter((h) => h.total > 0).length;
  const percentualDaBase = base.mediana > 0 ? Math.round((totais.relatorios / base.mediana) * 100) : null;

  const alertas: string[] = [];
  if (!eventos.length) {
    alertas.push('Nenhuma atividade registrada no sistema neste dia.');
  } else {
    const primeira = fmtHora(eventos[0].at);
    const ultima = fmtHora(eventos[eventos.length - 1].at);
    if (horaBRT(eventos[0].at) * 60 + Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, minute: '2-digit' }).format(eventos[0].at)) > (JORNADA.inicio * 60 + 45)) {
      alertas.push(`Primeira atividade só às ${primeira} (início previsto ${JORNADA.inicio}h).`);
    }
    if (horaBRT(eventos[eventos.length - 1].at) * 60 + Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, minute: '2-digit' }).format(eventos[eventos.length - 1].at)) < fim * 60 - 60) {
      alertas.push(`Última atividade às ${ultima}, mais de 1h antes do fim previsto (${fim}h).`);
    }
    for (const l of lacunas.filter((x) => x.minutos >= 60)) {
      alertas.push(`Sem registro entre ${l.de} e ${l.ate} (${Math.floor(l.minutos / 60)}h${String(l.minutos % 60).padStart(2, '0')}).`);
    }
    if (percentualDaBase !== null && percentualDaBase < 70) {
      alertas.push(`Volume de relatórios em ${percentualDaBase}% da mediana das últimas 3 semanas (${base.mediana}/dia).`);
    }
  }

  const minutosTrabalhoEfetivo = Math.max(0, minutosUteis - minutosOciosos);
  const percentualSemTrabalho = minutosUteis > 0 ? Math.round((minutosOciosos / minutosUteis) * 100) : 0;

  const emMinutosDoDia = (d: Date) => {
    const h = horaBRT(d);
    const m = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_PROD, minute: '2-digit' }).format(d));
    return h * 60 + m;
  };
  const minutosAntesPrimeira = dentroDaJanela.length
    ? Math.max(0, emMinutosDoDia(dentroDaJanela[0].at) - JORNADA.inicio * 60)
    : minutosUteis;
  const minutosDepoisUltima = dentroDaJanela.length
    ? Math.max(0, fim * 60 - emMinutosDoDia(dentroDaJanela[dentroDaJanela.length - 1].at))
    : 0;

  return {
    colaborador: { id: usuario.id, nome: usuario.name || nome, email: usuario.email },
    dia: `${p.dia}/${p.mes}/${p.ano}`,
    diaSemana: NOMES_DIA[p.diaSemana],
    janela: { inicio: JORNADA.inicio, almocoInicio: JORNADA.almocoInicio, almocoFim: JORNADA.almocoFim, fim },
    porHora,
    totais,
    primeiraAtividade: eventos.length ? fmtHora(eventos[0].at) : null,
    ultimaAtividade: eventos.length ? fmtHora(eventos[eventos.length - 1].at) : null,
    primeiraAcao: eventos.length ? { hora: fmtHora(eventos[0].at), rotulo: eventos[0].rotulo } : null,
    ultimaAcao: eventos.length ? { hora: fmtHora(eventos[eventos.length - 1].at), rotulo: eventos[eventos.length - 1].rotulo } : null,
    minutosTrabalhoEfetivo,
    percentualSemTrabalho,
    minutosAntesPrimeira,
    minutosDepoisUltima,
    horasComAtividade,
    horasUteis: fim - JORNADA.inicio - (JORNADA.almocoFim - JORNADA.almocoInicio),
    minutosOciosos,
    minutosUteis,
    lacunas,
    base,
    percentualDaBase,
    alertas,
  };
}
