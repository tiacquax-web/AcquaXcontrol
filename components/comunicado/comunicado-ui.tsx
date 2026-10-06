'use client';

/**
 * components/comunicado/comunicado-ui.tsx
 *
 * Blocos de UI reutilizáveis para os Comunicados (Morador e Síndico).
 * Linguagem didática, visual de guia, com suporte a impressão (print).
 */

import React from 'react';
import {
  Info, AlertTriangle, CheckCircle2, ArrowRight, Sparkles,
} from 'lucide-react';

// ─── Cabeçalho do comunicado ─────────────────────────────────────────────────
export function ComunicadoHero({
  audience, title, subtitle, accent = 'teal',
}: {
  audience: string;
  title: string;
  subtitle: string;
  accent?: 'teal' | 'blue';
}) {
  const bg = accent === 'blue'
    ? 'from-blue-600 to-blue-500'
    : 'from-teal-600 to-teal-500';
  return (
    <header className={`rounded-2xl bg-gradient-to-br ${bg} text-white px-6 py-7 print:bg-white print:text-black print:border print:border-gray-300`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80 print:text-gray-500">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Comunicado oficial do sistema</span>
      </div>
      <p className="mt-2 text-sm font-medium text-white/90 print:text-gray-600">{audience}</p>
      <h1 className="mt-1 text-2xl md:text-3xl font-bold leading-tight">{title}</h1>
      <p className="mt-3 text-sm md:text-base text-white/90 leading-relaxed print:text-gray-700 max-w-2xl">
        {subtitle}
      </p>
    </header>
  );
}

// ─── Índice (sumário) ────────────────────────────────────────────────────────
export function ComunicadoIndex({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 print:hidden">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Neste comunicado</p>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-teal-700 transition-colors">
              <span className="w-5 h-5 shrink-0 rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-[11px] font-bold flex items-center justify-center text-slate-500 dark:text-slate-400">
                {i + 1}
              </span>
              <span>{it.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── Seção ───────────────────────────────────────────────────────────────────
export function Section({
  id, n, icon: Icon, title, intro, children,
}: {
  id: string;
  n: number;
  icon: React.ElementType;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center print:bg-white print:text-teal-700 print:border print:border-teal-300">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600">Passo {n}</p>
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{title}</h2>
        </div>
      </div>
      {intro && <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4 space-y-2">{intro}</div>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// ─── Destaques (callouts) ────────────────────────────────────────────────────
type CalloutTone = 'info' | 'tip' | 'warning' | 'success';

const CALLOUT_STYLES: Record<CalloutTone, { wrap: string; icon: string; Icon: React.ElementType }> = {
  info:    { wrap: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/60 text-blue-900 dark:text-blue-100',       icon: 'text-blue-500',   Icon: Info },
  tip:     { wrap: 'bg-teal-50 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900/60 text-teal-900 dark:text-teal-100',       icon: 'text-teal-500',   Icon: Sparkles },
  warning: { wrap: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/60 text-amber-900 dark:text-amber-100',    icon: 'text-amber-500',  Icon: AlertTriangle },
  success: { wrap: 'bg-green-50 dark:bg-green-950/40 border-green-100 dark:border-green-900/60 text-green-900 dark:text-green-100',    icon: 'text-green-500',  Icon: CheckCircle2 },
};

export function Callout({ tone = 'info', title, children }: { tone?: CalloutTone; title?: string; children: React.ReactNode }) {
  const s = CALLOUT_STYLES[tone];
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed print:bg-white ${s.wrap}`}>
      <s.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
      <div>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// ─── Passo a passo numerado ──────────────────────────────────────────────────
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center print:bg-white print:text-teal-700 print:border print:border-teal-300">
            {i + 1}
          </span>
          <span className="text-sm text-slate-700 dark:text-slate-200 pt-0.5 leading-relaxed">{it}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── Card de funcionalidade ──────────────────────────────────────────────────
export function FeatureCard({
  icon: Icon, title, tag, children, href,
}: {
  icon: React.ElementType;
  title: string;
  tag?: string;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm print:shadow-none print:break-inside-avoid">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">{title}</h3>
        {tag && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
            {tag}
          </span>
        )}
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">{children}</div>
      {href && (
        <a href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 print:hidden">
          Abrir a tela <ArrowRight className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// ─── Tabela "onde encontro cada informação" ──────────────────────────────────
export function InfoTable({ rows }: { rows: { what: string; where: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 print:border-gray-300">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <th className="text-left px-4 py-2.5 font-semibold">O que você procura</th>
            <th className="text-left px-4 py-2.5 font-semibold">Onde encontrar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${i % 2 ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900'}`}>
              <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 align-top">{r.what}</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 align-top">{r.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Rodapé ──────────────────────────────────────────────────────────────────
export function ComunicadoFooter({ contacts }: { contacts: { label: string; value: string }[] }) {
  return (
    <footer className="mt-10 border-t border-slate-200 dark:border-slate-700 pt-6 text-sm text-slate-500 dark:text-slate-400">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Ainda tem dúvidas?</p>
      <p className="mb-3 leading-relaxed">
        Use a aba <strong>Suporte</strong> dentro do sistema para abrir um atendimento, ou fale com a equipe
        de medição pelos canais abaixo.
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {contacts.map((c) => (
          <li key={c.label}>
            <span className="text-slate-400 dark:text-slate-500">{c.label}: </span>
            <span className="font-medium text-slate-600 dark:text-slate-300">{c.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        AcquaX do Brasil — Sistema de Medição e Controle. Este comunicado faz parte do material de apoio ao usuário.
      </p>
    </footer>
  );
}
