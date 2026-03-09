"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
    Building2, Search, RefreshCw, Loader2, Download, Send,
    CheckCircle2, Clock, AlertTriangle, FileText, Eye, MapPin,
    BarChart2, Filter, ChevronDown, ChevronRight
} from "lucide-react"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

// Brazilian states
const STATES = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
]

const STATUS_CONFIG: Record<string, {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    badgeClass: string;
}> = {
    AGENDADO: {
        label: "Agendado",
        color: "text-blue-700",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    },
    EM_LEITURA: {
        label: "Em Leitura",
        color: "text-yellow-700",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-200",
        badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200",
    },
    CONFERIDO: {
        label: "Conferido",
        color: "text-indigo-700",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-200",
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
    },
    AGUARDANDO_CONTA: {
        label: "Aguard. Conta",
        color: "text-orange-700",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
        badgeClass: "bg-orange-100 text-orange-800 border-orange-200",
    },
    FINALIZADO: {
        label: "Finalizado",
        color: "text-green-700",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        badgeClass: "bg-green-100 text-green-800 border-green-200",
    },
    ENVIADO: {
        label: "Enviado",
        color: "text-emerald-700",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-200",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    NAO_AGENDADO: {
        label: "Não Agendado",
        color: "text-gray-700",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200",
        badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
    },
}

interface CondoStatus {
    id: string
    name: string
    aliasName?: string
    state?: string
    city?: string
    totalUnits: number
    totalMeters: number
    status: string
    serviceOrderId?: string
    serviceOrderNumber?: string
    routeId?: string
    spreadsheetUrl?: string
    lastSentAt?: string
    month: number
    year: number
}

interface StateGroup {
    state: string
    condos: CondoStatus[]
    counts: Record<string, number>
}

const now = new Date()
const CURRENT_MONTH = now.getMonth() + 1
const CURRENT_YEAR = now.getFullYear()

