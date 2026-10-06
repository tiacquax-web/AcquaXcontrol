'use client';

/**
 * components/print-header.tsx
 *
 * Cabeçalho oficial exibido apenas na IMPRESSÃO (print) de qualquer tela do
 * sistema. Traz a logo da AcquaX do Brasil + dados de contato, dando aparência
 * de documento oficial a filipetas, levantamentos, relatórios e comunicados.
 *
 * Fica oculto na tela (classe `print-only-header` → display:none fora do print)
 * e é revelado pelo CSS de impressão (app/globals.css).
 */

import { useEffect, useState } from 'react';

export function PrintHeader() {
  // Evita divergência de hidratação: só renderiza a data após montar no cliente.
  const [generatedAt, setGeneratedAt] = useState<string>('');

  useEffect(() => {
    try {
      setGeneratedAt(
        new Date().toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    } catch {
      setGeneratedAt('');
    }
  }, []);

  return (
    <div className="print-only-header">
      <div className="flex items-center justify-between gap-6 border-b-2 border-teal-600 pb-2 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-acquax.png"
          alt="AcquaX do Brasil"
          style={{ height: '38px', width: 'auto' }}
        />
        <div className="text-right text-[9px] leading-tight text-gray-500">
          <p className="font-semibold text-gray-700 text-[11px]">AcquaX do Brasil</p>
          <p>Sistema de Medição e Controle</p>
          <p>www.acquaxcontrol.com.br · medicao@acquaxdobrasil.com.br · 4003-7945</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-[9px] text-gray-400 mb-3">
        <span>Documento gerado pelo sistema AcquaX Control</span>
        {generatedAt && <span>Emitido em {generatedAt}</span>}
      </div>
    </div>
  );
}
