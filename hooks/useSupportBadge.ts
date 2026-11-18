'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Contador de atendimentos de suporte aguardando resposta (badge do menu).
 *
 * O backend (/api/user/support/badge) decide o que contar:
 *  - suporte (sistema): chamados cuja última mensagem é do solicitante;
 *  - morador/síndico: chamados cuja última mensagem é do suporte.
 *
 * Atualiza a cada 60s, ao voltar o foco para a aba e ao reabrir a página.
 * Qualquer falha é silenciosa: o badge é acessório e nunca deve atrapalhar.
 */
export function useSupportBadge(ativo = true): number {
  const [count, setCount] = useState(0);
  const emVoo = useRef(false);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;

    const carregar = async () => {
      if (emVoo.current) return;
      emVoo.current = true;
      try {
        const res = await fetch('/api/user/support/badge', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (vivo && typeof data?.count === 'number') setCount(data.count);
      } catch {
        /* silencioso */
      } finally {
        emVoo.current = false;
      }
    };

    carregar();
    const intervalo = window.setInterval(carregar, 60_000);
    const aoFocar = () => { void carregar(); };
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === 'visible') void carregar();
    };

    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);

    return () => {
      vivo = false;
      window.clearInterval(intervalo);
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [ativo]);

  return count;
}
