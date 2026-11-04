'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';

interface Msg { role: 'user' | 'assistant'; text: string }

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || loading) return;

    const historico = msgs.map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
    setMsgs(prev => [...prev, { role: 'user', text: texto }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: texto, history: historico }),
      });
      const data = await res.json().catch(() => ({}));
      const resposta = res.ok
        ? (data.reply || 'Não consegui responder agora.')
        : (data.error || 'Erro ao falar com o assistente.');
      setMsgs(prev => [...prev, { role: 'assistant', text: resposta }]);
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', text: 'Falha de conexão com o assistente. Tente novamente.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="print:hidden">
      {/* Botão flutuante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-teal-700"
          title="Assistente AcquaX"
        >
          <Sparkles className="h-4 w-4" />
          Assistente
        </button>
      )}

      {/* Painel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-2 bg-teal-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">Assistente AcquaX</p>
                <p className="text-[11px] text-teal-50">Filipeta, consumo e suporte</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-teal-700" title="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-3">
            {msgs.length === 0 && (
              <div className="rounded-xl border border-teal-100 bg-white p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800">Olá! Eu sou o assistente virtual.</p>
                <p className="mt-1">Posso explicar sua filipeta, analisar seu consumo no ano e abrir um chamado no suporte.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Explique minha filipeta de outubro', 'Como está meu consumo no ano?', 'Qual a tarifa da minha conta?'].map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-teal-600 px-3 py-2 text-sm text-white'
                      : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800'
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                consultando...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
              placeholder="Escreva sua dúvida"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
              disabled={loading}
            />
            <button
              onClick={enviar}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-teal-600 p-2 text-white transition hover:bg-teal-700 disabled:opacity-50"
              title="Enviar"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>

          <p className="bg-white px-3 pb-2 text-[10px] text-gray-400">
            Assistente virtual. Para falar com uma pessoa, peça para abrir um chamado no suporte.
          </p>
        </div>
      )}
    </div>
  );
}
