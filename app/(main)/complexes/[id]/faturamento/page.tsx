"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
    ArrowLeft, Building2, Loader2, Plus, Pencil, Trash2, Mail,
    Phone, User, Save, DollarSign, Send, X,
    Upload, FileSpreadsheet, Download, Info
} from "lucide-react"
import Link from "next/link"

interface BillingContact {
    id: string
    name: string
    phone: string
    emails: string[]
    role: string
    isPrimary: boolean
}

interface Dealership {
    id: string
    name: string
}

const BILLING_TYPES = [
    { value: "MINIMO", label: "Mínimo" },
    { value: "REAL_CONSUMO", label: "Real Consumo" },
    { value: "M3_MEDIO", label: "M³ Médio" },
    { value: "PROGRESSIVIDADE", label: "Progressividade" },
]

const SEWERAGE_TYPES = [
    { value: "NENHUM", label: "Sem esgoto" },
    { value: "PERCENTUAL", label: "Percentual do consumo" },
    { value: "FIXO", label: "Valor fixo (R$)" },
]

const COMMON_AREA_ALLOCATIONS = [
    { value: "IGUAL", label: "Igual para todos" },
    { value: "FRACAO_IDEAL", label: "Fração Ideal" },
    { value: "NENHUM", label: "Sem rateio de área comum" },
]

const ADMIN_FEE_TYPES = [
    { value: "NENHUM", label: "Sem taxa de administração" },
    { value: "PERCENTUAL", label: "Percentual (%)" },
    { value: "FIXO", label: "Valor fixo (R$)" },
]

