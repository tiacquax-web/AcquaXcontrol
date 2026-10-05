'use client';

/**
 * app/(main)/comunicado/page.tsx
 *
 * Central de Comunicados do sistema.
 * Exibe o comunicado didático adequado ao perfil logado (Morador ou Síndico),
 * com opção de alternar entre os dois e imprimir/exportar em PDF.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Home, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserContext } from '@/hooks/useUserContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import ComunicadoMorador from '@/components/comunicado/ComunicadoMorador';
import ComunicadoSindico from '@/components/comunicado/ComunicadoSindico';

type Audience = 'morador' | 'sindico';

export default function ComunicadoPage() {
  const { context: realCtx, loading: realLoading } = useUserContext();
  const { isPreviewing, effectiveContext } = useRolePreview();
  const context = isPreviewing ? effectiveContext : realCtx;
  const loading = isPreviewing ? false : realLoading;

  // Descobre o público natural do usuário logado
  const detected: Audience = useMemo(() => {
    if (!context) return 'morador';
    // Morador: tem apartamento e não tem vínculo de gestão (empresa/condomínio/bloco)
    const hasApartment = (context.apartments?.length ?? 0) > 0;
    const hasManagementScope =
      (context.complexes?.length ?? 0) > 0 ||
      (context.blocks?.length ?? 0) > 0 ||
      (context.companyIds?.length ?? 0) > 0 ||
      context.isSystem;
    if (hasApartment && !hasManagementScope) return 'morador';
    return 'sindico';
  }, [context]);

  const [audience, setAudience] = useState<Audience>(detected);

  // Acompanha a detecção quando o contexto carrega / muda
  useEffect(() => {
    setAudience(detected);
  }, [detected]);

  return (
    <div className="w-full">
      {/* Barra de ações (não aparece na impressão) */}
      <div className="print:hidden sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-slate-800">Central de Comunicados</p>
            <p className="text-xs text-muted-foreground">Escolha o comunicado que deseja ler</p>
          </div>

          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setAudience('morador')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                audience === 'morador' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Home className="w-3.5 h-3.5" /> Morador
            </button>
            <button
              type="button"
              onClick={() => setAudience('sindico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-slate-200 ${
                audience === 'sindico' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Síndico
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 md:px-6 py-8 print:py-0">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando comunicado...
          </div>
        ) : audience === 'morador' ? (
          <ComunicadoMorador />
        ) : (
          <ComunicadoSindico />
        )}
      </div>
    </div>
  );
}
