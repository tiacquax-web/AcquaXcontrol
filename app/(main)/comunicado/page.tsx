'use client';

/**
 * app/(main)/comunicado/page.tsx
 *
 * Central de Comunicados do sistema.
 *
 * Duas áreas:
 *  1. "Comunicados" — arquivos enviados pela administração (uploads). Todos veem
 *     os comunicados destinados ao seu perfil; administradores podem publicar e
 *     escolher, no momento do upload, quem poderá ver (todos, moradores, síndicos...).
 *  2. "Guia" — comunicado didático. A exibição é restrita ao público do perfil:
 *     morador → guia do morador; síndico → guia do síndico; perfis gerais → ambos.
 *
 * Suporta impressão/exportação em PDF.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Home, Building2, Loader2, Megaphone, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserContext } from '@/hooks/useUserContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import ComunicadoMorador from '@/components/comunicado/ComunicadoMorador';
import ComunicadoSindico from '@/components/comunicado/ComunicadoSindico';
import ComunicadoFeed from '@/components/comunicado/ComunicadoFeed';

type Audience = 'morador' | 'sindico';
type ViewTab = 'comunicados' | 'guia';

export default function ComunicadoPage() {
  const { context: realCtx, loading: realLoading } = useUserContext();
  const { isPreviewing, effectiveContext, previewRole } = useRolePreview();
  const context = isPreviewing ? effectiveContext : realCtx;
  const loading = isPreviewing ? false : realLoading;

  const isAdmin = !!context?.isSystem;

  /**
   * Quais guias o perfil atual pode ver.
   *  - morador  → ['morador']
   *  - síndico  → ['sindico']
   *  - geral    → ['morador', 'sindico'] (pode alternar)
   */
  const availableAudiences: Audience[] = useMemo(() => {
    // ── Modo preview (simulação de perfil) ──
    if (isPreviewing) {
      if (previewRole === 'morador') return ['morador'];
      if (previewRole === 'sindico') return ['sindico'];
      return ['morador', 'sindico'];
    }

    // Durante o carregamento não restringe (evita "piscar" o comunicado errado)
    if (!context) return ['morador', 'sindico'];

    // Perfis de sistema (Administrador/Programador) → ambos
    if (context.isSystem) return ['morador', 'sindico'];

    const hasCompany = (context.companyIds?.length ?? 0) > 0;
    const hasComplex = (context.complexes?.length ?? 0) > 0;
    const hasBlock = (context.blocks?.length ?? 0) > 0;
    const hasApartment = (context.apartments?.length ?? 0) > 0;

    // Administradora (possui empresa) → perfil geral, vê os dois
    if (hasCompany) return ['morador', 'sindico'];

    // Morador: tem unidade e NÃO tem escopo de gestão (condomínio/bloco)
    if (hasApartment && !hasComplex && !hasBlock) return ['morador'];

    // Síndico: tem condomínio/bloco, mas não empresa
    if (hasComplex || hasBlock) return ['sindico'];

    // Fallback seguro
    return ['morador', 'sindico'];
  }, [context, isPreviewing, previewRole]);

  // Só permite escolher quando há mais de um guia disponível
  const canChoose = availableAudiences.length > 1;

  const [audience, setAudience] = useState<Audience>(availableAudiences[0] ?? 'morador');
  const [tab, setTab] = useState<ViewTab>('comunicados');

  // Mantém o guia selecionado sempre dentro dos disponíveis
  useEffect(() => {
    setAudience((prev) => (availableAudiences.includes(prev) ? prev : (availableAudiences[0] ?? 'morador')));
  }, [availableAudiences]);

  // Público efetivamente exibido (garante consistência mesmo antes do efeito rodar)
  const activeAudience: Audience = availableAudiences.includes(audience)
    ? audience
    : (availableAudiences[0] ?? 'morador');

  return (
    <div className="w-full">
      {/* Barra de ações (não aparece na impressão) */}
      <div className="print:hidden sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Central de Comunicados</p>
            <p className="text-xs text-muted-foreground">
              {tab === 'comunicados'
                ? (isAdmin ? 'Publique e gerencie comunicados para os usuários' : 'Comunicados enviados para o seu perfil')
                : (canChoose ? 'Escolha o guia que deseja ler' : 'Guia destinado ao seu perfil')}
            </p>
          </div>

          {/* Abas: Comunicados (uploads) e Guia (didático) */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTab('comunicados')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === 'comunicados' ? 'bg-teal-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" /> Comunicados
            </button>
            <button
              type="button"
              onClick={() => setTab('guia')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-border ${
                tab === 'guia' ? 'bg-teal-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Guia
            </button>
          </div>

          {/* Seletor de guia (Morador/Síndico) — só quando há mais de um e na aba Guia */}
          {tab === 'guia' && canChoose && (
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setAudience('morador')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeAudience === 'morador' ? 'bg-teal-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Home className="w-3.5 h-3.5" /> Morador
              </button>
              <button
                type="button"
                onClick={() => setAudience('sindico')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-border ${
                  activeAudience === 'sindico' ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> Síndico
              </button>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 md:px-6 py-8 print:py-0">
        {tab === 'comunicados' ? (
          <ComunicadoFeed isAdmin={isAdmin} />
        ) : loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando comunicado...
          </div>
        ) : activeAudience === 'morador' ? (
          <ComunicadoMorador />
        ) : (
          <ComunicadoSindico />
        )}
      </div>
    </div>
  );
}
