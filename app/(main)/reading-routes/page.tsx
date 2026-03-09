"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
    MapPin, Plus, Search, Loader2, Eye, Trash2, Route,
    Calendar, User, CheckCircle2, Clock, XCircle, AlertCircle
} from "lucide-react"
import Link from "next/link"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const CURRENT_YEAR = new Date().getFullYear()

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; icon: React.ReactNode }> = {
    DRAFT: { label: "Rascunho", variant: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
    ACTIVE: { label: "Ativa", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
    IN_PROGRESS: { label: "Em Andamento", variant: "warning", icon: <Clock className="h-3 w-3" /> },
    COMPLETED: { label: "Concluída", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
    CANCELLED: { label: "Cancelada", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
}

interface ReadingRoute {
    id: string
    name: string
    description?: string
    month: number
    year: number
    status: string
    complexId: string
    complexSocialName?: string
    complexName?: string
    assignedToUser?: { id: string; name: string; email: string }
    plannedStartDate?: string
    serviceOrders?: Array<{ id: string; orderNumber: string; status: string }>
    createdAt: string
}

interface Complex {
    id: string
    socialName: string
    aliasName?: string
}

interface User {
    id: string
    name: string
    email: string
}

export default function ReadingRoutesPage() {
    const [routes, setRoutes] = useState<ReadingRoute[]>([])
    const [loading, setLoading] = useState(true)
    const [complexes, setComplexes] = useState<Complex[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")
    const [creating, setCreating] = useState(false)
    const { toast } = useToast()

    const [form, setForm] = useState({
        name: "",
        description: "",
        month: (new Date().getMonth() + 1).toString(),
        year: CURRENT_YEAR.toString(),
        complexId: "none",
        assignedToUserId: "none",
        plannedStartDate: "",
    })

    const fetchRoutes = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (search) params.set("search", search)
            if (filterStatus && filterStatus !== "all") params.set("status", filterStatus)
            const res = await fetch(`/api/reading-routes?${params}`)
            if (!res.ok) throw new Error("Erro ao buscar rotas")
            const data = await res.json()
            setRoutes(data.data || [])
        } catch (err) {
            toast({ title: "Erro", description: "Não foi possível carregar as rotas", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [search, filterStatus, toast])

    const fetchComplexes = useCallback(async () => {
        try {
            const res = await fetch("/api/(public)/user/(places)/complexes?take=500")
            if (res.ok) {
                const data = await res.json()
                const list = data.data || data || []
                // Filter active only client-side to avoid URL encoding issues
                setComplexes(list.filter((c: any) => !c.status || c.status === 'Ativo'))
            }
        } catch { /* ignore */ }
    }, [])

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/(public)/user/users?take=200")
            if (res.ok) {
                const data = await res.json()
                setUsers(data.data || data || [])
            }
        } catch { /* ignore */ }
    }, [])

    useEffect(() => { fetchRoutes() }, [fetchRoutes])
    useEffect(() => { fetchComplexes(); fetchUsers() }, [fetchComplexes, fetchUsers])

    // Auto-generate route name when complex/month/year changes
    useEffect(() => {
        const complex = complexes.find(c => c.id === form.complexId && form.complexId !== 'none')
        if (complex && form.month && form.year) {
            const monthName = MONTHS[parseInt(form.month) - 1]
            const name = `Rota ${monthName} ${form.year} - ${complex.aliasName || complex.socialName}`
            setForm(prev => ({ ...prev, name }))
        }
    }, [form.complexId, form.month, form.year, complexes])

    const handleCreate = async () => {
        if (!form.complexId || form.complexId === 'none' || !form.month || !form.year) {
            toast({ title: "Atenção", description: "Preencha todos os campos obrigatórios", variant: "destructive" })
            return
        }
        setCreating(true)
        try {
            const res = await fetch("/api/reading-routes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    month: parseInt(form.month),
                    year: parseInt(form.year),
                    assignedToUserId: (form.assignedToUserId && form.assignedToUserId !== "none") ? form.assignedToUserId : null,
                    plannedStartDate: form.plannedStartDate || undefined,
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || "Erro ao criar rota")
            }
            const data = await res.json()
            toast({
                title: "Rota criada!",
                description: `Ordem de serviço ${data.serviceOrder?.orderNumber} gerada automaticamente.`,
            })
            setIsModalOpen(false)
            setForm({
                name: "", description: "", month: (new Date().getMonth() + 1).toString(),
                year: CURRENT_YEAR.toString(), complexId: "none", assignedToUserId: "none", plannedStartDate: ""
            })
            fetchRoutes()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm("Tem certeza que deseja excluir esta rota?")) return
        try {
            const res = await fetch(`/api/reading-routes/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error("Erro ao excluir rota")
            toast({ title: "Rota excluída", description: "A rota foi excluída com sucesso." })
            fetchRoutes()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        }
    }

    const statusCfg = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <Route className="h-6 w-6" />
                            Rotas de Leitura
                        </CardTitle>
                        <CardDescription>
                            Crie e gerencie rotas de leitura. Cada rota gera automaticamente uma Ordem de Serviço.
                        </CardDescription>
                    </div>
                    <Button onClick={() => setIsModalOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Rota
                    </Button>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou condomínio..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="Todos os status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os status</SelectItem>
                                {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                                    <SelectItem key={value} value={value}>{cfg.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Rota</TableHead>
                                        <TableHead>Condomínio</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead>Leiturista</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>OS</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {routes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                Nenhuma rota encontrada. Clique em &quot;Nova Rota&quot; para começar.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        routes.map(route => {
                                            const cfg = statusCfg(route.status)
                                            return (
                                                <TableRow key={route.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Route className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                <div>{route.name}</div>
                                                                {route.description && (
                                                                    <div className="text-xs text-muted-foreground">{route.description}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="h-3 w-3 text-muted-foreground" />
                                                            <span>{route.complexSocialName || "-"}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            <span>{MONTHS[route.month - 1]} / {route.year}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {route.assignedToUser ? (
                                                            <div className="flex items-center gap-1">
                                                                <User className="h-3 w-3 text-muted-foreground" />
                                                                <span className="text-sm">{route.assignedToUser.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">Não atribuído</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={cfg.variant as any} className="flex items-center gap-1 w-fit">
                                                            {cfg.icon}
                                                            {cfg.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {route.serviceOrders && route.serviceOrders.length > 0 ? (
                                                            <div className="flex flex-col gap-1">
                                                                {route.serviceOrders.map(so => (
                                                                    <Link
                                                                        key={so.id}
                                                                        href={`/service-orders/${so.id}`}
                                                                        className="text-xs text-blue-600 hover:underline"
                                                                    >
                                                                        {so.orderNumber}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Link href={`/reading-routes/${route.id}`}>
                                                                <Button variant="outline" size="sm">
                                                                    <Eye className="h-3 w-3 mr-1" />
                                                                    Ver
                                                                </Button>
                                                            </Link>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() => handleDelete(route.id)}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Route Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Route className="h-5 w-5" />
                            Nova Rota de Leitura
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="month">Mês *</Label>
                                <Select
                                    value={form.month}
                                    onValueChange={v => setForm(prev => ({ ...prev, month: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o mês" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MONTHS.map((m, i) => (
                                            <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="year">Ano *</Label>
                                <Select
                                    value={form.year}
                                    onValueChange={v => setForm(prev => ({ ...prev, year: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Ano" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="complexId">Condomínio *</Label>
                            <Select
                                value={form.complexId}
                                onValueChange={v => setForm(prev => ({ ...prev, complexId: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o condomínio" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecione o condomínio</SelectItem>
                                    {complexes.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.socialName}{c.aliasName ? ` (${c.aliasName})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Nome da Rota</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Gerado automaticamente"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="assignedToUserId">Leiturista Responsável</Label>
                            <Select
                                value={form.assignedToUserId}
                                onValueChange={v => setForm(prev => ({ ...prev, assignedToUserId: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o leiturista" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Não atribuído</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="plannedStartDate">Data Planejada de Início</Label>
                            <Input
                                id="plannedStartDate"
                                type="date"
                                value={form.plannedStartDate}
                                onChange={e => setForm(prev => ({ ...prev, plannedStartDate: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Observações</Label>
                            <Input
                                id="description"
                                value={form.description}
                                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Observações opcionais"
                            />
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950 rounded-md p-3 text-sm text-blue-700 dark:text-blue-300">
                            <strong>ℹ️ Automaticamente:</strong> Ao criar a rota, uma Ordem de Serviço será gerada com
                            todos os apartamentos e medidores do condomínio selecionado. O leiturista poderá assinar
                            ao finalizar, e o síndico também será solicitado a assinar.
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreate} disabled={creating}>
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar Rota e Gerar OS
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
