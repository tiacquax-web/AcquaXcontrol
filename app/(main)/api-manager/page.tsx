"use client"

import { useEffect, useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Key, Plus, Copy, Trash2, RefreshCw, Eye, EyeOff, Shield,
    Webhook, BookOpen, Activity, AlertCircle, CheckCircle2,
    Clock, Globe, Lock, Zap, ChevronRight, BarChart3, Loader2
} from "lucide-react"
import axios from "axios"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ApiKey {
    id: string
    name: string
    keyPrefix: string
    status: "active" | "expired" | "revoked" | "suspended"
    keyType: "permanent" | "temporary"
    expiresAt: string | null
    lastUsedAt: string | null
    permissions: Record<string, string[]>
    description: string | null
    createdAt: string
    logCount?: number
    owner?: { name: string; email: string }
}

interface WebhookItem {
    id: string
    name: string
    url: string
    status: "active" | "inactive"
    events: string[]
    description: string | null
    createdAt: string
    deliveryCount?: number
}

interface ApiLog {
    id: string
    method: string
    endpoint: string
    statusCode: number
    ipAddress: string | null
    responseTimeMs: number | null
    createdAt: string
    errorMessage: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const RESOURCES = [
    { key: "users", label: "Usuários" },
    { key: "meters", label: "Medidores" },
    { key: "readings", label: "Leituras" },
    { key: "complexes", label: "Condomínios" },
    { key: "blocks", label: "Blocos" },
    { key: "apartments", label: "Apartamentos" },
    { key: "reports", label: "Relatórios" },
]

const ACTIONS = [
    { key: "read", label: "Leitura" },
    { key: "create", label: "Criação" },
    { key: "update", label: "Edição" },
    { key: "delete", label: "Exclusão" },
]

const WEBHOOK_EVENTS = [
    { key: "user_created", label: "Usuário criado" },
    { key: "user_updated", label: "Usuário atualizado" },
    { key: "user_deleted", label: "Usuário removido" },
    { key: "reading_created", label: "Leitura registrada" },
    { key: "meter_created", label: "Medidor criado" },
    { key: "apartment_created", label: "Apartamento criado" },
    { key: "block_created", label: "Bloco criado" },
    { key: "complex_created", label: "Condomínio criado" },
    { key: "dealership_reading_created", label: "Conta concessionária lançada" },
    { key: "report_generated", label: "Relatório gerado" },
    { key: "api_key_created", label: "API Key criada" },
    { key: "api_key_revoked", label: "API Key revogada" },
]

const EXPIRY_OPTIONS = [
    { value: "1h", label: "1 hora" },
    { value: "24h", label: "24 horas" },
    { value: "7d", label: "7 dias" },
    { value: "30d", label: "30 dias" },
    { value: "permanent", label: "Sem expiração" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
        active: { label: "Ativa", variant: "default" },
        expired: { label: "Expirada", variant: "secondary" },
        revoked: { label: "Revogada", variant: "destructive" },
        suspended: { label: "Suspensa", variant: "outline" },
        inactive: { label: "Inativa", variant: "secondary" },
    }
    const m = map[status] || { label: status, variant: "outline" }
    return <Badge variant={m.variant}>{m.label}</Badge>
}

function HttpStatusBadge({ code }: { code: number }) {
    const color = code < 300 ? "bg-green-100 text-green-800" : code < 400 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
    return <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${color}`}>{code}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ApiManagerPage() {
    const [activeTab, setActiveTab] = useState("keys")
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
    const [logs, setLogs] = useState<ApiLog[]>([])
    const [loadingKeys, setLoadingKeys] = useState(false)
    const [loadingWebhooks, setLoadingWebhooks] = useState(false)
    const [loadingLogs, setLoadingLogs] = useState(false)

    // Modals
    const [showCreateKey, setShowCreateKey] = useState(false)
    const [showTokenModal, setShowTokenModal] = useState(false)
    const [newToken, setNewToken] = useState("")
    const [showCreateWebhook, setShowCreateWebhook] = useState(false)
    const [showLogsModal, setShowLogsModal] = useState<string | null>(null)
    const [keyLogs, setKeyLogs] = useState<ApiLog[]>([])

    const { toast } = useToast()

    // ── Fetch API Keys ────────────────────────────────────────────────────────
    const fetchKeys = useCallback(async () => {
        setLoadingKeys(true)
        try {
            const { data } = await axios.get("/api/user/api-keys")
            setApiKeys(data.list || [])
        } catch {
            toast({ title: "Erro", description: "Não foi possível carregar as chaves.", variant: "destructive" })
        } finally {
            setLoadingKeys(false)
        }
    }, [toast])

    // ── Fetch Webhooks ────────────────────────────────────────────────────────
    const fetchWebhooks = useCallback(async () => {
        setLoadingWebhooks(true)
        try {
            const { data } = await axios.get("/api/user/webhooks")
            setWebhooks(data.list || [])
        } catch {
            toast({ title: "Erro", description: "Não foi possível carregar os webhooks.", variant: "destructive" })
        } finally {
            setLoadingWebhooks(false)
        }
    }, [toast])

    // ── Fetch Logs ────────────────────────────────────────────────────────────
    const fetchLogs = useCallback(async () => {
        setLoadingLogs(true)
        try {
            const { data } = await axios.get("/api/user/api-keys/logs")
            setLogs(data.logs || [])
        } catch {
            // Logs podem não existir ainda
            setLogs([])
        } finally {
            setLoadingLogs(false)
        }
    }, [])

    useEffect(() => {
        fetchKeys()
        fetchWebhooks()
    }, [fetchKeys, fetchWebhooks])

    useEffect(() => {
        if (activeTab === "logs") fetchLogs()
    }, [activeTab, fetchLogs])

    // ── Revogar chave ─────────────────────────────────────────────────────────
    const revokeKey = async (keyId: string, keyName: string) => {
        if (!confirm(`Revogar a chave "${keyName}"? Esta ação não pode ser desfeita.`)) return
        try {
            await axios.delete(`/api/user/api-keys/${keyId}`)
            toast({ title: "Chave revogada", description: `"${keyName}" foi revogada com sucesso.` })
            fetchKeys()
        } catch (e: any) {
            toast({ title: "Erro", description: e?.response?.data?.error || "Erro ao revogar chave.", variant: "destructive" })
        }
    }

    // ── Suspender/Reativar chave ──────────────────────────────────────────────
    const toggleSuspend = async (key: ApiKey) => {
        const newStatus = key.status === "suspended" ? "active" : "suspended"
        try {
            await axios.patch(`/api/user/api-keys/${key.id}`, { status: newStatus })
            toast({ title: newStatus === "suspended" ? "Chave suspensa" : "Chave reativada" })
            fetchKeys()
        } catch (e: any) {
            toast({ title: "Erro", description: e?.response?.data?.error || "Erro ao atualizar status.", variant: "destructive" })
        }
    }

    // ── Ver logs de uma chave ─────────────────────────────────────────────────
    const viewKeyLogs = async (keyId: string) => {
        setShowLogsModal(keyId)
        try {
            const { data } = await axios.get(`/api/user/api-keys/${keyId}`)
            setKeyLogs(data.logs || [])
        } catch {
            setKeyLogs([])
        }
    }

    // ── Deletar webhook ───────────────────────────────────────────────────────
    const deleteWebhook = async (webhookId: string, name: string) => {
        if (!confirm(`Remover o webhook "${name}"?`)) return
        try {
            await axios.delete(`/api/user/webhooks/${webhookId}`)
            toast({ title: "Webhook removido" })
            fetchWebhooks()
        } catch (e: any) {
            toast({ title: "Erro", description: e?.response?.data?.error || "Erro ao remover.", variant: "destructive" })
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado!", description: "Texto copiado para a área de transferência." })
        })
    }

    const formatDate = (d: string | null) => {
        if (!d) return "—"
        return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    }

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Key className="h-5 w-5 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Gerenciador de API</h1>
                </div>
                <p className="text-muted-foreground text-sm ml-12">
                    Gerencie chaves de API, webhooks, permissões e monitore integrações externas.
                </p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-muted-foreground">Chaves ativas</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{apiKeys.filter(k => k.status === "active").length}</p>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-purple-500" />
                        <span className="text-xs text-muted-foreground">Webhooks ativos</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{webhooks.filter(w => w.status === "active").length}</p>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-muted-foreground">Requisições totais</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{apiKeys.reduce((s, k) => s + (k.logCount || 0), 0)}</p>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground">Base URL</span>
                    </div>
                    <p className="text-xs font-mono mt-1 truncate">/api/v1</p>
                </Card>
            </div>

            {/* Main tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4 flex-wrap h-auto gap-1">
                    <TabsTrigger value="keys" className="gap-1.5"><Key className="h-3.5 w-3.5" />Chaves</TabsTrigger>
                    <TabsTrigger value="webhooks" className="gap-1.5"><Webhook className="h-3.5 w-3.5" />Webhooks</TabsTrigger>
                    <TabsTrigger value="logs" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Logs</TabsTrigger>
                    <TabsTrigger value="docs" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Documentação</TabsTrigger>
                </TabsList>

                {/* ── API KEYS TAB ─────────────────────────────────────────── */}
                <TabsContent value="keys">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base">API Keys</CardTitle>
                                <CardDescription>Chaves para autenticar integrações externas via Bearer Token</CardDescription>
                            </div>
                            <Button size="sm" onClick={() => setShowCreateKey(true)} className="gap-1.5">
                                <Plus className="h-4 w-4" /> Nova Chave
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loadingKeys ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : apiKeys.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <Key className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">Nenhuma API Key criada ainda.</p>
                                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateKey(true)}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeira chave
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {apiKeys.map((key) => (
                                        <div key={key.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-start justify-between gap-2 flex-wrap">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium text-sm">{key.name}</span>
                                                        <StatusBadge status={key.status} />
                                                        <Badge variant="outline" className="text-xs">
                                                            {key.keyType === "permanent" ? "Permanente" : "Temporária"}
                                                        </Badge>
                                                    </div>
                                                    {key.description && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">{key.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                                            {key.keyPrefix}
                                                        </code>
                                                        <span className="text-xs text-muted-foreground">
                                                            Criada {formatDate(key.createdAt)}
                                                        </span>
                                                        {key.expiresAt && (
                                                            <span className="text-xs text-muted-foreground">
                                                                Expira {formatDate(key.expiresAt)}
                                                            </span>
                                                        )}
                                                        {key.lastUsedAt && (
                                                            <span className="text-xs text-muted-foreground">
                                                                Último uso {formatDate(key.lastUsedAt)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Permissões resumidas */}
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {Object.entries(key.permissions || {}).map(([resource, actions]) => (
                                                            <span key={resource} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                                                                {resource}: {(actions as string[]).join(",")}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Ações */}
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        onClick={() => viewKeyLogs(key.id)}
                                                        title="Ver logs"
                                                        className="h-7 w-7"
                                                    >
                                                        <Activity className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {key.status !== "revoked" && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            onClick={() => toggleSuspend(key)}
                                                            title={key.status === "suspended" ? "Reativar" : "Suspender"}
                                                            className="h-7 w-7"
                                                        >
                                                            {key.status === "suspended"
                                                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                                : <Clock className="h-3.5 w-3.5 text-yellow-500" />
                                                            }
                                                        </Button>
                                                    )}
                                                    {key.status !== "revoked" && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            onClick={() => revokeKey(key.id, key.name)}
                                                            title="Revogar"
                                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── WEBHOOKS TAB ─────────────────────────────────────────── */}
                <TabsContent value="webhooks">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base">Webhooks</CardTitle>
                                <CardDescription>Receba notificações automáticas em URLs externas quando eventos ocorrem</CardDescription>
                            </div>
                            <Button size="sm" onClick={() => setShowCreateWebhook(true)} className="gap-1.5">
                                <Plus className="h-4 w-4" /> Novo Webhook
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loadingWebhooks ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : webhooks.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <Webhook className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">Nenhum webhook configurado ainda.</p>
                                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateWebhook(true)}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Criar webhook
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {webhooks.map((wh) => (
                                        <div key={wh.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium text-sm">{wh.name}</span>
                                                        <StatusBadge status={wh.status} />
                                                    </div>
                                                    {wh.description && <p className="text-xs text-muted-foreground mt-0.5">{wh.description}</p>}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-xs">{wh.url}</code>
                                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(wh.url)}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {wh.events.map((ev) => (
                                                            <span key={ev} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">
                                                                {WEBHOOK_EVENTS.find(e => e.key === ev)?.label || ev}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">Criado {formatDate(wh.createdAt)} · {wh.deliveryCount || 0} entregas</p>
                                                </div>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => deleteWebhook(wh.id, wh.name)}
                                                    className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── LOGS TAB ─────────────────────────────────────────────── */}
                <TabsContent value="logs">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">Logs de Acesso</CardTitle>
                                    <CardDescription>Histórico de requisições realizadas via API Key</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
                                    <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingLogs ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">Nenhum log encontrado. Os logs aparecem após as primeiras requisições via API.</p>
                                </div>
                            ) : (
                                <ScrollArea className="h-96">
                                    <div className="space-y-2">
                                        {logs.map((log) => (
                                            <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 text-sm border-b last:border-0">
                                                <span className={`text-xs font-mono font-semibold w-12 ${log.method === 'GET' ? 'text-blue-600' : log.method === 'POST' ? 'text-green-600' : log.method === 'DELETE' ? 'text-red-600' : 'text-yellow-600'}`}>
                                                    {log.method}
                                                </span>
                                                <span className="font-mono text-xs flex-1 truncate">{log.endpoint}</span>
                                                <HttpStatusBadge code={log.statusCode} />
                                                {log.responseTimeMs !== null && (
                                                    <span className="text-xs text-muted-foreground w-14 text-right">{log.responseTimeMs}ms</span>
                                                )}
                                                <span className="text-xs text-muted-foreground w-28 text-right">{formatDate(log.createdAt)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── DOCS TAB ─────────────────────────────────────────────── */}
                <TabsContent value="docs">
                    <ApiDocumentation />
                </TabsContent>
            </Tabs>

            {/* ── MODAL: Criar API Key ──────────────────────────────────────── */}
            <CreateApiKeyModal
                open={showCreateKey}
                onClose={() => setShowCreateKey(false)}
                onSuccess={(token) => {
                    setShowCreateKey(false)
                    setNewToken(token)
                    setShowTokenModal(true)
                    fetchKeys()
                }}
            />

            {/* ── MODAL: Exibir token gerado ────────────────────────────────── */}
            <Dialog open={showTokenModal} onOpenChange={setShowTokenModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-green-500" /> Token gerado com sucesso
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            <strong>Atenção:</strong> Este token será exibido apenas uma vez. Copie e guarde-o com segurança.
                        </div>
                        <div className="relative">
                            <code className="block bg-muted p-3 rounded-lg font-mono text-xs break-all pr-10">
                                {newToken}
                            </code>
                            <Button
                                variant="ghost" size="icon"
                                className="absolute top-2 right-2 h-6 w-6"
                                onClick={() => copyToClipboard(newToken)}
                            >
                                <Copy className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Use no cabeçalho HTTP: <code className="bg-muted px-1 rounded">Authorization: Bearer {"{token}"}</code>
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => { copyToClipboard(newToken); setShowTokenModal(false) }} className="gap-1.5">
                            <Copy className="h-4 w-4" /> Copiar e fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MODAL: Criar Webhook ──────────────────────────────────────── */}
            <CreateWebhookModal
                open={showCreateWebhook}
                onClose={() => setShowCreateWebhook(false)}
                onSuccess={() => { setShowCreateWebhook(false); fetchWebhooks() }}
            />

            {/* ── MODAL: Logs de uma chave ──────────────────────────────────── */}
            <Dialog open={!!showLogsModal} onOpenChange={() => setShowLogsModal(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Logs de uso da chave</DialogTitle>
                    </DialogHeader>
                    {keyLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">Nenhum log para esta chave ainda.</p>
                    ) : (
                        <ScrollArea className="h-80">
                            <div className="space-y-1.5">
                                {keyLogs.map((log) => (
                                    <div key={log.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 text-xs">
                                        <span className={`font-mono font-semibold w-12 ${log.method === 'GET' ? 'text-blue-600' : log.method === 'POST' ? 'text-green-600' : 'text-red-600'}`}>
                                            {log.method}
                                        </span>
                                        <span className="font-mono flex-1 truncate">{log.endpoint}</span>
                                        <HttpStatusBadge code={log.statusCode} />
                                        {log.responseTimeMs !== null && <span className="text-muted-foreground">{log.responseTimeMs}ms</span>}
                                        <span className="text-muted-foreground">{formatDate(log.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateApiKeyModal
// ─────────────────────────────────────────────────────────────────────────────
function CreateApiKeyModal({ open, onClose, onSuccess }: {
    open: boolean
    onClose: () => void
    onSuccess: (token: string) => void
}) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [expiryPreset, setExpiryPreset] = useState("permanent")
    const [permissions, setPermissions] = useState<Record<string, string[]>>({})
    const [rateLimit, setRateLimit] = useState("")
    const [allowedIps, setAllowedIps] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const { toast } = useToast()

    const togglePermission = (resource: string, action: string) => {
        setPermissions((prev) => {
            const current = prev[resource] || []
            const next = current.includes(action)
                ? current.filter((a) => a !== action)
                : [...current, action]
            if (next.length === 0) {
                const { [resource]: _, ...rest } = prev
                return rest
            }
            return { ...prev, [resource]: next }
        })
    }

    const handleSubmit = async () => {
        if (!name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return }
        if (Object.keys(permissions).length === 0) {
            toast({ title: "Selecione ao menos uma permissão", variant: "destructive" }); return
        }
        setSubmitting(true)
        try {
            const ips = allowedIps.trim().split("\n").map(s => s.trim()).filter(Boolean)
            const { data } = await axios.post("/api/user/api-keys", {
                name, description, expiryPreset, permissions,
                rateLimit: rateLimit || undefined,
                allowedIps: ips,
            })
            onSuccess(data.token)
        } catch (e: any) {
            toast({ title: "Erro", description: e?.response?.data?.error || "Erro ao criar chave.", variant: "destructive" })
        } finally {
            setSubmitting(false)
        }
    }

    // Reset on close
    useEffect(() => {
        if (!open) {
            setName(""); setDescription(""); setExpiryPreset("permanent")
            setPermissions({}); setRateLimit(""); setAllowedIps("")
        }
    }, [open])

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Key className="h-4 w-4" /> Nova API Key
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                    {/* Nome e descrição */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Nome da chave *</Label>
                            <Input
                                placeholder="Ex: Integração ERP"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Expiração</Label>
                            <Select value={expiryPreset} onValueChange={setExpiryPreset}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPIRY_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label>Descrição</Label>
                        <Textarea
                            placeholder="Descreva para que serve esta chave..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="mt-1 resize-none"
                        />
                    </div>

                    {/* Permissões */}
                    <div>
                        <Label className="block mb-2">Permissões de acesso</Label>
                        <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-5 text-xs font-medium bg-muted px-3 py-2">
                                <span>Recurso</span>
                                {ACTIONS.map((a) => <span key={a.key} className="text-center">{a.label}</span>)}
                            </div>
                            {RESOURCES.map((resource) => (
                                <div key={resource.key} className="grid grid-cols-5 px-3 py-2 border-t hover:bg-muted/30">
                                    <span className="text-sm font-medium self-center">{resource.label}</span>
                                    {ACTIONS.map((action) => (
                                        <div key={action.key} className="flex justify-center">
                                            <Checkbox
                                                checked={(permissions[resource.key] || []).includes(action.key)}
                                                onCheckedChange={() => togglePermission(resource.key, action.key)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Configurações avançadas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Rate limit (req/min)</Label>
                            <Input
                                type="number"
                                placeholder="Padrão: 300"
                                value={rateLimit}
                                onChange={(e) => setRateLimit(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>IPs permitidos</Label>
                            <Textarea
                                placeholder="Um IP por linha (vazio = qualquer)"
                                value={allowedIps}
                                onChange={(e) => setAllowedIps(e.target.value)}
                                rows={2}
                                className="mt-1 resize-none font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                        Gerar Chave
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateWebhookModal
// ─────────────────────────────────────────────────────────────────────────────
function CreateWebhookModal({ open, onClose, onSuccess }: {
    open: boolean
    onClose: () => void
    onSuccess: () => void
}) {
    const [name, setName] = useState("")
    const [url, setUrl] = useState("")
    const [description, setDescription] = useState("")
    const [secret, setSecret] = useState("")
    const [events, setEvents] = useState<string[]>([])
    const [submitting, setSubmitting] = useState(false)
    const { toast } = useToast()

    const toggleEvent = (ev: string) => {
        setEvents((prev) => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
    }

    const handleSubmit = async () => {
        if (!name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return }
        if (!url.trim()) { toast({ title: "URL obrigatória", variant: "destructive" }); return }
        if (events.length === 0) { toast({ title: "Selecione ao menos um evento", variant: "destructive" }); return }
        setSubmitting(true)
        try {
            await axios.post("/api/user/webhooks", { name, url, description, secret, events })
            onSuccess()
        } catch (e: any) {
            toast({ title: "Erro", description: e?.response?.data?.error || "Erro ao criar webhook.", variant: "destructive" })
        } finally {
            setSubmitting(false)
        }
    }

    useEffect(() => {
        if (!open) { setName(""); setUrl(""); setDescription(""); setSecret(""); setEvents([]) }
    }, [open])

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Webhook className="h-4 w-4" /> Novo Webhook
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div>
                        <Label>Nome *</Label>
                        <Input placeholder="Ex: Notificar CRM" value={name} onChange={e => setName(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                        <Label>URL de destino *</Label>
                        <Input placeholder="https://seu-sistema.com/webhook" value={url} onChange={e => setUrl(e.target.value)} className="mt-1 font-mono text-sm" />
                    </div>
                    <div>
                        <Label>Descrição</Label>
                        <Textarea placeholder="Para que serve este webhook?" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 resize-none" />
                    </div>
                    <div>
                        <Label>Secret (para assinatura HMAC-SHA256)</Label>
                        <Input placeholder="Deixe vazio para não assinar" value={secret} onChange={e => setSecret(e.target.value)} className="mt-1 font-mono text-sm" />
                    </div>
                    <div>
                        <Label className="block mb-2">Eventos *</Label>
                        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto border rounded-lg p-3">
                            {WEBHOOK_EVENTS.map((ev) => (
                                <label key={ev.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 py-0.5">
                                    <Checkbox
                                        checked={events.includes(ev.key)}
                                        onCheckedChange={() => toggleEvent(ev.key)}
                                    />
                                    <span className="text-sm">{ev.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                        Criar Webhook
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiDocumentation (inline)
// ─────────────────────────────────────────────────────────────────────────────
function ApiDocumentation() {
    const endpoints = [
        {
            method: "GET",
            path: "/api/v1/users",
            permission: "users:read",
            description: "Lista usuários do sistema com paginação e filtros.",
            params: [
                { name: "search", type: "string", description: "Busca por nome ou e-mail" },
                { name: "take", type: "number", description: "Itens por página (máx. 100, padrão 20)" },
                { name: "skip", type: "number", description: "Offset para paginação" },
                { name: "complex_id", type: "string", description: "Filtrar por condomínio" },
            ],
            response: `{
  "data": [{ "id": "...", "name": "João Silva", "email": "joao@..." }],
  "meta": { "total": 42, "take": 20, "skip": 0, "hasNextPage": true }
}`,
        },
        {
            method: "GET",
            path: "/api/v1/meters",
            permission: "meters:read",
            description: "Lista medidores cadastrados.",
            params: [
                { name: "complex_id", type: "string", description: "Filtrar por condomínio" },
                { name: "block_id", type: "string", description: "Filtrar por bloco" },
                { name: "search", type: "string", description: "Buscar por número de registro" },
                { name: "take / skip", type: "number", description: "Paginação" },
            ],
            response: `{
  "data": [{ "id": "...", "register": "00123456", "status": "active", "apartment": {...} }],
  "meta": { "total": 15, "take": 20, "skip": 0 }
}`,
        },
        {
            method: "GET",
            path: "/api/v1/readings",
            permission: "readings:read",
            description: "Lista leituras de medidores.",
            params: [
                { name: "meter_id", type: "string", description: "Filtrar por medidor" },
                { name: "from", type: "ISO date", description: "Data inicial (ex: 2025-01-01)" },
                { name: "to", type: "ISO date", description: "Data final" },
                { name: "take / skip", type: "number", description: "Paginação" },
            ],
            response: `{
  "data": [{ "id": "...", "value": 123.45, "readingDate": "2025-05-01T...", "meter": {...} }],
  "meta": { "total": 300, "take": 20, "skip": 0 }
}`,
        },
        {
            method: "GET",
            path: "/api/v1/complexes",
            permission: "complexes:read",
            description: "Lista condomínios.",
            params: [
                { name: "search", type: "string", description: "Buscar por nome" },
                { name: "take / skip", type: "number", description: "Paginação" },
            ],
            response: `{
  "data": [{ "id": "...", "name": "Residencial X", "city": "São Paulo", "_count": { "blocks": 3 } }],
  "meta": { "total": 5, "take": 20, "skip": 0 }
}`,
        },
    ]

    const methodColor: Record<string, string> = {
        GET: "bg-blue-100 text-blue-700",
        POST: "bg-green-100 text-green-700",
        PUT: "bg-yellow-100 text-yellow-700",
        DELETE: "bg-red-100 text-red-700",
    }

    return (
        <div className="space-y-4">
            {/* Auth */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Lock className="h-4 w-4" /> Autenticação
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>Todas as rotas <code className="bg-muted px-1 rounded">/api/v1/*</code> requerem autenticação via <strong>Bearer Token</strong>.</p>
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs">
                        Authorization: Bearer ak_{"<keyId>_<secret>"}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                        <div className="border rounded p-3">
                            <p className="font-medium text-xs mb-1">401 Unauthorized</p>
                            <p className="text-xs text-muted-foreground">Token ausente, inválido ou expirado</p>
                        </div>
                        <div className="border rounded p-3">
                            <p className="font-medium text-xs mb-1">403 Forbidden</p>
                            <p className="text-xs text-muted-foreground">IP bloqueado ou permissão insuficiente</p>
                        </div>
                        <div className="border rounded p-3">
                            <p className="font-medium text-xs mb-1">429 Too Many Requests</p>
                            <p className="text-xs text-muted-foreground">Rate limit excedido</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Base URL */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4" /> Base URL</CardTitle>
                </CardHeader>
                <CardContent>
                    <code className="bg-muted px-3 py-2 rounded block text-sm font-mono">
                        {typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com"}/api/v1
                    </code>
                </CardContent>
            </Card>

            {/* Endpoints */}
            <div className="space-y-3">
                {endpoints.map((ep) => (
                    <Card key={ep.path}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${methodColor[ep.method]}`}>{ep.method}</span>
                                <code className="font-mono text-sm">{ep.path}</code>
                                <Badge variant="outline" className="text-xs"><Lock className="h-2.5 w-2.5 mr-1" />{ep.permission}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{ep.description}</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {ep.params && (
                                <div>
                                    <p className="text-xs font-semibold mb-1.5">Parâmetros (query string)</p>
                                    <div className="border rounded overflow-hidden">
                                        {ep.params.map((p) => (
                                            <div key={p.name} className="flex items-start gap-3 px-3 py-1.5 text-xs border-t first:border-0 hover:bg-muted/30">
                                                <code className="font-mono text-blue-700 w-24 flex-shrink-0">{p.name}</code>
                                                <span className="text-muted-foreground w-16 flex-shrink-0">{p.type}</span>
                                                <span>{p.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-semibold mb-1.5">Exemplo de resposta</p>
                                <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{ep.response}</pre>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Webhooks doc */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Webhooks — Payload</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>Quando um evento ocorre, o sistema envia um <code className="bg-muted px-1 rounded">POST</code> para a URL configurada:</p>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`{
  "event": "user_created",
  "timestamp": "2025-05-18T10:30:00.000Z",
  "data": { ... }
}`}</pre>
                    <p className="text-xs text-muted-foreground">Se configurado com <strong>secret</strong>, o header <code className="bg-muted px-1 rounded">X-AcquaX-Signature: sha256=...</code> é enviado para verificação HMAC-SHA256.</p>
                </CardContent>
            </Card>
        </div>
    )
}
