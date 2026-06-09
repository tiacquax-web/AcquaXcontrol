'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Lightbulb, Plus, ThumbsUp, ThumbsDown, Loader2, Search, X,
  Filter, ChevronDown, Trash2, CheckCircle2, Clock, BarChart3,
  ShieldCheck, SlidersHorizontal, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type SuggestionStatus = 'open' | 'analyzing' | 'approved' | 'implemented' | 'rejected';

interface Suggestion {
  id: string;
  content: string;
  status: SuggestionStatus;
  likes: number;
  dislikes: number;
  myVote: 'like' | 'dislike' | null;
  createdAt: string;
  updatedAt: string;
  moderatorNote?: string | null;
  authorId?: string | null; // apenas para admins
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<SuggestionStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: 'Aberta',       color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: <Clock className="w-3 h-3" /> },
  analyzing:   { label: 'Em Análise',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <BarChart3 className="w-3 h-3" /> },
  approved:    { label: 'Aprovada',     color: 'bg-teal-100 text-teal-700 border-teal-200',       icon: <CheckCircle2 className="w-3 h-3" /> },
  implemented: { label: 'Implementada', color: 'bg-green-100 text-green-700 border-green-200',    icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected:    { label: 'Recusada',     color: 'bg-red-100 text-red-700 border-red-200',          icon: <X className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: SuggestionStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.open;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Vote bar ─────────────────────────────────────────────────────────────────
function VoteBar({ likes, dislikes }: { likes: number; dislikes: number }) {
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px]">{pct}% aprovação</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SugestoesPage() {
  const { toast } = useToast();

  // ── List state ───────────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const TAKE = 15;

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [orderBy, setOrderBy] = useState<'likes' | 'createdAt'>('likes');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // ── New suggestion ────────────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Moderate dialog ───────────────────────────────────────────────────────────
  const [moderateTarget, setModerateTarget] = useState<Suggestion | null>(null);
  const [moderateStatus, setModerateStatus] = useState<SuggestionStatus>('open');
  const [moderateNote, setModerateNote] = useState('');
  const [moderating, setModerating] = useState(false);

  // ── Voting ────────────────────────────────────────────────────────────────────
  const [votingId, setVotingId] = useState<string | null>(null);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Fetch suggestions ────────────────────────────────────────────────────────
  // refreshTick is a counter bumped by refreshList() to force a re-fetch even
  // when skip is already 0 (e.g. right after creating a suggestion).
  const [refreshTick, setRefreshTick] = React.useState(0);

  // Single effect — params are captured directly from state so there is NO
  // stale-closure risk. The cleanup flag prevents race conditions when the user
  // changes filters faster than responses arrive.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: Record<string, string> = {
      take: String(TAKE),
      skip: String(skip),
      orderBy,
    };
    if (filterStatus !== 'all') params.status = filterStatus;
    if (search.trim()) params.search = search.trim();

    axios
      .get('/api/user/suggestions', { params, withCredentials: true })
      .then(res => {
        if (cancelled) return;
        setSuggestions(res.data.list);
        setTotalCount(res.data.totalCount);
        setIsAdmin(res.data.isAdmin);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erro', description: 'Falha ao carregar sugestões.', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, filterStatus, orderBy, search, toast, refreshTick]);

  // Reset to page 1 whenever a filter changes. Because `skip` is a dep of the
  // fetch effect, setting it to 0 automatically triggers a new fetch.
  const prevFiltersRef = React.useRef({ filterStatus, orderBy, search });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.filterStatus !== filterStatus ||
      prev.orderBy !== orderBy ||
      prev.search !== search
    ) {
      prevFiltersRef.current = { filterStatus, orderBy, search };
      setSkip(0);
    }
  }, [filterStatus, orderBy, search]);

  // After create / moderate: go back to page 1 AND guarantee a fresh fetch
  // even when skip is already 0.
  const refreshList = useCallback(() => {
    setSkip(0);
    setRefreshTick(t => t + 1);
  }, []);

  // ─── Submit search ────────────────────────────────────────────────────────────
  const handleSearch = () => setSearch(searchInput.trim());
  const handleClearSearch = () => { setSearchInput(''); setSearch(''); };

  // ─── Create suggestion ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (newContent.trim().length < 10) {
      toast({ title: 'Atenção', description: 'A sugestão deve ter ao menos 10 caracteres.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await axios.post('/api/user/suggestions', { content: newContent.trim() }, { withCredentials: true });
      toast({ title: 'Sugestão enviada!', description: 'Sua sugestão foi publicada de forma anônima.' });
      setNewContent('');
      setNewOpen(false);
      refreshList();
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao enviar sugestão.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  // ─── Vote ─────────────────────────────────────────────────────────────────────
  const handleVote = async (suggestion: Suggestion, isLike: boolean) => {
    setVotingId(suggestion.id);
    try {
      const res = await axios.post(
        `/api/user/suggestions/${suggestion.id}/vote`,
        { isLike },
        { withCredentials: true }
      );
      const { likes, dislikes, myVote } = res.data;
      setSuggestions(prev =>
        prev.map(s => s.id === suggestion.id ? { ...s, likes, dislikes, myVote } : s)
      );
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao votar.', variant: 'destructive' });
    } finally {
      setVotingId(null);
    }
  };

  // ─── Moderate ────────────────────────────────────────────────────────────────
  const openModerate = (s: Suggestion) => {
    setModerateTarget(s);
    setModerateStatus(s.status);
    setModerateNote(s.moderatorNote || '');
  };

  const handleModerate = async () => {
    if (!moderateTarget) return;
    setModerating(true);
    try {
      await axios.patch(
        `/api/user/suggestions/${moderateTarget.id}`,
        { status: moderateStatus, moderatorNote: moderateNote },
        { withCredentials: true }
      );
      toast({ title: 'Sugestão atualizada', description: 'Status e nota do moderador salvos.' });
      setModerateTarget(null);
      refreshList();
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao moderar.', variant: 'destructive' });
    } finally {
      setModerating(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover esta sugestão?')) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/user/suggestions/${id}`, { withCredentials: true });
      toast({ title: 'Sugestão removida' });
      setSuggestions(prev => prev.filter(s => s.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao remover.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(totalCount / TAKE);
  const currentPage = Math.floor(skip / TAKE) + 1;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-100 p-2 rounded-lg">
            <Lightbulb className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Sugestões</h1>
            <p className="text-sm text-muted-foreground">
              Sugestões públicas e anônimas — vote nas suas favoritas
            </p>
          </div>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-yellow-500 hover:bg-yellow-600 text-white">
          <Plus className="w-4 h-4 mr-1.5" />
          Nova Sugestão
        </Button>
      </div>

      <Separator />

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Buscar nas sugestões..."
                className="pl-9 pr-9"
              />
              {searchInput && (
                <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={handleSearch} title="Buscar">
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="analyzing">Em Análise</SelectItem>
              <SelectItem value="approved">Aprovada</SelectItem>
              <SelectItem value="implemented">Implementada</SelectItem>
              {isAdmin && <SelectItem value="rejected">Recusada</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Order */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ordenar</label>
          <Select value={orderBy} onValueChange={v => setOrderBy(v as 'likes' | 'createdAt')}>
            <SelectTrigger className="w-40">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="likes">Mais votadas</SelectItem>
              <SelectItem value="createdAt">Mais recentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
          <Lightbulb className="w-12 h-12 mb-3 opacity-20" />
          <p className="font-medium">Nenhuma sugestão encontrada</p>
          <p className="text-sm mt-1">Seja o primeiro a sugerir uma melhoria!</p>
          <Button variant="outline" className="mt-4" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Enviar Sugestão
          </Button>
        </div>
      )}

      {/* ── Suggestion cards ── */}
      {!loading && suggestions.length > 0 && (
        <div className="space-y-4">
          {suggestions.map((s, i) => {
            const isVoting = votingId === s.id;
            const isDeleting = deletingId === s.id;
            const total = s.likes + s.dislikes;

            return (
              <div
                key={s.id}
                className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow space-y-3"
              >
                {/* Top row: rank + status + date */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono w-5 text-right">{skip + i + 1}.</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => openModerate(s)}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          Moderar
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(s.id)}
                          disabled={isDeleting}
                          title="Remover sugestão"
                        >
                          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </Button>
                      </>
                    )}
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(s.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{s.content}</p>

                {/* Moderator note */}
                {s.moderatorNote && (
                  <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-teal-800">{s.moderatorNote}</p>
                  </div>
                )}

                {/* Vote bar */}
                {total > 0 && <VoteBar likes={s.likes} dislikes={s.dislikes} />}

                {/* Vote buttons */}
                <div className="flex items-center gap-3">
                  {/* Like */}
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      s.myVote === 'like'
                        ? 'bg-teal-500 text-white border-teal-500 shadow-sm'
                        : 'border-border text-muted-foreground hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50'
                    }`}
                    onClick={() => handleVote(s, true)}
                    disabled={isVoting}
                    title={s.myVote === 'like' ? 'Remover curtida' : 'Curtir'}
                  >
                    {isVoting && s.myVote !== 'dislike'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ThumbsUp className="w-3.5 h-3.5" />
                    }
                    <span>{s.likes}</span>
                  </button>

                  {/* Dislike */}
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      s.myVote === 'dislike'
                        ? 'bg-red-500 text-white border-red-500 shadow-sm'
                        : 'border-border text-muted-foreground hover:border-red-400 hover:text-red-500 hover:bg-red-50'
                    }`}
                    onClick={() => handleVote(s, false)}
                    disabled={isVoting}
                    title={s.myVote === 'dislike' ? 'Remover voto' : 'Não curtir'}
                  >
                    {isVoting && s.myVote !== 'like'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ThumbsDown className="w-3.5 h-3.5" />
                    }
                    <span>{s.dislikes}</span>
                  </button>

                  <span className="text-xs text-muted-foreground ml-auto">
                    {total} {total === 1 ? 'voto' : 'votos'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setSkip(Math.max(0, skip - TAKE))}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setSkip(skip + TAKE)}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          DIALOG: Nova Sugestão
          ════════════════════════════════════════════════════════════════ */}
      <Dialog open={newOpen} onOpenChange={v => { if (!creating) setNewOpen(v); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              Nova Sugestão
            </DialogTitle>
            <DialogDescription>
              Sua sugestão será publicada de forma <strong>anônima</strong> — seu nome não será exibido.
              A comunidade poderá votar e a equipe irá analisar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Alert className="border-yellow-200 bg-yellow-50">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 text-xs">
                Seja objetivo e construtivo. Sugestões ofensivas serão removidas pela moderação.
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label htmlFor="suggestion-content">
                Sua sugestão <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="suggestion-content"
                placeholder="Descreva sua ideia ou melhoria para o sistema..."
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                disabled={creating}
                className="min-h-[140px] resize-none"
                maxLength={2000}
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">Mínimo 10 caracteres</p>
                <p className={`text-xs ${newContent.length > 1900 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {newContent.length}/2000
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={creating || newContent.trim().length < 10}
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {creating
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                : <><Lightbulb className="w-4 h-4 mr-2" />Publicar Sugestão</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════
          DIALOG: Moderar Sugestão (Admin)
          ════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!moderateTarget} onOpenChange={v => { if (!v && !moderating) setModerateTarget(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600" />
              Moderar Sugestão
            </DialogTitle>
            <DialogDescription>
              Altere o status e adicione uma nota de moderação visível ao público.
            </DialogDescription>
          </DialogHeader>

          {moderateTarget && (
            <div className="space-y-4 py-2">
              {/* Preview da sugestão */}
              <div className="rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground line-clamp-3">
                {moderateTarget.content}
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={moderateStatus} onValueChange={v => setModerateStatus(v as SuggestionStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CFG) as SuggestionStatus[]).map(s => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          {STATUS_CFG[s].icon}
                          {STATUS_CFG[s].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mod-note">Nota do Moderador <span className="text-muted-foreground font-normal text-xs">(pública)</span></Label>
                <Textarea
                  id="mod-note"
                  placeholder="Ex: Sugestão aprovada e adicionada ao roadmap para Q3..."
                  value={moderateNote}
                  onChange={e => setModerateNote(e.target.value)}
                  disabled={moderating}
                  className="min-h-[80px] resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{moderateNote.length}/500</p>
              </div>

              {moderateStatus === 'rejected' && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <AlertDescription className="text-red-700 text-xs">
                    Sugestões recusadas ficam visíveis apenas para administradores.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setModerateTarget(null)} disabled={moderating}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleModerate} disabled={moderating}>
              {moderating
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
                : <><CheckCircle2 className="w-4 h-4 mr-2" />Salvar Moderação</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
