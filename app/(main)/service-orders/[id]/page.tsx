"use client"

import React, { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
    ArrowLeft, CheckCircle2, Clock, FileText, Pen, Camera, Upload,
    User, Building2, Calendar, Package, Loader2, XCircle, AlertCircle,
    ImageIcon
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Pendente", color: "bg-gray-100 text-gray-700" },
    READ: { label: "Lido", color: "bg-green-100 text-green-700" },
    SKIPPED: { label: "Pulado", color: "bg-yellow-100 text-yellow-700" },
    ERROR: { label: "Erro", color: "bg-red-100 text-red-700" },
}

const ORDER_STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
    PENDING: { label: "Pendente", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    IN_PROGRESS: { label: "Em Andamento", variant: "warning", icon: <Clock className="h-3 w-3" /> },
    COMPLETED: { label: "Concluída", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
    CANCELLED: { label: "Cancelada", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
}

interface ServiceOrderItem {
    id: string
    apartmentName?: string
    blockName?: string
    meterRegister?: string
    previousReading?: number
    currentReading?: number
    consumption?: number
    photoUrl?: string
    photoSource?: string
    status: string
    skipReason?: string
    sortOrder: number
}

interface ServiceOrder {
    id: string
    orderNumber: string
    status: string
    month: number
    year: number
    complexId: string
    complexSocialName?: string
    complexName?: string
    companyName?: string
    assignedToUser?: { id: string; name: string; email: string }
    plannedDate?: string
    startedAt?: string
    completedAt?: string
    notes?: string
    leiturnistaSignature?: string
    syndicSignature?: string
    syndicName?: string
    syndicRole?: string
    serviceOrderItems: ServiceOrderItem[]
    readingRoute?: { id: string; name: string; status: string }
    createdAt: string
}

export default function ServiceOrderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { toast } = useToast()
    const id = params?.id as string

    const [order, setOrder] = useState<ServiceOrder | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState("readings")

    // Signature dialog state
    const [signatureDialog, setSignatureDialog] = useState<{
        open: boolean
        type: "leiturista" | "syndic" | null
    }>({ open: false, type: null })
    const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [syndicName, setSyndicName] = useState("")
    const [syndicRole, setSyndicRole] = useState("Síndico")

    // Reading edit dialog
    const [readingDialog, setReadingDialog] = useState<{
        open: boolean
        item: ServiceOrderItem | null
    }>({ open: false, item: null })
    const [currentReadingValue, setCurrentReadingValue] = useState("")
    const [photoFile, setPhotoFile] = useState<File | null>(null)
    const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    const photoInputRef = useRef<HTMLInputElement>(null)

    const fetchOrder = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/service-orders/${id}`)
            if (!res.ok) throw new Error("Ordem não encontrada")
            const data = await res.json()
            setOrder(data)
        } catch (err) {
            toast({ title: "Erro", description: "Não foi possível carregar a ordem de serviço", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [id, toast])

    useEffect(() => { fetchOrder() }, [fetchOrder])

    // ---- Signature canvas helpers ----
    const getCanvasPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect()
        if ("touches" in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top,
            }
        }
        return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
    }

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        const canvas = signatureCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const pos = getCanvasPos(e, canvas)
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        setIsDrawing(true)
    }

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        if (!isDrawing) return
        const canvas = signatureCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const pos = getCanvasPos(e, canvas)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = "#1a1a1a"
        ctx.lineWidth = 2
        ctx.lineCap = "round"
        ctx.stroke()
    }

    const stopDrawing = () => setIsDrawing(false)

    const clearSignature = () => {
        const canvas = signatureCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const saveSignature = async () => {
        const canvas = signatureCanvasRef.current
        if (!canvas) return
        const dataUrl = canvas.toDataURL("image/png")

        setSaving(true)
        try {
            const updateData: any = {}
            if (signatureDialog.type === "leiturista") {
                updateData.leiturnistaSignature = dataUrl
            } else if (signatureDialog.type === "syndic") {
                updateData.syndicSignature = dataUrl
                updateData.syndicName = syndicName
                updateData.syndicRole = syndicRole
            }

            const res = await fetch(`/api/service-orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updateData)
            })
            if (!res.ok) throw new Error("Erro ao salvar assinatura")

            toast({ title: "Assinatura salva!", description: "A assinatura foi registrada com sucesso." })
            setSignatureDialog({ open: false, type: null })
            fetchOrder()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    // ---- Photo handling ----
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setPhotoFile(file)
        const reader = new FileReader()
        reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
        reader.readAsDataURL(file)
    }

    const openReadingDialog = (item: ServiceOrderItem) => {
        setReadingDialog({ open: true, item })
        setCurrentReadingValue(item.currentReading?.toString() || "")
        setPhotoFile(null)
        setPhotoPreview(item.photoUrl || null)
    }

    const saveReading = async () => {
        if (!readingDialog.item) return
        setSaving(true)
        try {
            const item = readingDialog.item
            const currentReading = parseFloat(currentReadingValue)
            const consumption = item.previousReading !== undefined && !isNaN(currentReading)
                ? currentReading - item.previousReading
                : undefined

            let photoUrl = item.photoUrl
            let photoSource = item.photoSource

            // If a new photo file was selected, convert to base64 (for demo; in production use cloud storage)
            if (photoFile && photoPreview) {
                photoUrl = photoPreview
                photoSource = "UPLOAD"
            }

            const res = await fetch(`/api/service-orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemUpdates: [{
                        id: item.id,
                        currentReading: isNaN(currentReading) ? undefined : currentReading,
                        consumption,
                        photoUrl,
                        photoSource,
                        photoUploadedAt: photoFile ? new Date().toISOString() : undefined,
                        status: isNaN(currentReading) ? "PENDING" : "READ",
                        readAt: isNaN(currentReading) ? undefined : new Date().toISOString(),
                    }]
                })
            })
            if (!res.ok) throw new Error("Erro ao salvar leitura")

            toast({ title: "Leitura salva!", description: `Unidade ${item.apartmentName} atualizada.` })
            setReadingDialog({ open: false, item: null })
            fetchOrder()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const completeOrder = async () => {
        if (!window.confirm("Confirmar conclusão da ordem de serviço? Isso irá finalizar a rota.")) return
        setSaving(true)
        try {
            const res = await fetch(`/api/service-orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "COMPLETED" })
            })
            if (!res.ok) throw new Error("Erro ao finalizar OS")
            toast({ title: "OS Concluída!", description: "A ordem de serviço foi finalizada com sucesso." })
            fetchOrder()
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!order) {
        return (
            <div className="p-6">
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        Ordem de serviço não encontrada.
                        <br />
                        <Button variant="link" onClick={() => router.back()}>Voltar</Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const statusCfg = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.PENDING
    const readItems = order.serviceOrderItems.filter(i => i.status === "READ")
    const totalItems = order.serviceOrderItems.length
    const progress = totalItems > 0 ? Math.round((readItems.length / totalItems) * 100) : 0

    return (
        <div className="space-y-6 w-full p-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        {order.orderNumber}
                    </h1>
                    <p className="text-muted-foreground">{order.complexSocialName} — {MONTHS[order.month - 1]} / {order.year}</p>
                </div>
                <Badge variant={statusCfg.variant as any} className="flex items-center gap-1">
                    {statusCfg.icon}
                    {statusCfg.label}
                </Badge>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{totalItems}</div>
                        <div className="text-sm text-muted-foreground">Total de unidades</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600">{readItems.length}</div>
                        <div className="text-sm text-muted-foreground">Leituras realizadas</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-yellow-600">
                            {order.serviceOrderItems.filter(i => i.status === "PENDING").length}
                        </div>
                        <div className="text-sm text-muted-foreground">Pendentes</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{progress}%</div>
                        <div className="text-sm text-muted-foreground">Progresso</div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="readings">
                        <Package className="mr-2 h-4 w-4" />
                        Leituras ({totalItems})
                    </TabsTrigger>
                    <TabsTrigger value="info">
                        <Building2 className="mr-2 h-4 w-4" />
                        Informações
                    </TabsTrigger>
                    <TabsTrigger value="signatures">
                        <Pen className="mr-2 h-4 w-4" />
                        Assinaturas
                    </TabsTrigger>
                </TabsList>

                {/* READINGS TAB */}
                <TabsContent value="readings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Leituras dos Medidores</CardTitle>
                            <CardDescription>
                                Clique em uma linha para registrar ou editar a leitura. Você pode tirar uma foto ou fazer upload.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Unidade</TableHead>
                                            <TableHead>Medidor</TableHead>
                                            <TableHead className="text-right">Leitura Ant.</TableHead>
                                            <TableHead className="text-right">Leitura Atual</TableHead>
                                            <TableHead className="text-right">Consumo (m³)</TableHead>
                                            <TableHead>Foto</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {order.serviceOrderItems.map(item => {
                                            const itemCfg = ITEM_STATUS_CONFIG[item.status] || ITEM_STATUS_CONFIG.PENDING
                                            return (
                                                <TableRow
                                                    key={item.id}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => openReadingDialog(item)}
                                                >
                                                    <TableCell>
                                                        <div className="font-medium">{item.apartmentName}</div>
                                                        {item.blockName && (
                                                            <div className="text-xs text-muted-foreground">{item.blockName}</div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                                            {item.meterRegister || "-"}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell className="text-right text-muted-foreground">
                                                        {item.previousReading?.toFixed(3) || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {item.currentReading?.toFixed(3) || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {item.consumption !== undefined && item.consumption !== null
                                                            ? item.consumption.toFixed(3)
                                                            : "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.photoUrl ? (
                                                            <div className="flex items-center gap-1">
                                                                <ImageIcon className="h-4 w-4 text-green-600" />
                                                                <span className="text-xs text-green-600">
                                                                    {item.photoSource === "UPLOAD" ? "Upload" : "Câmera"}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">Sem foto</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${itemCfg.color}`}>
                                                            {itemCfg.label}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Complete button */}
                            {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
                                <div className="mt-4 flex justify-end">
                                    <Button
                                        onClick={completeOrder}
                                        disabled={saving || readItems.length === 0}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Finalizar Ordem de Serviço
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* INFO TAB */}
                <TabsContent value="info">
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações da Ordem de Serviço</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground text-xs">Número da OS</Label>
                                    <div className="font-medium">{order.orderNumber}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Período</Label>
                                    <div className="font-medium">{MONTHS[order.month - 1]} / {order.year}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Condomínio</Label>
                                    <div className="font-medium">{order.complexSocialName || "-"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Empresa</Label>
                                    <div className="font-medium">{order.companyName || "-"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Leiturista</Label>
                                    <div className="font-medium">{order.assignedToUser?.name || "Não atribuído"}</div>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">Rota Origem</Label>
                                    <div className="font-medium">{order.readingRoute?.name || "-"}</div>
                                </div>
                                {order.plannedDate && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Data Planejada</Label>
                                        <div className="font-medium">
                                            {format(new Date(order.plannedDate), "dd/MM/yyyy", { locale: ptBR })}
                                        </div>
                                    </div>
                                )}
                                {order.completedAt && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs">Concluída em</Label>
                                        <div className="font-medium">
                                            {format(new Date(order.completedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {order.notes && (
                                <div>
                                    <Label className="text-muted-foreground text-xs">Observações</Label>
                                    <div className="mt-1 p-3 bg-muted rounded-md text-sm">{order.notes}</div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* SIGNATURES TAB */}
                <TabsContent value="signatures">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Leiturista Signature */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <User className="h-4 w-4" />
                                    Assinatura do Leiturista
                                </CardTitle>
                                <CardDescription>
                                    {order.assignedToUser?.name || "Leiturista responsável"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {order.leiturnistaSignature ? (
                                    <div className="space-y-3">
                                        <div className="border rounded-md overflow-hidden bg-white">
                                            <img
                                                src={order.leiturnistaSignature}
                                                alt="Assinatura do leiturista"
                                                className="w-full h-32 object-contain"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Assinatura registrada
                                        </div>
                                        {order.status !== "COMPLETED" && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSignatureDialog({ open: true, type: "leiturista" })}
                                            >
                                                <Pen className="mr-2 h-3 w-3" />
                                                Refazer assinatura
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="border-2 border-dashed rounded-md h-32 flex items-center justify-center text-muted-foreground">
                                            <div className="text-center">
                                                <Pen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">Sem assinatura</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => setSignatureDialog({ open: true, type: "leiturista" })}
                                            className="w-full"
                                            variant="outline"
                                        >
                                            <Pen className="mr-2 h-4 w-4" />
                                            Assinar
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Syndic Signature */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Building2 className="h-4 w-4" />
                                    Assinatura do Condomínio
                                </CardTitle>
                                <CardDescription>
                                    {order.syndicName
                                        ? `${order.syndicName} — ${order.syndicRole || "Síndico"}`
                                        : "Síndico / Responsável do condomínio"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {order.syndicSignature ? (
                                    <div className="space-y-3">
                                        <div className="border rounded-md overflow-hidden bg-white">
                                            <img
                                                src={order.syndicSignature}
                                                alt="Assinatura do síndico"
                                                className="w-full h-32 object-contain"
                                            />
                                        </div>
                                        <div className="text-sm">
                                            <span className="font-medium">{order.syndicName}</span>
                                            {order.syndicRole && <span className="text-muted-foreground"> — {order.syndicRole}</span>}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Assinatura registrada
                                        </div>
                                        {order.status !== "COMPLETED" && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setSyndicName(order.syndicName || "")
                                                    setSyndicRole(order.syndicRole || "Síndico")
                                                    setSignatureDialog({ open: true, type: "syndic" })
                                                }}
                                            >
                                                <Pen className="mr-2 h-3 w-3" />
                                                Refazer assinatura
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="border-2 border-dashed rounded-md h-32 flex items-center justify-center text-muted-foreground">
                                            <div className="text-center">
                                                <Pen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">Sem assinatura</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => {
                                                setSyndicName("")
                                                setSyndicRole("Síndico")
                                                setSignatureDialog({ open: true, type: "syndic" })
                                            }}
                                            className="w-full"
                                            variant="outline"
                                        >
                                            <Pen className="mr-2 h-4 w-4" />
                                            Coletar assinatura
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* SIGNATURE DIALOG */}
            <Dialog open={signatureDialog.open} onOpenChange={open => setSignatureDialog(prev => ({ ...prev, open }))}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {signatureDialog.type === "leiturista" ? "Assinatura do Leiturista" : "Assinatura do Condomínio"}
                        </DialogTitle>
                    </DialogHeader>

                    {signatureDialog.type === "syndic" && (
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <div className="space-y-1">
                                <Label>Nome do signatário</Label>
                                <Input
                                    value={syndicName}
                                    onChange={e => setSyndicName(e.target.value)}
                                    placeholder="Nome completo"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Cargo</Label>
                                <Input
                                    value={syndicRole}
                                    onChange={e => setSyndicRole(e.target.value)}
                                    placeholder="Síndico, Zelador..."
                                />
                            </div>
                        </div>
                    )}

                    <div className="border-2 border-dashed rounded-md bg-white">
                        <canvas
                            ref={signatureCanvasRef}
                            width={450}
                            height={180}
                            className="w-full cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Assine acima com o mouse ou toque na tela</p>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={clearSignature}>Limpar</Button>
                        <Button variant="outline" onClick={() => setSignatureDialog({ open: false, type: null })}>Cancelar</Button>
                        <Button onClick={saveSignature} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Assinatura
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* READING EDIT DIALOG */}
            <Dialog open={readingDialog.open} onOpenChange={open => !open && setReadingDialog({ open: false, item: null })}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            Leitura — {readingDialog.item?.apartmentName}
                            {readingDialog.item?.blockName && (
                                <span className="text-muted-foreground font-normal ml-1">({readingDialog.item.blockName})</span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-xs">Medidor</Label>
                                <code className="block text-sm bg-muted px-2 py-1.5 rounded">
                                    {readingDialog.item?.meterRegister || "-"}
                                </code>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-xs">Leitura anterior</Label>
                                <code className="block text-sm bg-muted px-2 py-1.5 rounded">
                                    {readingDialog.item?.previousReading?.toFixed(3) || "0.000"}
                                </code>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="currentReading">Leitura Atual (m³) *</Label>
                            <Input
                                id="currentReading"
                                type="number"
                                step="0.001"
                                value={currentReadingValue}
                                onChange={e => setCurrentReadingValue(e.target.value)}
                                placeholder="0.000"
                                className="text-lg font-mono"
                                autoFocus
                            />
                            {currentReadingValue && readingDialog.item?.previousReading !== undefined && (
                                <p className="text-sm text-muted-foreground">
                                    Consumo: <strong>
                                        {(parseFloat(currentReadingValue) - readingDialog.item.previousReading).toFixed(3)} m³
                                    </strong>
                                </p>
                            )}
                        </div>

                        {/* Photo section */}
                        <div className="space-y-2">
                            <Label>Foto do Medidor</Label>
                            {photoPreview ? (
                                <div className="space-y-2">
                                    <div className="relative border rounded-md overflow-hidden bg-black">
                                        <img
                                            src={photoPreview}
                                            alt="Foto do medidor"
                                            className="w-full h-48 object-contain"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => photoInputRef.current?.click()}
                                        >
                                            <Upload className="mr-1 h-3 w-3" />
                                            Trocar foto (upload)
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                                        >
                                            Remover foto
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => photoInputRef.current?.click()}
                                    >
                                        <Upload className="mr-2 h-4 w-4" />
                                        Fazer Upload
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => {
                                            // On mobile this opens the camera directly
                                            if (photoInputRef.current) {
                                                photoInputRef.current.setAttribute("capture", "environment")
                                                photoInputRef.current.click()
                                            }
                                        }}
                                    >
                                        <Camera className="mr-2 h-4 w-4" />
                                        Câmera
                                    </Button>
                                </div>
                            )}
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePhotoChange}
                            />
                            <p className="text-xs text-muted-foreground">
                                Tire uma foto com a câmera ou faça upload de uma imagem existente
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReadingDialog({ open: false, item: null })}>Cancelar</Button>
                        <Button onClick={saveReading} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Leitura
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
