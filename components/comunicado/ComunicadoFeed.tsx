'use client';

/**
 * components/comunicado/ComunicadoFeed.tsx
 *
 * Lista os comunicados publicados (arquivos enviados pelo administrador) e,
 * quando o usuário é administrador, permite publicar e excluir comunicados,
 * escolhendo na hora do upload para quais públicos (moradores, síndicos, etc.)
 * o comunicado será exibido.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone, Upload, FileText, Download, Eye, Trash2, Loader2, X,
  Users, CalendarDays, Paperclip, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { COMUNICADO_AUDIENCES, describeAudiences, type ComunicadoAudience } from '@/lib/comunicado-audience';

interface ComunicadoMeta {
  id: string;
  title: string;
  description?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  audiences: string[];
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function fileIconColor(type: string): string {
  if (type.includes('pdf')) return 'text-red-500';
  if (type.includes('image')) return 'text-blue-500';
  if (type.includes('sheet') || type.includes('excel')) return 'text-green-600';
  if (type.includes('word') || type.includes('document')) return 'text-blue-700';
  return 'text-slate-500';
}

export default function ComunicadoFeed({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ComunicadoMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = isAdmin ? '/api/user/comunicados?admin=true' : '/api/user/comunicados';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Não foi possível carregar os comunicados.');
      const data = await res.json();
      setItems(data.comunicados || []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar comunicados.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente excluir este comunicado? Ele deixará de aparecer para os usuários.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/user/comunicados/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'Erro ao excluir.');
      }
      toast({ title: 'Comunicado excluído', description: 'O comunicado foi removido com sucesso.' });
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Erro ao excluir.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Cabeçalho da seção */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 print:hidden">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Comunicados</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {isAdmin
                ? 'Publique avisos, circulares e documentos para os usuários do sistema.'
                : 'Avisos e documentos enviados pela administração para o seu perfil.'}
            </p>
          </div>
        </div>

        {isAdmin && (
          <Button onClick={() => setOpen(true)} className="print:hidden">
            <Upload className="w-4 h-4 mr-2" /> Publicar comunicado
          </Button>
        )}
      </div>

      {/* Estado: carregando */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando comunicados...
        </div>
      )}

      {/* Estado: erro */}
      {!loading && error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Estado: vazio */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-10 text-center">
          <Paperclip className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {isAdmin ? 'Nenhum comunicado publicado ainda' : 'Nenhum comunicado disponível no momento'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? 'Clique em “Publicar comunicado” para enviar o primeiro.'
              : 'Quando a administração publicar algo para o seu perfil, aparecerá aqui.'}
          </p>
        </div>
      )}

      {/* Lista */}
      {!loading && !error && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <FileText className={`w-5 h-5 ${fileIconColor(c.fileType)}`} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight break-words">{c.title}</p>
                {c.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 break-words">{c.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> {describeAudiences(c.audiences)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" /> {formatDate(c.publishedAt || c.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> {formatBytes(c.fileSize)}
                  </span>
                  {isAdmin && !c.isPublished && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">não publicado</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  title="Visualizar"
                >
                  <a href={`/api/user/comunicados/${c.id}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4" />
                    <span className="sr-only md:not-sr-only md:ml-1.5">Ver</span>
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild title="Baixar">
                  <a href={`/api/user/comunicados/${c.id}?download=1`}>
                    <Download className="w-4 h-4" />
                    <span className="sr-only md:not-sr-only md:ml-1.5">Baixar</span>
                  </a>
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 print:hidden"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    title="Excluir"
                  >
                    {deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Dialog de publicação (somente admin) */}
      {isAdmin && (
        <UploadComunicadoDialog
          open={open}
          onOpenChange={setOpen}
          onPublished={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Dialog de publicação ──────────────────────────────────────────────────────
function UploadComunicadoDialog({
  open, onOpenChange, onPublished,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audiences, setAudiences] = useState<string[]>(['all']);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setAudiences(['all']);
    setFile(null);
    setErr(null);
    setSaving(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const allSelected = audiences.includes('all');

  function toggleAudience(value: ComunicadoAudience) {
    setAudiences((prev) => {
      if (value === 'all') {
        return prev.includes('all') ? [] : ['all'];
      }
      const withoutAll = prev.filter((a) => a !== 'all');
      return withoutAll.includes(value)
        ? withoutAll.filter((a) => a !== value)
        : [...withoutAll, value];
    });
  }

  async function submit() {
    setErr(null);
    if (!title.trim()) {
      setErr('Informe um título para o comunicado.');
      return;
    }
    if (!file) {
      setErr('Anexe um arquivo (PDF, imagem ou documento).');
      return;
    }
    if (audiences.length === 0) {
      setErr('Selecione pelo menos um público.');
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      if (description.trim()) form.append('description', description.trim());
      form.append('audiences', JSON.stringify(audiences));
      form.append('file', file);

      const res = await fetch('/api/user/comunicados', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'Erro ao publicar comunicado.');
      }
      toast({ title: 'Comunicado publicado!', description: 'Ele já está visível para os públicos selecionados.' });
      reset();
      onPublished();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao publicar comunicado.');
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publicar comunicado</DialogTitle>
          <DialogDescription>
            Anexe um arquivo e escolha quem poderá vê-lo. O comunicado aparece na aba Comunicados do usuário.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="com-title">Título *</Label>
            <Input
              id="com-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Aviso de manutenção no abastecimento"
              maxLength={160}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="com-desc">Descrição (opcional)</Label>
            <Textarea
              id="com-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve resumo que aparecerá abaixo do título."
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Público */}
          <div className="space-y-2">
            <Label>Quem pode ver este comunicado? *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMUNICADO_AUDIENCES.map((a) => {
                const checked = audiences.includes(a.value);
                const disabled = a.value !== 'all' && allSelected;
                return (
                  <label
                    key={a.value}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      checked
                        ? 'border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/40'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => !disabled && toggleAudience(a.value)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{a.label}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{a.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Arquivo */}
          <div className="space-y-1.5">
            <Label htmlFor="com-file">Arquivo *</Label>
            <input
              ref={inputRef}
              id="com-file"
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 dark:file:bg-teal-950/60 dark:file:text-teal-300"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">PDF, imagem ou documento — máx. 8MB.</p>
          </div>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-2.5 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
