"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
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
    Phone, User, Save, FileText, DollarSign, Send, X, Check
} from "lucide-react"
import Link from "next/link"

interface BillingContact {
    id: string
    name: string         // síndico name
    phone: string        // admin phone
    emails: string[]     // multiple emails
    role: string         // síndico, administrador, etc.
    isPrimary: boolean
}

interface BillingConfig {
    complexId: string
    complexName: string
    dealershipName?: string
    billingType?: string
    schedulingNotes?: string
    contacts: BillingContact[]
    billingTypes: string[]   // custom billing types added to this condo
}

const DEFAULT_BILLING_TYPES = [
    "Água + Esgoto",
    "Água",
    "Esgoto",
    "Gás",
    "Água + Gás",
    "Energia Elétrica",
]

export default function ComplexFaturamentoPage() {
    const { id } = useParams()
    const router = useRouter()
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [complex, setComplex] = useState<any>(null)
    const [config, setConfig] = useState<BillingConfig>({
        complexId: id as string,
        complexName: "",
        dealershipName: "",
        billingType: "none",
        schedulingNotes: "",
        contacts: [],
        billingTypes: [],
    })
    const [customBillingType, setCustomBillingType] = useState("")
    const [addBillingTypeOpen, setAddBillingTypeOpen] = useState(false)

    // Contact dialog
    const [contactDialog, setContactDialog] = useState(false)
    const [editingContact, setEditingContact] = useState<BillingContact | null>(null)
    const [contactForm, setContactForm] = useState({
        name: "",
        phone: "",
        role: "Síndico",
        isPrimary: false,
        emailsRaw: "",  // newline-separated emails
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/(public)/user/(places)/complexes/${id}`)
            if (!res.ok) throw new Error("Condomínio não encontrado")
            const data = await res.json()
            setComplex(data)
            setConfig(prev => ({
                ...prev,
                complexId: data.id,
                complexName: data.socialName || data.name || "",
                dealershipName: data.dealershipName || "",
                billingType: data.billingType || "none",
                schedulingNotes: data.billingNotes || "",
                billingTypes: data.customBillingTypes || [],
                contacts: data.billingContacts || [],
            }))
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [id, toast])

    useEffect(() => { load() }, [load])

    const saveConfig = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/(public)/user/(places)/complexes/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dealershipName: config.dealershipName,
                    billingType: config.billingType === "none" ? "" : config.billingType,
                    billingNotes: config.schedulingNotes,
                    customBillingTypes: config.billingTypes,
                    billingContacts: config.contacts,
                }),
            })
            if (!res.ok) throw new Error("Erro ao salvar configurações")
            toast({ title: "Configurações salvas!", description: "Faturamento atualizado com sucesso." })
        } catch (err: any) {
            toast({ title: "Erro", description: err.message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const addCustomBillingType = () => {
        if (!customBillingType.trim()) return
        if (config.billingTypes.includes(customBillingType.trim())) {
            toast({ title: "Aviso", description: "Este tipo já existe.", variant: "destructive" })
            return
        }
        setConfig(prev => ({ ...prev, billingTypes: [...prev.billingTypes, customBillingType.trim()] }))
        setCustomBillingType("")
        setAddBillingTypeOpen(false)
    }

    const removeBillingType = (type: string) => {
        setConfig(prev => ({ ...prev, billingTypes: prev.billingTypes.filter(t => t !== type) }))
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
            setConfig(prev => ({
                ...prev,
                contacts: prev.contacts.map(c => c.id === editingContact.id ? contact : c),
            }))
        } else {
            setConfig(prev => ({ ...prev, contacts: [...prev.contacts, contact] }))
        }
        setContactDialog(false)
        toast({ title: "Contato salvo!", description: contact.name })
    }

    const removeContact = (id: string) => {
        if (!window.confirm("Remover este contato?")) return
        setConfig(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== id) }))
    }

    const allBillingTypes = [...DEFAULT_BILLING_TYPES, ...config.billingTypes]

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
                        {config.complexName || "Condomínio"}
                    </h1>
                    <p className="text-sm text-muted-foreground">Configurações de Faturamento e Envio</p>
                </div>
                <Button onClick={saveConfig} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                </Button>
            </div>

            <Tabs defaultValue="faturamento">
                <TabsList>
                    <TabsTrigger value="faturamento">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Faturamento
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
                                    <Label>Concessionária</Label>
                                    <Input
                                        value={config.dealershipName || ""}
                                        onChange={e => setConfig(p => ({ ...p, dealershipName: e.target.value }))}
                                        placeholder="Ex: SABESP, COPASA, etc."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tipo de Faturamento</Label>
                                    <Select value={config.billingType || "none"} onValueChange={v => setConfig(p => ({ ...p, billingType: v }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— Selecione —</SelectItem>
                                            {allBillingTypes.map(type => (
                                                <SelectItem key={type} value={type}>{type}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Custom billing types */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Tipos de Faturamento Customizados</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAddBillingTypeOpen(true)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Adicionar
                                    </Button>
                                </div>
                                {config.billingTypes.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {config.billingTypes.map(type => (
                                            <div key={type} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-sm">
                                                <span>{type}</span>
                                                <button
                                                    onClick={() => removeBillingType(type)}
                                                    className="ml-1 text-blue-500 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Nenhum tipo customizado adicionado.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Observações de Agendamento</CardTitle>
                            <CardDescription>Informações importantes para o leiturista ao realizar o agendamento</CardDescription>
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

            {/* ── Add Billing Type Dialog ─────────────────────── */}
            <Dialog open={addBillingTypeOpen} onOpenChange={setAddBillingTypeOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Novo Tipo de Faturamento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input
                            value={customBillingType}
                            onChange={e => setCustomBillingType(e.target.value)}
                            placeholder="Ex: Água + Energia + Gás"
                            onKeyDown={e => e.key === "Enter" && addCustomBillingType()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddBillingTypeOpen(false)}>Cancelar</Button>
                        <Button onClick={addCustomBillingType}>Adicionar</Button>
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
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
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
