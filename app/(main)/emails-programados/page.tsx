"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
    Mail, Plus, Pencil, Trash2, Send, Clock, CheckCircle2,
    AlertCircle, FileText, Calendar, Building2, Eye, Copy,
    ChevronDown, Loader2, RefreshCw, Play, Pause
} from "lucide-react"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const PLACEHOLDERS = [
    { key: "{{NOME_CONDOMINIO}}", desc: "Nome do condomínio" },
    { key: "{{MES_REFERENCIA}}", desc: "Mês de referência (ex: Março/2026)" },
    { key: "{{SINDICO}}", desc: "Nome do síndico" },
    { key: "{{ADMINISTRADORA}}", desc: "Nome da administradora" },
    { key: "{{NUMERO_OS}}", desc: "Número da ordem de serviço" },
    { key: "{{DATA_LEITURA}}", desc: "Data da leitura realizada" },
    { key: "{{TOTAL_APARTAMENTOS}}", desc: "Total de apartamentos lidos" },
    { key: "{{LINK_PLANILHA}}", desc: "Link da planilha gerada" },
    { key: "{{ANOMALIAS}}", desc: "Lista de anomalias encontradas" },
]

interface EmailTemplate {
    id: string
    name: string
    subject: string
    body: string
    trigger: string
    isActive: boolean
    createdAt: string
}

interface ScheduledEmail {
    id: string
    templateId: string
    templateName: string
    complexId?: string
    complexName?: string
    targetAll: boolean
    scheduledFor?: string
    status: "PENDING" | "SENDING" | "SENT" | "FAILED"
    month: number
    year: number
    sentAt?: string
    recipientCount?: number
    createdAt: string
}

