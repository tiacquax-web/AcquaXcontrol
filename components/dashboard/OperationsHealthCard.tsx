'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface OperationsSummary {
  email: {
    pending: number;
    failed24h: number;
    sent24h: number;
    oldestPendingAt: string | null;
    lastSentAt: string | null;
  };
  gl: {
    latest: { executedAt: string; imported: number; skipped: number; errors: number; errorMessage: string | null } | null;
    imported24h: number;
    errors24h: number;
    hasRecentSuccessfulImport: boolean;
    executions24h: number;
  };
  alarms: { unacknowledged: number };
}

function timeLabel(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function OperationsHealthCard() {
  const [data, setData] = useState<OperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/operations/summary', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Falha ao carregar a saúde operacional');
      setData(payload);
    } catch (reason: any) {
      setError(reason?.message || 'Falha ao carregar a saúde operacional');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-bold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-teal-600" /> Saúde operacional</CardTitle>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={load} disabled={loading} aria-label="Atualizar saúde operacional">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-xs text-muted-foreground">Carregando indicadores…</p>}
        {!loading && error && <p className="text-xs text-red-600">{error}</p>}
        {!loading && data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-2">
              <p className="text-sm font-bold flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-blue-600" /> E-mails</p>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pendentes</span><strong>{data.email.pending}</strong></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Enviados em 24h</span><strong className="text-teal-600">{data.email.sent24h}</strong></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Falhas em 24h</span><strong className={data.email.failed24h > 0 ? 'text-red-600' : 'text-teal-600'}>{data.email.failed24h}</strong></div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="h-3 w-3" /> Último envio: {timeLabel(data.email.lastSentAt)}</p>
            </div>
            <div className="rounded-lg border-2 border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/20 p-4 space-y-2">
              <p className="text-sm font-bold flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5 text-teal-600" /> Integração GL</p>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Importadas em 24h</span><strong>{data.gl.imported24h}</strong></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Execuções</span><strong>{data.gl.executions24h}</strong></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Erros</span><strong className={data.gl.errors24h > 0 ? 'text-red-600' : 'text-teal-600'}>{data.gl.errors24h}</strong></div>
              <p className={`text-xs font-medium flex items-center gap-1 ${data.gl.hasRecentSuccessfulImport ? 'text-teal-700' : 'text-orange-700'}`}>
                {data.gl.hasRecentSuccessfulImport ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {data.gl.hasRecentSuccessfulImport ? 'Importação recente concluída' : 'Sem importação bem-sucedida nas últimas 24h'}
              </p>
            </div>
            <div className="rounded-lg border-2 border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 p-4 space-y-2">
              <p className="text-sm font-bold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-orange-600" /> Pendências</p>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Alarmes não reconhecidos</span><strong className={data.alarms.unacknowledged > 0 ? 'text-orange-600' : 'text-teal-600'}>{data.alarms.unacknowledged}</strong></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Último log GL</span><strong>{timeLabel(data.gl.latest?.executedAt || null)}</strong></div>
              <p className="text-xs text-muted-foreground">Use esses indicadores para agir antes que moradores ou síndicos percebam a falha.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
