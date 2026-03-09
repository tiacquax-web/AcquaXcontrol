"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
    ArrowLeft, Route, Building2, Calendar, User, FileText,
    Loader2, CheckCircle2, Clock, XCircle, AlertCircle, Eye
} from "lucide-react"
import Link from "next/link"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const ROUTE_STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
    DRAFT: { label: "Rascunho", variant: "secondary" },
    ACTIVE: { label: "Ativa", variant: "default" },
    IN_PROGRESS: { label: "Em Andamento", variant: "warning" },
    COMPLETED: { label: "Concluída", variant: "success" },
    CANCELLED: { label: "Cancelada", variant: "destructive" },
}

const SO_STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
    PENDING: { label: "Pendente", variant: "secondary" },
    IN_PROGRESS: { label: "Em Andamento", variant: "warning" },
    COMPLETED: { label: "Concluída", variant: "success" },
    CANCELLED: { label: "Cancelada", variant: "destructive" },
}

interface ServiceOrderSummary {
    id: string
    orderNumber: string
    status: string
    serviceOrderItems?: Array<{ status: string }>
}

interface RouteDetail {
    id: string
    name: string
    description?: string
    month: number
    year: number
    status: string
    complexSocialName?: string
    complexName?: string
    companyName?: string
    assignedToUser?: { id: string; name: string; email: string }
    complex?: { id: string; socialName: string; aliasName?: string; dealershipName?: string; billingType?: string }
    serviceOrders: ServiceOrderSummary[]
    createdAt: string
    plannedStartDate?: string
    plannedEndDate?: string
    startedAt?: string
    completedAt?: string
}

export default function ReadingRouteDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { toast } = useToast()
    const id = params?.id as string

    const [route, setRoute] = useState<RouteDetail | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchRoute = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/reading-routes/${id}`)
            if (!res.ok) throw new Error("Rota não encontrada")
            const data = await res.json()
            setRoute(data)
        } catch (err) {
            toast({ title: "Erro", description: "Não foi possível carregar a rota", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [id, toast])

    useEffect(() => { fetchRoute() }, [fetchRoute])

    const activateRoute = async () => {
        try {
            const res = await fetch(`/api/reading-routes/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "ACTIVE" })
            })
            if (!res.ok) throw new Error("Erro ao ativar rota")
            toast({ title: "Rota ativada!", description: "A rota está agora disponível para o leiturista." })
            fetchRoute()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!route) {
        return (
            <div className="p-6">
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        Rota não encontrada.
                        <br />
                        <Button variant="link" onClick={() => router.back()}>Voltar</Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const routeCfg = ROUTE_STATUS_CONFIG[route.status] || ROUTE_STATUS_CONFIG.DRAFT

    return (
        <div className="space-y-6 w-full p-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Route className="h-6 w-6" />
                        {route.name}
                    </h1>
                    <p className="text-muted-foreground">
                        {route.complexSocialName} — {MONTHS[route.month - 1]} / {route.year}
                    </p>
                </div>
                <Badge variant={routeCfg.variant as any}>{routeCfg.label}</Badge>
                {route.status === "DRAFT" && (
                    <Button onClick={activateRoute} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Ativar Rota
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Condomínio
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div>
                            <span className="text-muted-foreground text-sm">Nome: </span>
                            <span className="font-medium">{route.complex?.socialName || route.complexSocialName || "-"}</span>
                        </div>
                        {route.complex?.dealershipName && (
                            <div>
                                <span className="text-muted-foreground text-sm">Concessionária: </span>
                                <span className="font-medium">{route.complex.dealershipName}</span>
                            </div>
                        )}
                        {route.complex?.billingType && (
                            <div>
                                <span className="text-muted-foreground text-sm">Tipo de Faturamento: </span>
                                <span className="font-medium">{route.complex.billingType}</span>
                            </div>
                        )}
                        {route.companyName && (
                            <div>
                                <span className="text-muted-foreground text-sm">Administradora: </span>
                                <span className="font-medium">{route.companyName}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Informações
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div>
                            <span className="text-muted-foreground text-sm">Período: </span>
                            <span className="font-medium">{MONTHS[route.month - 1]} / {route.year}</span>
                        </div>
                        {route.assignedToUser && (
                            <div>
                                <span className="text-muted-foreground text-sm">Leiturista: </span>
                                <span className="font-medium">{route.assignedToUser.name}</span>
                            </div>
                        )}
                        {route.plannedStartDate && (
                            <div>
                                <span className="text-muted-foreground text-sm">Início planejado: </span>
                                <span className="font-medium">
                                    {new Date(route.plannedStartDate).toLocaleDateString("pt-BR")}
                                </span>
                            </div>
                        )}
                        {route.description && (
                            <div>
                                <span className="text-muted-foreground text-sm">Observações: </span>
                                <span className="font-medium">{route.description}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Service Orders */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Ordens de Serviço
                    </CardTitle>
                    <CardDescription>
                        Ordens de serviço geradas para esta rota
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {route.serviceOrders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhuma ordem de serviço gerada para esta rota.
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Número OS</TableHead>
                                        <TableHead>Progresso</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {route.serviceOrders.map(so => {
                                        const soCfg = SO_STATUS_CONFIG[so.status] || SO_STATUS_CONFIG.PENDING
                                        const items = so.serviceOrderItems || []
                                        const readCount = items.filter(i => i.status === "READ").length
                                        const totalCount = items.length
                                        const pct = totalCount > 0 ? Math.round(readCount / totalCount * 100) : 0

                                        return (
                                            <TableRow key={so.id}>
                                                <TableCell>
                                                    <span className="font-mono font-medium">{so.orderNumber}</span>
                                                </TableCell>
                                                <TableCell>
                                                    {totalCount > 0 ? (
                                                        <div className="space-y-1">
                                                            <div className="text-xs text-muted-foreground">
                                                                {readCount}/{totalCount} leituras
                                                            </div>
                                                            <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
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
                                                    <Badge variant={soCfg.variant as any}>{soCfg.label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Link href={`/service-orders/${so.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            <Eye className="h-3 w-3 mr-1" />
                                                            Abrir OS
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