const TRIGGER_OPTIONS = [
    { value: "MANUAL", label: "Manual (envio manual)" },
    { value: "ON_OS_COMPLETE", label: "Ao concluir Ordem de Serviço" },
    { value: "ON_SPREADSHEET_READY", label: "Ao gerar Planilha" },
    { value: "SCHEDULED", label: "Agendado (data específica)" },
]

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
    PENDING: { label: "Pendente", badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    SENDING: { label: "Enviando...", badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
    SENT: { label: "Enviado", badgeClass: "bg-green-100 text-green-800 border-green-200" },
    FAILED: { label: "Falhou", badgeClass: "bg-red-100 text-red-800 border-red-200" },
}

const EMPTY_TEMPLATE: Omit<EmailTemplate, "id" | "createdAt"> = {
    name: "",
    subject: "",
    body: "",
    trigger: "MANUAL",
    isActive: true,
}

export default function EmailsProgramadosPage() {
    const { toast } = useToast()
    const [tab, setTab] = useState("templates")
    const [templates, setTemplates] = useState<EmailTemplate[]>([])
    const [scheduled, setScheduled] = useState<ScheduledEmail[]>([])
    const [loading, setLoading] = useState(false)
    const [complexes, setComplexes] = useState<any[]>([])

    // Template dialog
    const [templateDialog, setTemplateDialog] = useState(false)
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
    const [templateForm, setTemplateForm] = useState({ ...EMPTY_TEMPLATE })
    const [savingTemplate, setSavingTemplate] = useState(false)

    // Schedule dialog
    const [scheduleDialog, setScheduleDialog] = useState(false)
    const [editingSchedule, setEditingSchedule] = useState<ScheduledEmail | null>(null)
    const [scheduleForm, setScheduleForm] = useState({
        templateId: "none",
        complexId: "all",
        targetAll: true,
        scheduledFor: "",
        month: String(new Date().getMonth() + 1),
        year: String(new Date().getFullYear()),
    })
    const [scheduling, setScheduling] = useState(false)

    // Preview dialog
    const [previewDialog, setPreviewDialog] = useState(false)
    const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)

    useEffect(() => {
        // Load sample data - in production these would come from the API
        setTemplates([
            {
                id: "1",
                name: "Planilha de Consumo Mensal",
                subject: "{{NOME_CONDOMINIO}} — Planilha de Consumo {{MES_REFERENCIA}}",
                body: `Prezado(a) síndico(a) {{SINDICO}},

Segue em anexo a planilha de consumo referente ao mês de {{MES_REFERENCIA}}.

A leitura foi realizada em {{DATA_LEITURA}}, com {{TOTAL_APARTAMENTOS}} apartamentos lidos.

{{#if ANOMALIAS}}
Atenção: foram encontradas as seguintes anomalias:
{{ANOMALIAS}}
{{/if}}

Acesse a planilha completa pelo link: {{LINK_PLANILHA}}

Atenciosamente,
Equipe AcquaX`,
                trigger: "ON_SPREADSHEET_READY",
                isActive: true,
                createdAt: new Date().toISOString(),
            },
            {
                id: "2",
                name: "Aviso de Agendamento de Leitura",
                subject: "Agendamento de Leitura — {{NOME_CONDOMINIO}} — {{MES_REFERENCIA}}",
                body: `Prezado(a) síndico(a) {{SINDICO}},

Informamos que a leitura dos medidores do {{NOME_CONDOMINIO}} está agendada para o mês de {{MES_REFERENCIA}}.

Número da Ordem de Serviço: {{NUMERO_OS}}

Por favor, certifique-se de que os moradores estejam cientes para facilitar o acesso dos leituristas.

Atenciosamente,
Equipe AcquaX`,
                trigger: "MANUAL",
                isActive: true,
                createdAt: new Date().toISOString(),
            },
        ])
        setScheduled([
            {
                id: "s1",
                templateId: "1",
                templateName: "Planilha de Consumo Mensal",
                complexName: "Todos os condomínios",
                targetAll: true,
                status: "PENDING",
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                recipientCount: 24,
                createdAt: new Date().toISOString(),
            },
        ])
    }, [])

    useEffect(() => {
        fetch("/api/(public)/user/(places)/complexes?take=500&status=Ativo")
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setComplexes(d.data || d || []))
            .catch(() => { })
    }, [])

    const openNewSchedule = () => {
        setEditingSchedule(null)
        setScheduleForm({ templateId: "none", complexId: "all", targetAll: true, scheduledFor: "", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) })
        setScheduleDialog(true)
    }

    const openEditSchedule = (item: ScheduledEmail) => {
        setEditingSchedule(item)
        setScheduleForm({
            templateId: item.templateId,
            complexId: item.complexId || "all",
            targetAll: item.targetAll,
            scheduledFor: item.scheduledFor || "",
            month: String(item.month),
            year: String(item.year),
        })
        setScheduleDialog(true)
    }

    const deleteSchedule = (id: string) => {
        if (!window.confirm("Excluir este agendamento?")) return
        setScheduled(prev => prev.filter(s => s.id !== id))
        toast({ title: "Agendamento excluído." })
    }

    const openNewTemplate = () => {
        setEditingTemplate(null)
        setTemplateForm({ ...EMPTY_TEMPLATE })
        setTemplateDialog(true)
    }

    const openEditTemplate = (t: EmailTemplate) => {
        setEditingTemplate(t)
        setTemplateForm({
            name: t.name,
            subject: t.subject,
            body: t.body,
            trigger: t.trigger,
            isActive: t.isActive,
        })
        setTemplateDialog(true)
    }

    const saveTemplate = async () => {
        if (!templateForm.name || !templateForm.subject || !templateForm.body) {
            toast({ title: "Atenção", description: "Preencha nome, assunto e corpo do e-mail.", variant: "destructive" })
            return
        }
        setSavingTemplate(true)
        try {
            // In production, save to API
            await new Promise(r => setTimeout(r, 500))
            if (editingTemplate) {
                setTemplates(prev => prev.map(t => t.id === editingTemplate.id
                    ? { ...t, ...templateForm }
                    : t
                ))
                toast({ title: "Template atualizado!", description: templateForm.name })
            } else {
                const newTemplate: EmailTemplate = {
                    id: Date.now().toString(),
                    ...templateForm,
                    createdAt: new Date().toISOString(),
                }
                setTemplates(prev => [...prev, newTemplate])
                toast({ title: "Template criado!", description: templateForm.name })
            }
            setTemplateDialog(false)
        } catch {
            toast({ title: "Erro", description: "Não foi possível salvar o template.", variant: "destructive" })
        } finally {
            setSavingTemplate(false)
        }
    }

    const deleteTemplate = async (id: string) => {
        if (!window.confirm("Excluir este template?")) return
        setTemplates(prev => prev.filter(t => t.id !== id))
        toast({ title: "Template excluído." })
    }

    const handleSchedule = async () => {
        if (scheduleForm.templateId === "none") {
            toast({ title: "Atenção", description: "Selecione um template.", variant: "destructive" })
            return
        }
        setScheduling(true)
        try {
            await new Promise(r => setTimeout(r, 400))
            const template = templates.find(t => t.id === scheduleForm.templateId)
            const complex = complexes.find(c => c.id === scheduleForm.complexId)

            if (editingSchedule) {
                setScheduled(prev => prev.map(s => s.id === editingSchedule.id ? {
                    ...s,
                    templateId: scheduleForm.templateId,
                    templateName: template?.name || s.templateName,
                    complexId: scheduleForm.complexId === "all" ? undefined : scheduleForm.complexId,
                    complexName: scheduleForm.complexId === "all" ? "Todos os condomínios" : (complex?.socialName || ""),
                    targetAll: scheduleForm.complexId === "all",
                    scheduledFor: scheduleForm.scheduledFor || undefined,
                    month: parseInt(scheduleForm.month),
                    year: parseInt(scheduleForm.year),
                } : s))
                toast({ title: "Agendamento atualizado!" })
            } else {
                const newScheduled: ScheduledEmail = {
                    id: Date.now().toString(),
                    templateId: scheduleForm.templateId,
                    templateName: template?.name || "",
                    complexId: scheduleForm.complexId === "all" ? undefined : scheduleForm.complexId,
                    complexName: scheduleForm.complexId === "all" ? "Todos os condomínios" : (complex?.socialName || ""),
                    targetAll: scheduleForm.complexId === "all",
                    scheduledFor: scheduleForm.scheduledFor || undefined,
                    status: "PENDING",
                    month: parseInt(scheduleForm.month),
                    year: parseInt(scheduleForm.year),
                    recipientCount: scheduleForm.complexId === "all" ? complexes.length : 1,
                    createdAt: new Date().toISOString(),
                }
                setScheduled(prev => [newScheduled, ...prev])
                toast({ title: "E-mail agendado!", description: `Para ${newScheduled.complexName}` })
            }
            setScheduleDialog(false)
        } catch {
            toast({ title: "Erro", description: "Não foi possível salvar o agendamento.", variant: "destructive" })
        } finally {
            setScheduling(false)
        }
    }

    const handleSendNow = async (item: ScheduledEmail) => {
        setScheduled(prev => prev.map(s => s.id === item.id ? { ...s, status: "SENDING" } : s))
        await new Promise(r => setTimeout(r, 1500))
        setScheduled(prev => prev.map(s => s.id === item.id
            ? { ...s, status: "SENT", sentAt: new Date().toISOString() }
            : s
        ))
        toast({ title: "E-mail enviado!", description: `Para ${item.complexName}` })
    }

    const insertPlaceholder = (key: string) => {
        setTemplateForm(prev => ({
            ...prev,
            body: prev.body + key,
        }))
    }

    return (
        <div className="space-y-6 w-full p-4 md:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Mail className="h-6 w-6" />
                        E-mails Programados
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Crie templates de e-mail e agende envios para condomínios
                    </p>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="templates">
                        <FileText className="h-4 w-4 mr-2" />
                        Templates
                    </TabsTrigger>
                    <TabsTrigger value="agendamentos">
                        <Calendar className="h-4 w-4 mr-2" />
                        Agendamentos
                    </TabsTrigger>
                    <TabsTrigger value="codigos">
                        <Copy className="h-4 w-4 mr-2" />
                        Códigos {"{{ }}"}
                    </TabsTrigger>
                </TabsList>

                {/* ── TEMPLATES TAB ─────────────────────────────────── */}
                <TabsContent value="templates" className="mt-4">
                    <div className="flex justify-end mb-4">
                        <Button onClick={openNewTemplate}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Template
                        </Button>
                    </div>

                    {templates.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Mail className="h-8 w-8 mx-auto mb-3 opacity-50" />
                                <p>Nenhum template criado ainda.</p>
                                <Button variant="outline" className="mt-4" onClick={openNewTemplate}>
                                    Criar primeiro template
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {templates.map(t => {
                                const triggerOpt = TRIGGER_OPTIONS.find(o => o.value === t.trigger)
                                return (
                                    <Card key={t.id} className="overflow-hidden">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <CardTitle className="text-base truncate">{t.name}</CardTitle>
                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                                                        {t.isActive ? "Ativo" : "Inativo"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-1 mb-3">
                                                <Clock className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">
                                                    Disparo: {triggerOpt?.label || t.trigger}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => { setPreviewTemplate(t); setPreviewDialog(true) }}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    Ver
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() => openEditTemplate(t)}
                                                >
                                                    <Pencil className="h-3 w-3 mr-1" />
                                                    Editar
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setScheduleForm(prev => ({ ...prev, templateId: t.id }))
                                                        setScheduleDialog(true)
                                                    }}
                                                >
                                                    <Send className="h-3 w-3 mr-1" />
                                                    Agendar
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => deleteTemplate(t.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ── AGENDAMENTOS TAB ──────────────────────────────── */}
                <TabsContent value="agendamentos" className="mt-4">
                    <div className="flex justify-end mb-4">
                        <Button onClick={openNewSchedule}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Agendamento
                        </Button>
                    </div>

                    {scheduled.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
                                <p>Nenhum e-mail agendado.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {scheduled.map(item => {
                                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING
                                return (
                                    <Card key={item.id}>
                                        <CardContent className="py-3 px-4">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium text-sm">{item.templateName}</span>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badgeClass}`}>
                                                            {cfg.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Building2 className="h-3 w-3" />
                                                            {item.complexName || "Todos"}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {MONTHS[item.month - 1]} / {item.year}
                                                        </span>
                                                        {item.recipientCount && (
                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                <Mail className="h-3 w-3" />
                                                                {item.recipientCount} destinatário{item.recipientCount !== 1 ? "s" : ""}
                                                            </span>
                                                        )}
                                                        {item.sentAt && (
                                                            <span className="text-xs text-muted-foreground">
                                                                Enviado em {new Date(item.sentAt).toLocaleDateString("pt-BR")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {item.status === "PENDING" && (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleSendNow(item)}
                                                        >
                                                            <Send className="h-3 w-3 mr-1" />
                                                            Enviar Agora
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => openEditSchedule(item)}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => deleteSchedule(item.id)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                                {item.status === "SENDING" && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Enviando...
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ── CÓDIGOS TAB ──────────────────────────────────── */}
                <TabsContent value="codigos" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Códigos de Automação {"{{ }}"}</CardTitle>
                            <CardDescription>
                                Use estes códigos nos templates de e-mail para inserir dados automaticamente.
                                Clique em qualquer código para copiar.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {PLACEHOLDERS.map(p => (
                                    <div
                                        key={p.key}
                                        className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer group"
                                        onClick={() => {
                                            navigator.clipboard.writeText(p.key)
                                            toast({ title: "Copiado!", description: p.key })
                                        }}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <code className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 flex-shrink-0">
                                                {p.key}
                                            </code>
                                            <span className="text-sm text-muted-foreground truncate">{p.desc}</span>
                                        </div>
                                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Copy className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 rounded-lg border bg-yellow-50 p-3 text-sm text-yellow-800">
                                <p className="font-medium mb-1">💡 Como usar:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Insira os códigos diretamente no assunto ou corpo do e-mail</li>
                                    <li>Use <code className="bg-white px-1 rounded">{"{{#if CAMPO}}"}</code> e <code className="bg-white px-1 rounded">{"{{/if}}"}</code> para blocos condicionais</li>
                                    <li>Os valores são substituídos automaticamente no momento do envio</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ── Template Dialog ─────────────────────────────── */}
            <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template de E-mail"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2 sm:col-span-1">
                                <Label>Nome do template *</Label>
                                <Input
                                    value={templateForm.name}
                                    onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Ex: Planilha Mensal"
                                />
                            </div>
                            <div className="space-y-2 col-span-2 sm:col-span-1">
                                <Label>Disparo automático</Label>
                                <Select value={templateForm.trigger} onValueChange={v => setTemplateForm(p => ({ ...p, trigger: v }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TRIGGER_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Assunto *</Label>
                            <Input
                                value={templateForm.subject}
                                onChange={e => setTemplateForm(p => ({ ...p, subject: e.target.value }))}
                                placeholder="Ex: {{NOME_CONDOMINIO}} — Planilha {{MES_REFERENCIA}}"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Corpo do e-mail *</Label>
                            <Textarea
                                value={templateForm.body}
                                onChange={e => setTemplateForm(p => ({ ...p, body: e.target.value }))}
                                rows={10}
                                placeholder="Escreva o corpo do e-mail aqui..."
                                className="font-mono text-sm"
                            />
                        </div>
                        {/* Placeholders */}
                        <div className="rounded-lg border bg-muted/40 p-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Variáveis disponíveis (clique para inserir):</p>
                            <div className="flex flex-wrap gap-1.5">
                                {PLACEHOLDERS.map(p => (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => insertPlaceholder(p.key)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border text-xs hover:bg-blue-50 hover:border-blue-300 transition-colors"
                                        title={p.desc}
                                    >
                                        <code className="text-blue-600">{p.key}</code>
                                        <span className="text-muted-foreground hidden sm:inline">— {p.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={templateForm.isActive}
                                onCheckedChange={v => setTemplateForm(p => ({ ...p, isActive: v }))}
                            />
                            <Label htmlFor="isActive">Template ativo</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancelar</Button>
                        <Button onClick={saveTemplate} disabled={savingTemplate}>
                            {savingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingTemplate ? "Salvar" : "Criar Template"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Schedule Dialog ─────────────────────────────── */}
            <Dialog open={scheduleDialog} onOpenChange={v => { setScheduleDialog(v); if (!v) setEditingSchedule(null) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingSchedule ? "Editar Agendamento" : "Agendar E-mail"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Template *</Label>
                            <Select value={scheduleForm.templateId} onValueChange={v => setScheduleForm(p => ({ ...p, templateId: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o template" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecione o template</SelectItem>
                                    {templates.filter(t => t.isActive).map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Destinatário</Label>
                            <Select value={scheduleForm.complexId} onValueChange={v => setScheduleForm(p => ({ ...p, complexId: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os condomínios</SelectItem>
                                    {complexes.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.socialName || c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Mês referência</Label>
                                <Select value={scheduleForm.month} onValueChange={v => setScheduleForm(p => ({ ...p, month: v }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MONTHS.map((m, i) => (
                                            <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Ano</Label>
                                <Select value={scheduleForm.year} onValueChange={v => setScheduleForm(p => ({ ...p, year: v }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Data de envio (opcional)</Label>
                            <Input
                                type="datetime-local"
                                value={scheduleForm.scheduledFor}
                                onChange={e => setScheduleForm(p => ({ ...p, scheduledFor: e.target.value }))}
                            />
                            <p className="text-xs text-muted-foreground">Deixe em branco para enviar manualmente</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setScheduleDialog(false)}>Cancelar</Button>
                        <Button onClick={handleSchedule} disabled={scheduling}>
                            {scheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingSchedule ? "Salvar" : "Agendar Envio"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Preview Dialog ─────────────────────────────── */}
            <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
                    </DialogHeader>
                    {previewTemplate && (
                        <div className="space-y-3">
                            <div className="rounded border p-3 bg-muted/40">
                                <p className="text-xs text-muted-foreground font-semibold mb-1">ASSUNTO:</p>
                                <p className="text-sm">{previewTemplate.subject}</p>
                            </div>
                            <div className="rounded border p-3 bg-white">
                                <p className="text-xs text-muted-foreground font-semibold mb-2">CORPO:</p>
                                <pre className="text-sm whitespace-pre-wrap font-sans">{previewTemplate.body}</pre>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewDialog(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
