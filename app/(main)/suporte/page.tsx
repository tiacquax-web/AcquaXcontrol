'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  MessageSquare, Plus, Send, Loader2, X, ChevronLeft,
  CheckCircle2, Clock, AlertCircle, RefreshCw, Paperclip,
  User as UserIcon, ShieldCheck, Inbox,
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
import { useUserContext } from '@/hooks/useUserContext';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Types ────────────────────────────────────────────────────────────────────
type TicketStatus = 'open' | 'answered' | 'closed';

interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  isAdmin: boolean;
  content: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  userId: string;
  complexId?: string | null;
  user?: { id: string; name: string; email: string };
  complex?: { id: string; socialName: string } | null;
  messages?: SupportMessage[];
  _count?: { messages: number };
  unreadByUser: boolean;
  unreadByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open:     { label: 'Aberto',     color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: <Clock className="w-3 h-3" /> },
  answered: { label: 'Respondido', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  closed:   { label: 'Encerrado',  color: 'bg-muted text-muted-foreground border-border',   icon: <X className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.open;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function timeAgo(dateStr: string) {
  return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SuportePage() {
  const { toast } = useToast();
  const { context: userContext } = useUserContext();

  // ── State: list ─────────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // Admin/programador entram automaticamente na visão de todos os chamados
  const isSystemUser = userContext?.isSystem ?? false;
  const [adminView, setAdminView] = useState(isSystemUser);

  // ── State: selected ticket ───────────────────────────────────────────────────
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);

  // ── State: new message ───────────────────────────────────────────────────────
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // ── State: file attachment ────────────────────────────────────────────────────
  const [attachedFile, setAttachedFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE_MB = 2;

  // ── State: new ticket dialog ─────────────────────────────────────────────────
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // ── State: status update ─────────────────────────────────────────────────────
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch ticket list ────────────────────────────────────────────────────────
  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (adminView) params.admin = 'true';
      const res = await axios.get('/api/user/support', { params, withCredentials: true });
      setTickets(res.data.list);
      setTotalCount(res.data.totalCount);
      setIsAdmin(res.data.isAdmin);
      // Se descobriu que é admin mas o adminView ainda não foi ligado, liga automaticamente
      if (res.data.isAdmin && !adminView) {
        setAdminView(true);
      }
    } catch {
      if (!silent) toast({ title: 'Erro', description: 'Falha ao carregar chamados.', variant: 'destructive' });
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [filterStatus, adminView, toast]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ── Fetch ticket detail ──────────────────────────────────────────────────────
  const fetchTicketDetail = useCallback(async (ticketId: string, silent = false) => {
    if (!silent) setLoadingTicket(true);
    try {
      const res = await axios.get(`/api/user/support/${ticketId}`, { withCredentials: true });
      setSelectedTicket(res.data);
      // update unread flags in list
      setTickets(prev => prev.map(t => t.id === ticketId
        ? { ...t, unreadByUser: false, unreadByAdmin: false }
        : t
      ));
    } catch (err: any) {
      if (!silent) toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao carregar ticket.', variant: 'destructive' });
    } finally {
      if (!silent) setLoadingTicket(false);
    }
  }, [toast]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (selectedTicket?.messages?.length) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [selectedTicket?.messages?.length]);

  // Auto-refresh ticket detail every 15s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedTicket) {
      pollRef.current = setInterval(() => {
        fetchTicketDetail(selectedTicket.id, true);
      }, 15000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedTicket?.id, fetchTicketDetail]);

  // ── File attachment handler ───────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: `O arquivo deve ter no máximo ${MAX_FILE_SIZE_MB} MB.`, variant: 'destructive' });
      // Reset input so the same file can be re-selected after dismissal
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachedFile({ name: file.name, dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!selectedTicket || (!newMsg.trim() && !attachedFile)) return;
    setSendingMsg(true);
    try {
      await axios.post(`/api/user/support/${selectedTicket.id}/messages`, {
        content: newMsg.trim() || '📎 Anexo',
        attachmentUrl: attachedFile?.dataUrl ?? undefined,
      }, { withCredentials: true });
      setNewMsg('');
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTicketDetail(selectedTicket.id, true);
      await fetchTickets(true);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao enviar mensagem.', variant: 'destructive' });
    } finally {
      setSendingMsg(false);
    }
  };

  // ── Create ticket ────────────────────────────────────────────────────────────
  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      toast({ title: 'Atenção', description: 'Preencha o assunto e a mensagem.', variant: 'destructive' });
      return;
    }
    setCreatingTicket(true);
    try {
      const res = await axios.post('/api/user/support', {
        subject: newSubject.trim(),
        message: newMessage.trim(),
      }, { withCredentials: true });
      toast({ title: 'Chamado aberto!', description: 'Sua mensagem foi enviada à equipe de suporte.' });
      setNewTicketOpen(false);
      setNewSubject('');
      setNewMessage('');
      await fetchTickets();
      // Busca o detalhe completo do ticket recém-criado em vez de usar o objeto
      // bruto do POST (que não inclui isAdmin e pode ter shape diferente do detail).
      if (res.data?.id) {
        await fetchTicketDetail(res.data.id);
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao criar chamado.', variant: 'destructive' });
    } finally {
      setCreatingTicket(false);
    }
  };

  // ── Update status ────────────────────────────────────────────────────────────
  const handleUpdateStatus = async (status: TicketStatus) => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    try {
      await axios.patch(`/api/user/support/${selectedTicket.id}`, { status }, { withCredentials: true });
      setSelectedTicket(prev => prev ? { ...prev, status } : prev);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status } : t));
      toast({ title: 'Status atualizado', description: `Ticket marcado como ${STATUS_MAP[status]?.label}.` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.response?.data?.error || 'Falha ao atualizar status.', variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-h-[900px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2 rounded-lg">
            <MessageSquare className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Suporte</h1>
            <p className="text-xs text-muted-foreground">Atendimento privado com a equipe AcquaX</p>
          </div>
        </div>
        {!(isAdmin && adminView) && (
          <Button size="sm" onClick={() => setNewTicketOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Chamado
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ════════════════════════════════════════════════════════════════
            LISTA DE TICKETS (painel esquerdo)
            ════════════════════════════════════════════════════════════════ */}
        <div className={`flex flex-col border-r bg-muted/30 shrink-0 w-full sm:w-72 md:w-80 ${selectedTicket ? 'hidden sm:flex' : 'flex'}`}>
          {/* Filtros */}
          <div className="p-3 border-b bg-card space-y-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="answered">Respondido</SelectItem>
                <SelectItem value="closed">Encerrado</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <button
                className={`w-full text-xs flex items-center gap-1.5 px-2 py-1.5 rounded border transition-colors font-medium ${adminView ? 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-400' : 'border-border text-muted-foreground hover:bg-muted'}`}
                onClick={() => setAdminView(v => !v)}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {adminView ? '👁 Visão Admin — Todos os chamados' : 'Ativar Visão Admin'}
              </button>
            )}
          </div>

          {/* Lista */}
          <ScrollArea className="flex-1">
            {loadingList ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-4 text-center">
                <Inbox className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">Nenhum chamado encontrado</p>
                <p className="text-xs mt-1">{adminView ? 'Nenhum chamado de usuários no sistema.' : 'Clique em "Novo Chamado" para abrir seu primeiro atendimento.'}</p>
              </div>
            ) : (
              <div className="divide-y">
                {tickets.map(t => {
                  const unread = isAdmin ? t.unreadByAdmin : t.unreadByUser;
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      className={`w-full text-left px-3 py-3 transition-colors flex flex-col gap-1 ${isSelected ? 'bg-teal-50 dark:bg-teal-950/40 border-l-2 border-teal-500' : 'hover:bg-muted border-l-2 border-transparent'}`}
                      onClick={() => fetchTicketDetail(t.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-sm font-medium leading-tight line-clamp-1 flex-1 ${unread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                          {unread && <span className="inline-block w-2 h-2 rounded-full bg-teal-500 mr-1.5 mb-0.5 shrink-0" />}
                          {t.subject}
                        </span>
                        <StatusBadge status={t.status} />
                      </div>
                      {isAdmin && t.user && (
                        <span className="text-xs text-muted-foreground truncate">{t.user.name}</span>
                      )}
                      {t.complex && (
                        <span className="text-xs text-muted-foreground truncate">{t.complex.socialName}</span>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(t.updatedAt), "dd/MM/yy HH:mm")}
                        </span>
                        {t._count && (
                          <span className="text-[10px] text-muted-foreground">{t._count.messages} msg{t._count.messages !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="p-2 border-t bg-card">
            <p className="text-[10px] text-center text-muted-foreground">{totalCount} chamado(s) no total</p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            ÁREA DO CHAT (painel direito)
            ════════════════════════════════════════════════════════════════ */}
        <div className={`flex-1 flex flex-col bg-card ${selectedTicket ? 'flex' : 'hidden sm:flex'}`}>
          {!selectedTicket ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="w-12 h-12 opacity-20" />
              <p className="font-medium">Selecione um chamado</p>
              <p className="text-sm">ou abra um novo para começar</p>
            </div>
          ) : loadingTicket ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : (
            <>
              {/* ── Ticket header ── */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
                <button
                  className="sm:hidden p-1 rounded hover:bg-muted"
                  onClick={() => setSelectedTicket(null)}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-sm truncate">{selectedTicket.subject}</h2>
                    <StatusBadge status={selectedTicket.status} />
                  </div>
                  {isAdmin && selectedTicket.user && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTicket.user.name} · {selectedTicket.user.email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Aberto em {timeAgo(selectedTicket.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Atualizar"
                    onClick={() => fetchTicketDetail(selectedTicket.id)}
                    disabled={loadingTicket}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  {isAdmin && selectedTicket.status !== 'closed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleUpdateStatus('closed')}
                      disabled={updatingStatus}
                    >
                      {updatingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                      Encerrar
                    </Button>
                  )}
                  {isAdmin && selectedTicket.status === 'closed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleUpdateStatus('open')}
                      disabled={updatingStatus}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Reabrir
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Messages ── */}
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="space-y-4 max-w-2xl mx-auto">
                  {(selectedTicket.messages ?? []).map(msg => {
                    const isMyMessage = !msg.isAdmin || (isAdmin && msg.isAdmin);
                    const fromAdmin = msg.isAdmin;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${fromAdmin ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {/* Avatar */}
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${fromAdmin ? 'bg-teal-600' : 'bg-blue-500'}`}>
                          {fromAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                        </div>
                        {/* Bubble */}
                        <div className={`max-w-[75%] ${fromAdmin ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${fromAdmin ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'}`}>
                            {msg.content}
                            {msg.attachmentUrl && (
                              msg.attachmentUrl.startsWith('data:image/') ? (
                                /* Inline image preview */
                                <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                  <img
                                    src={msg.attachmentUrl}
                                    alt="Anexo"
                                    className="max-w-[200px] max-h-[160px] rounded-lg object-contain border border-white/20"
                                  />
                                </a>
                              ) : (
                                /* Non-image file link */
                                <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 mt-1.5 text-xs underline opacity-80 hover:opacity-100">
                                  <Paperclip className="w-3 h-3" />Baixar anexo
                                </a>
                              )
                            )}
                          </div>
                          <span className={`text-[10px] text-muted-foreground px-1 ${fromAdmin ? 'text-right' : 'text-left'}`}>
                            {fromAdmin ? 'Suporte AcquaX' : (isAdmin ? (selectedTicket.user?.name || 'Usuário') : 'Você')} · {format(new Date(msg.createdAt), 'dd/MM HH:mm')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* ── Input area ── */}
              {selectedTicket.status === 'closed' ? (
                <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
                  <Alert className="border-border bg-muted/50">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm text-muted-foreground">
                      Este chamado está encerrado. Para continuar, abra um novo chamado.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="px-4 py-3 border-t bg-card shrink-0">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={handleFileSelect}
                  />

                  {/* Attachment preview pill */}
                  {attachedFile && (
                    <div className="flex items-center gap-2 mb-2 max-w-2xl mx-auto">
                      <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-700 rounded-full px-3 py-1 text-xs text-teal-800 dark:text-teal-300 max-w-[260px]">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate">{attachedFile.name}</span>
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={handleRemoveAttachment}
                        title="Remover anexo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 max-w-2xl mx-auto">
                    <Textarea
                      placeholder="Digite sua mensagem..."
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      className="min-h-[60px] max-h-[140px] resize-none text-sm"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendMessage();
                      }}
                      disabled={sendingMsg}
                    />
                    <div className="flex flex-col gap-2">
                      {/* Attach file button */}
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sendingMsg}
                        title="Anexar arquivo (máx. 2 MB)"
                        className={attachedFile ? 'border-teal-400 text-teal-600' : ''}
                      >
                        <Paperclip className="w-4 h-4" />
                      </Button>
                      {/* Send button */}
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={sendingMsg || (!newMsg.trim() && !attachedFile)}
                        className="bg-teal-600 hover:bg-teal-700 flex-1"
                        title="Enviar (Ctrl+Enter)"
                      >
                        {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 max-w-2xl mx-auto">Ctrl+Enter para enviar · Anexos até 2 MB</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          DIALOG: Novo Chamado
          ════════════════════════════════════════════════════════════════ */}
      <Dialog open={newTicketOpen} onOpenChange={v => { if (!creatingTicket) setNewTicketOpen(v); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-600" />
              Novo Chamado de Suporte
            </DialogTitle>
            <DialogDescription>
              Descreva seu problema ou dúvida. Nossa equipe responderá em breve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Assunto <span className="text-red-500">*</span></Label>
              <Input
                id="subject"
                placeholder="Ex: Problema ao lançar leitura do medidor"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                disabled={creatingTicket}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first-message">Descrição <span className="text-red-500">*</span></Label>
              <Textarea
                id="first-message"
                placeholder="Descreva detalhadamente o problema ou dúvida..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                disabled={creatingTicket}
                className="min-h-[120px] resize-none"
                maxLength={3000}
              />
              <p className="text-xs text-muted-foreground text-right">{newMessage.length}/3000</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setNewTicketOpen(false)} disabled={creatingTicket}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateTicket}
              disabled={creatingTicket || !newSubject.trim() || !newMessage.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {creatingTicket ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Abrindo...</> : <><Send className="w-4 h-4 mr-2" />Abrir Chamado</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
