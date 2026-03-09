"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { FileText, Search, Loader2, Eye, CheckCircle2, Clock, XCircle, AlertCircle, Route } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
    PENDING: { label: "Pendente", variant: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
    IN_PROGRESS: { label: "Em Andamento", variant: "warning", icon: <Clock className="h-3 w-3" /> },
    COMPLETED: { label: "Concluída", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
    CANCELLED: { label: "Cancelada", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
}

interface ServiceOrder {
    id: string
    orderNumber: string
    status: string
    month: number
    year: number
    complexSocialName?: string
    assignedToUser?: { id: string; name: string }
    plannedDate?: string
    completedAt?: string
    readingRoute?: { id: string; name: string }
    _count?: { serviceOrderItems: number }
    serviceOrderItems?: Array<{ status: string }>
    createdAt: string
}

export default function ServiceOrdersPage() {
    const [orders, setOrders] = useState<ServiceOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState("")
    const [search, setSearch] = useState("")
    const { toast } = useToast()

    const fetchOrders = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filterStatus) params.set("status", filterStatus)
            const res = await fetch(`/api/service-orders?${params}`)
            if (!res.ok) throw new Error("Erro ao buscar ordens de serviço")
            const data = await res.json()
            setOrders(data.data || [])
        } catch (err) {
            toast({ title: "Erro", description: "Não foi possível carregar as ordens de serviço", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [filterStatus, toast])

    useEffect(() => { fetchOrders() }, [fetchOrders])

    const filteredOrders = orders.filter(o =>
        !search ||
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        (o.complexSocialName || "").toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <FileText className="h-6 w-6" />
                            Ordens de Serviço
                        </CardTitle>
                        <CardDescription>
                            Ordens de serviço geradas pelas rotas de leitura. Clique em &quot;Ver&quot; para registrar leituras e coletar assinaturas.
                        </CardDescription>
                    </div>
                    <Link href="/reading-routes">
                        <Button variant="outline">
                            <Route className="mr-2 h-4 w-4" />
                            Gerenciar Rotas
                        </Button>
                    </Link>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por número ou condomínio..."
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
                                <SelectItem value="">Todos os status</SelectItem>
                                {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                                    <SelectItem key={value} value={value}>{cfg.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Número OS</TableHead>
                                        <TableHead>Condomínio</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead>Leiturista</TableHead>
                                        <TableHead>Progresso</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Rota</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                Nenhuma ordem de serviço encontrada.
                                                <br />
                                                <Link href="/reading-routes" className="text-blue-600 hover:underline">
                                                    Crie uma rota de leitura para gerar ordens de serviço
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredOrders.map(order => {
                                            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING
                                            const items = order.serviceOrderItems || []
                                            const readCount = items.filter(i => i.status === "READ").length
                                            const totalCount = items.length
                                            const pct = totalCount > 0 ? Math.round(readCount / totalCount * 100) : 0

                                            return (
                                                <TableRow key={order.id}>
                                                    <TableCell>
                                                        <div className="font-mono text-sm font-medium">{order.orderNumber}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{order.complexSocialName || "-"}</TableCell>
                                                    <TableCell>{MONTHS[order.month - 1]} / {order.year}</TableCell>
                                                    <TableCell>
                                                        {order.assignedToUser?.name || (
                                                            <span className="text-muted-foreground text-sm">Não atribuído</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {totalCount > 0 ? (
                                                            <div className="space-y-1">
                                                                <div className="text-xs text-muted-foreground">
                                                                    {readCount}/{totalCount} leituras
                                                                </div>
                                                                <div className="h-1.5 w-20 bg-gray-200 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-green-500 rounded-full"
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={cfg.variant as any} className="flex items-center gap-1 w-fit">
                                                            {cfg.icon}
                                                            {cfg.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {order.readingRoute ? (
                                                            <Link
                                                                href={`/reading-routes/${order.readingRoute.id}`}
                                                                className="text-xs text-blue-600 hover:underline"
                                                            >
                                                                {order.readingRoute.name}
                                                            </Link>
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/service-orders/${order.id}`}>
                                                            <Button variant="outline" size="sm">
                                                                <Eye className="h-3 w-3 mr-1" />
                                                                Ver OS
                                                            </Button>
                                                        </Link>
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
        </div>
    )
}