export default function AcompanhamentoPage() {
    const { toast } = useToast()
    const [condos, setCondos] = useState<CondoStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")
    const [filterState, setFilterState] = useState("all")
    const [month, setMonth] = useState(String(CURRENT_MONTH))
    const [year, setYear] = useState(String(CURRENT_YEAR))
    const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set())

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // Load complexes
            const complexRes = await fetch("/api/(public)/user/(places)/complexes?take=500&status=Ativo")
            const complexData = complexRes.ok ? await complexRes.json() : { data: [] }
            const complexList: any[] = complexData.data || complexData || []

            // Load routes for the selected month/year
            const routeRes = await fetch(`/api/reading-routes?month=${month}&year=${year}&take=500`)
            const routeData = routeRes.ok ? await routeRes.json() : { data: [] }
            const routes: any[] = routeData.data || []

            // Load service orders for the selected month/year
            const orderRes = await fetch(`/api/service-orders?month=${month}&year=${year}&take=500`)
            const orderData = orderRes.ok ? await orderRes.json() : { data: [] }
            const orders: any[] = orderData.data || []

            // Build condo status map
            const routeByComplex: Record<string, any> = {}
            routes.forEach((r: any) => {
                if (!routeByComplex[r.complexId]) {
                    routeByComplex[r.complexId] = r
                }
            })

            const orderByRoute: Record<string, any> = {}
            orders.forEach((o: any) => {
                if (o.readingRouteId && !orderByRoute[o.readingRouteId]) {
                    orderByRoute[o.readingRouteId] = o
                }
            })

            const result: CondoStatus[] = complexList.map((complex: any) => {
                const route = routeByComplex[complex.id]
                const order = route ? orderByRoute[route.id] : null

                let status = "NAO_AGENDADO"
                if (route) {
                    switch (route.status) {
                        case "DRAFT": status = "AGENDADO"; break
                        case "ACTIVE": status = "AGENDADO"; break
                        case "IN_PROGRESS": status = "EM_LEITURA"; break
                        case "COMPLETED":
                            if (route.sentAt) status = "ENVIADO"
                            else if (route.spreadsheetUrl) status = "FINALIZADO"
                            else if (route.accountUploaded) status = "CONFERIDO"
                            else status = "AGUARDANDO_CONTA"
                            break
                        case "SENT": status = "ENVIADO"; break
                        default: status = "AGENDADO"
                    }
                }

                return {
                    id: complex.id,
                    name: complex.socialName || complex.name,
                    aliasName: complex.aliasName,
                    state: complex.state || "SP",
                    city: complex.city,
                    totalUnits: complex._count?.apartments || 0,
                    totalMeters: complex._count?.meters || 0,
                    status,
                    serviceOrderId: order?.id,
                    serviceOrderNumber: order?.orderNumber,
                    routeId: route?.id,
                    spreadsheetUrl: route?.spreadsheetUrl,
                    lastSentAt: route?.sentAt,
                    month: parseInt(month),
                    year: parseInt(year),
                }
            })

            setCondos(result)

            // Auto-expand all states
            const states = new Set(result.map(c => c.state || "SP"))
            setExpandedStates(states)
        } catch (err) {
            toast({ title: "Erro", description: "Não foi possível carregar os dados", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [month, year, toast])

    useEffect(() => { load() }, [load])

    const filtered = condos.filter(c => {
        if (filterStatus !== "all" && c.status !== filterStatus) return false
        if (filterState !== "all" && c.state !== filterState) return false
        if (search) {
            const q = search.toLowerCase()
            if (!(c.name.toLowerCase().includes(q) || (c.aliasName || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q))) return false
        }
        return true
    })

    // Group by state
    const stateGroups: StateGroup[] = []
    const stateMap: Record<string, CondoStatus[]> = {}
    filtered.forEach(c => {
        const s = c.state || "SP"
        if (!stateMap[s]) stateMap[s] = []
        stateMap[s].push(c)
    })
    Object.entries(stateMap).sort(([a], [b]) => a.localeCompare(b)).forEach(([state, condos]) => {
        const counts: Record<string, number> = {}
        condos.forEach(c => {
            counts[c.status] = (counts[c.status] || 0) + 1
        })
        stateGroups.push({ state, condos, counts })
    })

    // Summary counts
    const statusCounts: Record<string, number> = {}
    condos.forEach(c => {
        statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
    })

    const toggleState = (state: string) => {
        setExpandedStates(prev => {
            const next = new Set(prev)
            if (next.has(state)) next.delete(state)
            else next.add(state)
            return next
        })
    }

    const handleDownload = (condo: CondoStatus) => {
        if (condo.spreadsheetUrl) {
            window.open(condo.spreadsheetUrl, "_blank")
        } else {
            toast({ title: "Aviso", description: "Nenhum arquivo disponível para download.", variant: "destructive" })
        }
    }

    const handleResend = async (condo: CondoStatus) => {
        toast({ title: "Reenvio iniciado", description: `Reenvio da planilha para ${condo.name} em processamento.` })
    }

    return (
        <div className="space-y-6 w-full p-4 md:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BarChart2 className="h-6 w-6" />
                        Acompanhamento
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Situação dos condomínios por estado — {MONTHS[parseInt(month) - 1]} / {year}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTHS.map((m, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-24">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Status summary pills */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterStatus("all")}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filterStatus === "all" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                >
                    Todos ({condos.length})
                </button>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const count = statusCounts[key] || 0
                    if (count === 0) return null
                    return (
                        <button
                            key={key}
                            onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filterStatus === key ? cfg.badgeClass + " ring-2 ring-offset-1 ring-current" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                        >
                            {cfg.label} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome ou cidade..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <Select value={filterState} onValueChange={setFilterState}>
                    <SelectTrigger className="w-full sm:w-36">
                        <SelectValue placeholder="Todos os estados" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os estados</SelectItem>
                        {STATES.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <Building2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p>Nenhum condomínio encontrado para os filtros selecionados.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {stateGroups.map(group => (
                        <Card key={group.state} className="overflow-hidden">
                            {/* State header */}
                            <button
                                className="w-full text-left"
                                onClick={() => toggleState(group.state)}
                            >
                                <CardHeader className="py-3 px-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {expandedStates.has(group.state)
                                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            }
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-semibold">{group.state}</span>
                                                <span className="text-sm text-muted-foreground">
                                                    ({group.condos.length} condomínio{group.condos.length !== 1 ? "s" : ""})
                                                </span>
                                            </div>
                                        </div>
                                        {/* Mini status pills */}
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(group.counts).map(([status, count]) => {
                                                const cfg = STATUS_CONFIG[status]
                                                if (!cfg) return null
                                                return (
                                                    <span
                                                        key={status}
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badgeClass}`}
                                                    >
                                                        {cfg.label}: {count}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </CardHeader>
                            </button>

                            {/* Condo list */}
                            {expandedStates.has(group.state) && (
                                <CardContent className="p-0">
                                    <div className="divide-y">
                                        {group.condos.map(condo => {
                                            const cfg = STATUS_CONFIG[condo.status] || STATUS_CONFIG.NAO_AGENDADO
                                            const canDownload = condo.status === "FINALIZADO" || condo.status === "ENVIADO"
                                            const canResend = condo.status === "ENVIADO"
                                            return (
                                                <div
                                                    key={condo.id}
                                                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${cfg.bgColor}`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.color.replace("text-", "bg-")}`} />
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-sm truncate">
                                                                {condo.aliasName || condo.name}
                                                            </div>
                                                            {condo.city && (
                                                                <div className="text-xs text-muted-foreground">{condo.city}</div>
                                                            )}
                                                            {condo.serviceOrderNumber && (
                                                                <div className="text-xs text-muted-foreground font-mono">
                                                                    OS: {condo.serviceOrderNumber}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badgeClass}`}>
                                                            {cfg.label}
                                                        </span>
                                                        {condo.serviceOrderId && (
                                                            <a
                                                                href={`/service-orders/${condo.serviceOrderId}`}
                                                                className="p-1 rounded hover:bg-white/80 transition-colors"
                                                                title="Ver OS"
                                                            >
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            </a>
                                                        )}
                                                        {canDownload && (
                                                            <button
                                                                onClick={() => handleDownload(condo)}
                                                                className="p-1 rounded hover:bg-white/80 transition-colors"
                                                                title="Baixar planilha"
                                                            >
                                                                <Download className="h-4 w-4 text-green-600" />
                                                            </button>
                                                        )}
                                                        {canResend && (
                                                            <button
                                                                onClick={() => handleResend(condo)}
                                                                className="p-1 rounded hover:bg-white/80 transition-colors"
                                                                title="Reenviar"
                                                            >
                                                                <Send className="h-4 w-4 text-blue-600" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