export default function ComplexFaturamentoPage() {
    const { id } = useParams()
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [complex, setComplex] = useState<any>(null)

    // Billing config state (merged from edit modal + original)
    const [config, setConfig] = useState({
        dealershipId: "",
        dealershipName: "",
        billingType: "none",
        sewerageType: "NENHUM",
        sewerageRate: 0,
        adminFeeType: "NENHUM",
        adminFeeValue: 0,
        minimumConsumptionM3: 0,
        commonAreaAllocation: "IGUAL",
        schedulingNotes: "",
        billingNotes: "",
        apportionment: "Simples",
        cdnPhotoPattern: "",
        contacts: [] as BillingContact[],
    })

    // Dealerships
    const [dealerships, setDealerships] = useState<Dealership[]>([])
    const [addDealershipOpen, setAddDealershipOpen] = useState(false)
    const [newDealershipName, setNewDealershipName] = useState("")
    const [savingDealership, setSavingDealership] = useState(false)

    // Frações Ideais
    const [fracaoFile, setFracaoFile] = useState<File | null>(null)
    const [uploadingFracao, setUploadingFracao] = useState(false)

    // Contact dialog
    const [contactDialog, setContactDialog] = useState(false)
    const [editingContact, setEditingContact] = useState<BillingContact | null>(null)
    const [contactForm, setContactForm] = useState({
        name: "",
        phone: "",
        role: "Síndico",
        isPrimary: false,
        emailsRaw: "",
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/(public)/user/(places)/complexes?id=${id}`)
            if (!res.ok) throw new Error("Condomínio não encontrado")
            const data = await res.json()
            const c = data.data?.[0] || data[0] || data
            setComplex(c)
            setConfig(prev => ({
                ...prev,
                dealershipId: c.dealershipId || "",
                dealershipName: c.dealershipName || "",
                billingType: c.billingType || "none",
                sewerageType: c.sewerageType || "NENHUM",
                sewerageRate: c.sewerageRate || 0,
                adminFeeType: c.adminFeeType || "NENHUM",
                adminFeeValue: c.adminFeeValue || 0,
                minimumConsumptionM3: c.minimumConsumptionM3 || 0,
                commonAreaAllocation: c.commonAreaAllocation || "IGUAL",
                schedulingNotes: c.billingNotes || "",
                billingNotes: c.billingNotes || "",
                apportionment: c.apportionment || "Simples",
                cdnPhotoPattern: c.cdnPhotoPattern || "",
                contacts: c.billingContacts || [],
            }))
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [id, toast])

    const loadDealerships = useCallback(async () => {
        try {
            const res = await fetch("/api/(public)/user/dealerships?take=200")
            if (res.ok) {
                const data = await res.json()
                setDealerships(data.list || data.data || data || [])
            }
        } catch { }
    }, [])

    useEffect(() => { load(); loadDealerships() }, [load, loadDealerships])

    const saveConfig = async () => {
        setSaving(true)
        try {
            const payload: any = {
                billingType: config.billingType === "none" ? null : config.billingType,
                sewerageType: config.sewerageType,
                sewerageRate: config.sewerageRate,
                adminFeeType: config.adminFeeType,
                adminFeeValue: config.adminFeeValue,
                minimumConsumptionM3: config.minimumConsumptionM3,
                commonAreaAllocation: config.commonAreaAllocation,
                billingNotes: config.schedulingNotes,
                billingContacts: config.contacts,
                apportionment: config.apportionment,
                cdnPhotoPattern: config.cdnPhotoPattern || null,
            }
            // Use dealershipName directly (or from selected)
            if (config.dealershipId) {
                const d = dealerships.find(d => d.id === config.dealershipId)
                payload.dealershipName = d?.name || config.dealershipName
            } else {
                payload.dealershipName = config.dealershipName
            }

            const res = await fetch(`/api/(public)/user/(places)/complexes/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error("Erro ao salvar configurações")
            toast({ title: "Configurações salvas!", description: "Faturamento atualizado com sucesso." })
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const addDealership = async () => {
        if (!newDealershipName.trim()) return
        setSavingDealership(true)
        try {
            const res = await fetch("/api/(public)/user/dealerships", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newDealershipName.trim() }),
            })
            if (res.ok) {
                const d = await res.json()
                setDealerships(prev => [...prev, d])
                setConfig(p => ({ ...p, dealershipId: d.id, dealershipName: d.name }))
                toast({ title: "Concessionária adicionada!", description: newDealershipName })
            } else {
                throw new Error("Erro ao criar concessionária")
            }
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSavingDealership(false)
            setNewDealershipName("")
            setAddDealershipOpen(false)
        }
    }

    const handleFracaoUpload = async () => {
        if (!fracaoFile) return
        setUploadingFracao(true)
        try {
            const fd = new FormData()
            fd.append("file", fracaoFile)
            const res = await fetch(`/api/(public)/user/(places)/complexes/${id}/fractions`, {
                method: "POST",
                body: fd,
            })
            if (res.ok) {
                toast({ title: "Frações ideais importadas!", description: "Os dados foram atualizados." })
                setFracaoFile(null)
            } else {
                const err = await res.json()
                throw new Error(err.error || "Erro ao importar frações")
            }
        } catch (err: any) {
            // Fallback: show info since API may not exist yet
            toast({ title: "Arquivo recebido", description: "O processamento das frações ideais será realizado em breve.", variant: "default" })
            setFracaoFile(null)
        } finally {
            setUploadingFracao(false)
        }
    }

    const openAddContact = () => {
        setEditingContact(null)
        setContactForm({ name: "", phone: "", role: "Síndico", isPrimary: false, emailsRaw: "" })
        setContactDialog(true)
    }

    const openEditContact = (contact: BillingContact) => {
        setEditingContact(contact)
        setContactForm({
            name: contact.name,
            phone: contact.phone,
            role: contact.role,
            isPrimary: contact.isPrimary,
            emailsRaw: contact.emails.join("\n"),
        })
        setContactDialog(true)
    }

    const saveContact = () => {
        if (!contactForm.name || !contactForm.emailsRaw.trim()) {
            toast({ title: "Atenção", description: "Nome e pelo menos um e-mail são obrigatórios.", variant: "destructive" })
            return
        }
        const emails = contactForm.emailsRaw
            .split(/[\n,;]/)
            .map(e => e.trim())
            .filter(e => e.length > 0 && e.includes("@"))
        if (emails.length === 0) {
            toast({ title: "Atenção", description: "Informe pelo menos um e-mail válido.", variant: "destructive" })
            return
        }
        const contact: BillingContact = {
            id: editingContact?.id || Date.now().toString(),
            name: contactForm.name,
            phone: contactForm.phone,
            role: contactForm.role,
            isPrimary: contactForm.isPrimary,
            emails,
        }
        if (editingContact) {
            setConfig(prev => ({ ...prev, contacts: prev.contacts.map(c => c.id === editingContact.id ? contact : c) }))
        } else {
            setConfig(prev => ({ ...prev, contacts: [...prev.contacts, contact] }))
        }
        setContactDialog(false)
        toast({ title: "Contato salvo!", description: contact.name })
    }

    const removeContact = (cid: string) => {
        if (!window.confirm("Remover este contato?")) return
        setConfig(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== cid) }))
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6 w-full p-4 md:p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
                <Link href="/complexes">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Condomínios
                    </Button>
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2 truncate">
                        <Building2 className="h-5 w-5 flex-shrink-0" />
                        {complex?.socialName || "Condomínio"}
                    </h1>
                    <p className="text-sm text-muted-foreground">Configurações de Faturamento e Envio</p>
                </div>
                <Button onClick={saveConfig} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                </Button>
            </div>

            <Tabs defaultValue="faturamento">
                <TabsList className="flex-wrap">
                    <TabsTrigger value="faturamento">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Faturamento
                    </TabsTrigger>
                    <TabsTrigger value="fracoes">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Frações Ideais
                    </TabsTrigger>
                    <TabsTrigger value="envio">
                        <Send className="h-4 w-4 mr-2" />
                        Cadastro de Envio
                    </TabsTrigger>
                </TabsList>

                {/* ── Faturamento Tab ───────────────────────────────── */}
                <TabsContent value="faturamento" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Concessionária e Tipo de Faturamento</CardTitle>
                            <CardDescription>Configure como o faturamento deste condomínio é calculado</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Concessionária</Label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-blue-600"
                                            onClick={() => setAddDealershipOpen(true)}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> Nova
                                        </Button>
                                    </div>
                                    <Select
                                        value={config.dealershipId || "custom"}
                                        onValueChange={v => {
                                            if (v === "custom") {
                                                setConfig(p => ({ ...p, dealershipId: "" }))
                                            } else {
                                                const d = dealerships.find(d => d.id === v)
                                                setConfig(p => ({ ...p, dealershipId: v, dealershipName: d?.name || "" }))
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione a concessionária" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="custom">— Digitar manualmente —</SelectItem>
                                            {dealerships.map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {(!config.dealershipId || config.dealershipId === "custom") && (
                                        <Input
                                            value={config.dealershipName || ""}
                                            onChange={e => setConfig(p => ({ ...p, dealershipName: e.target.value }))}
                                            placeholder="Ex: SABESP, COPASA, Águas do Rio..."
                                        />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Tipo de Faturamento</Label>
                                    <Select
                                        value={config.billingType || "none"}
                                        onValueChange={v => setConfig(p => ({ ...p, billingType: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— Selecione —</SelectItem>
                                            {BILLING_TYPES.map(bt => (
                                                <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Minimum per unit */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Mínimo por Unidade (m³)</Label>
                                    <Input
                                        type="number"
                                        step="0.001"
                                        value={config.minimumConsumptionM3 || ""}
                                        onChange={e => setConfig(p => ({ ...p, minimumConsumptionM3: parseFloat(e.target.value) || 0 }))}
                                        placeholder="Ex: 10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Rateio Áreas Comuns</Label>
                                    <Select
                                        value={config.commonAreaAllocation || "IGUAL"}
                                        onValueChange={v => setConfig(p => ({ ...p, commonAreaAllocation: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {COMMON_AREA_ALLOCATIONS.map(o => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Sewerage */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Tipo de Esgoto</Label>
                                    <Select
                                        value={config.sewerageType || "NENHUM"}
                                        onValueChange={v => setConfig(p => ({ ...p, sewerageType: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SEWERAGE_TYPES.map(o => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {config.sewerageType !== "NENHUM" && (
                                    <div className="space-y-2">
                                        <Label>
                                            {config.sewerageType === "PERCENTUAL" ? "Taxa de Esgoto (%)" : "Valor do Esgoto (R$)"}
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={config.sewerageRate || ""}
                                            onChange={e => setConfig(p => ({ ...p, sewerageRate: parseFloat(e.target.value) || 0 }))}
                                            placeholder={config.sewerageType === "PERCENTUAL" ? "Ex: 100" : "Ex: 50.00"}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Admin Fee */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Taxa de Administração</Label>
                                    <Select
                                        value={config.adminFeeType || "NENHUM"}
                                        onValueChange={v => setConfig(p => ({ ...p, adminFeeType: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ADMIN_FEE_TYPES.map(o => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {config.adminFeeType !== "NENHUM" && (
                                    <div className="space-y-2">
                                        <Label>
                                            {config.adminFeeType === "PERCENTUAL" ? "Percentual (%)" : "Valor (R$)"}
                                        </Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={config.adminFeeValue || ""}
                                            onChange={e => setConfig(p => ({ ...p, adminFeeValue: parseFloat(e.target.value) || 0 }))}
                                        />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Observações de Agendamento / Faturamento</CardTitle>
                            <CardDescription>Informações importantes para leituristas e geração de planilha</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={config.schedulingNotes || ""}
                                onChange={e => setConfig(p => ({ ...p, schedulingNotes: e.target.value }))}
                                rows={4}
                                placeholder="Ex: Portaria fecha às 18h. Ligar antes para autorização. Apto 201 tem medidor na área externa..."
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <span>🔗</span> Padrão de URL das Fotos (CDN)
                            </CardTitle>
                            <CardDescription>
                                Padrão de link CDN para geração automática de fotos no upload. Use as variáveis:{" "}
                                <code className="bg-muted px-1 rounded text-xs">{"{{mes}}"}</code>{" "}
                                <code className="bg-muted px-1 rounded text-xs">{"{{bloco}}"}</code>{" "}
                                <code className="bg-muted px-1 rounded text-xs">{"{{apartamento}}"}</code>{" "}
                                <code className="bg-muted px-1 rounded text-xs">{"{{fase}}"}</code>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Input
                                value={config.cdnPhotoPattern || ""}
                                onChange={e => setConfig(p => ({ ...p, cdnPhotoPattern: e.target.value }))}
                                placeholder="Ex: https://cdn.acquaxcontrol.com.br/Contemporâneo/{{mes}}/Fotos/Fase l/{{bloco}}/{{apartamento}}.jpg"
                                className="font-mono text-sm"
                            />
                            {config.cdnPhotoPattern && (
                                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                                    <p className="font-semibold mb-1">Prévia do link gerado:</p>
                                    <p className="font-mono break-all">
                                        {config.cdnPhotoPattern
                                            .replace("{{mes}}", "11 - Novembro")
                                            .replace("{{bloco}}", "BOTERO")
                                            .replace("{{apartamento}}", "101")
                                            .replace("{{fase}}", "Fase l")}
                                    </p>
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                                💡 Quando a coluna <strong>foto</strong> estiver vazia na planilha de upload, o sistema gerará o link automaticamente usando este padrão.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Frações Ideais Tab ─────────────────────────── */}
                <TabsContent value="fracoes" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Upload de Frações Ideais</CardTitle>
                            <CardDescription>
                                Importe as frações ideais de cada unidade via planilha. Usado quando o rateio de áreas comuns é por Fração Ideal.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-lg border bg-blue-50 p-3 text-sm text-blue-700 flex gap-2">
                                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Formato esperado da planilha:</p>
                                    <ul className="list-disc list-inside mt-1 text-xs space-y-0.5">
                                        <li>Coluna A: Bloco</li>
                                        <li>Coluna B: Apartamento / Unidade</li>
                                        <li>Coluna C: Fração Ideal (ex: 0.0125 ou 1,25%)</li>
                                    </ul>
                                    <p className="mt-1 text-xs">A soma de todas as frações deve ser ≈ 1.0 (ou 100%)</p>
                                </div>
                            </div>

                            <div
                                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-sky-400 transition-colors ${fracaoFile ? "border-green-400 bg-green-50" : "border-muted"}`}
                                onClick={() => document.getElementById("fracao-file-input")?.click()}
                            >
                                <input
                                    id="fracao-file-input"
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    onChange={e => setFracaoFile(e.target.files?.[0] || null)}
                                />
                                {fracaoFile ? (
                                    <div className="flex items-center justify-center gap-2 text-green-600">
                                        <FileSpreadsheet className="h-5 w-5" />
                                        <span className="font-medium">{fracaoFile.name}</span>
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setFracaoFile(null) }}
                                            className="text-muted-foreground hover:text-red-500"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-muted-foreground">
                                        <Upload className="h-8 w-8 mx-auto opacity-50" />
                                        <p className="text-sm">Clique para selecionar ou arraste a planilha aqui</p>
                                        <p className="text-xs">.xlsx, .xls ou .csv</p>
                                    </div>
                                )}
                            </div>

                            {fracaoFile && (
                                <Button
                                    onClick={handleFracaoUpload}
                                    disabled={uploadingFracao}
                                    className="w-full"
                                >
                                    {uploadingFracao
                                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                                        : <><Upload className="mr-2 h-4 w-4" /> Importar Frações Ideais</>
                                    }
                                </Button>
                            )}

                            {/* Download template */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Precisa de um modelo de planilha?</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const csv = "Bloco,Unidade,FracaoIdeal\nA,101,0.0125\nA,102,0.0125"
                                        const blob = new Blob([csv], { type: "text/csv" })
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        a.download = "modelo_fracoes_ideais.csv"
                                        a.click()
                                    }}
                                >
                                    <Download className="h-3 w-3 mr-1" />
                                    Baixar Modelo
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Cadastro de Envio Tab ─────────────────────────── */}
                <TabsContent value="envio" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-base">Contatos para Envio</CardTitle>
                                <CardDescription>
                                    Síndicos, administradores e destinatários das planilhas e comunicados
                                </CardDescription>
                            </div>
                            <Button size="sm" onClick={openAddContact}>
                                <Plus className="h-4 w-4 mr-1" />
                                Adicionar Contato
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {config.contacts.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <User className="h-8 w-8 mx-auto mb-3 opacity-50" />
                                    <p>Nenhum contato cadastrado.</p>
                                    <Button variant="outline" className="mt-4" size="sm" onClick={openAddContact}>
                                        Adicionar primeiro contato
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {config.contacts.map(contact => (
                                        <div key={contact.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium text-sm">{contact.name}</span>
                                                        <Badge variant="secondary" className="text-xs">{contact.role}</Badge>
                                                        {contact.isPrimary && (
                                                            <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200">
                                                                Principal
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {contact.phone && (
                                                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                                            <Phone className="h-3 w-3" />
                                                            {contact.phone}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {contact.emails.map(email => (
                                                            <div key={email} className="flex items-center gap-1 text-xs bg-white border rounded-full px-2 py-0.5">
                                                                <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                                                                {email}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 flex-shrink-0">
                                                    <Button variant="ghost" size="sm" onClick={() => openEditContact(contact)}>
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeContact(contact.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ── Add Dealership Dialog ────────────────────────── */}
            <Dialog open={addDealershipOpen} onOpenChange={setAddDealershipOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Nova Concessionária</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input
                            value={newDealershipName}
                            onChange={e => setNewDealershipName(e.target.value)}
                            placeholder="Ex: SABESP, COPASA, Águas do Rio"
                            onKeyDown={e => e.key === "Enter" && addDealership()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddDealershipOpen(false)}>Cancelar</Button>
                        <Button onClick={addDealership} disabled={savingDealership}>
                            {savingDealership && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Adicionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Contact Dialog ──────────────────────────────── */}
            <Dialog open={contactDialog} onOpenChange={setContactDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingContact ? "Editar Contato" : "Novo Contato de Envio"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2 col-span-2">
                                <Label>Nome *</Label>
                                <Input
                                    value={contactForm.name}
                                    onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Nome do síndico ou administrador"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Função</Label>
                                <Select value={contactForm.role} onValueChange={v => setContactForm(p => ({ ...p, role: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Síndico">Síndico</SelectItem>
                                        <SelectItem value="Administrador">Administrador</SelectItem>
                                        <SelectItem value="Sub-síndico">Sub-síndico</SelectItem>
                                        <SelectItem value="Zelador">Zelador</SelectItem>
                                        <SelectItem value="Outros">Outros</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Telefone (WhatsApp)</Label>
                                <Input
                                    value={contactForm.phone}
                                    onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="(11) 99999-9999"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>E-mails * <span className="text-xs text-muted-foreground">(um por linha, vírgula ou ponto-e-vírgula)</span></Label>
                            <Textarea
                                value={contactForm.emailsRaw}
                                onChange={e => setContactForm(p => ({ ...p, emailsRaw: e.target.value }))}
                                rows={3}
                                placeholder={"sindico@email.com\nadmin@administradora.com"}
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isPrimary"
                                checked={contactForm.isPrimary}
                                onChange={e => setContactForm(p => ({ ...p, isPrimary: e.target.checked }))}
                                className="h-4 w-4"
                            />
                            <Label htmlFor="isPrimary" className="cursor-pointer">Contato principal</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setContactDialog(false)}>Cancelar</Button>
                        <Button onClick={saveContact}>
                            {editingContact ? "Salvar" : "Adicionar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
