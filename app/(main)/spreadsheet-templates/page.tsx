"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Plus, FileSpreadsheet, Pencil, Trash2, Upload, Eye, Building2, ChevronDown, ChevronUp } from "lucide-react"
import axiosClient from "@/services/axiosClient"

interface SpreadsheetTemplate {
  id: string
  name: string
  description?: string
  complexId?: string
  complexName?: string
  rateioMethod: string
  commonAreaType: string
  commonAreaLabel?: string
  includeSewerageRate: boolean
  sewerageRate?: number
  includeAdminFee: boolean
  adminFeeType?: string
  adminFeeValue?: number
  isActive: boolean
  sampleFileName?: string
  sampleFileUrl?: string
  createdAt: string
}

const EMPTY_FORM = {
  name: "",
  description: "",
  complexId: "",
  complexName: "",
  rateioMethod: "FRACAO_IDEAL",
  commonAreaType: "DIFFERENCE",
  commonAreaLabel: "Área Comum",
  includeSewerageRate: false,
  sewerageRate: 0,
  includeAdminFee: false,
  adminFeeType: "PERCENTAGE",
  adminFeeValue: 0,
  isActive: true,
}

export default function SpreadsheetTemplatesPage() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<SpreadsheetTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SpreadsheetTemplate | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axiosClient.get("/spreadsheet-templates")
      setTemplates(res.data.list || res.data || [])
    } catch {
      toast({ title: "Erro ao carregar modelos", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  function openEdit(t: SpreadsheetTemplate) {
    setEditing(t)
    setForm({
      name: t.name,
      description: t.description || "",
      complexId: t.complexId || "",
      complexName: t.complexName || "",
      rateioMethod: t.rateioMethod,
      commonAreaType: t.commonAreaType,
      commonAreaLabel: t.commonAreaLabel || "Área Comum",
      includeSewerageRate: t.includeSewerageRate,
      sewerageRate: t.sewerageRate || 0,
      includeAdminFee: t.includeAdminFee,
      adminFeeType: t.adminFeeType || "PERCENTAGE",
      adminFeeValue: t.adminFeeValue || 0,
      isActive: t.isActive,
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await axiosClient.put(`/spreadsheet-templates/${editing.id}`, form)
        toast({ title: "Modelo atualizado!" })
      } else {
        await axiosClient.post("/spreadsheet-templates", form)
        toast({ title: "Modelo criado!" })
      }
      setModalOpen(false)
      fetchTemplates()
    } catch {
      toast({ title: "Erro ao salvar modelo", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este modelo?")) return
    try {
      await axiosClient.delete(`/spreadsheet-templates/${id}`)
      toast({ title: "Modelo excluído" })
      fetchTemplates()
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" })
    }
  }

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.complexName || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-sky-500" />
            Modelos de Planilha
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cadastre os modelos de filipeta/planilha por condomínio
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Modelo
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar por nome ou condomínio..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-3/4" /></CardHeader>
              <CardContent><div className="h-4 bg-muted rounded w-1/2" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum modelo cadastrado</p>
            <p className="text-sm mt-1">Clique em "Novo Modelo" para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <Card key={t.id} className={`border-2 ${t.isActive ? "border-sky-500/30" : "border-muted opacity-60"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{t.name}</CardTitle>
                    {t.complexName && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {t.complexName}
                      </div>
                    )}
                  </div>
                  <Badge variant={t.isActive ? "default" : "secondary"} className="shrink-0">
                    {t.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {t.rateioMethod === "FRACAO_IDEAL" ? "Fração Ideal" : "Divisão Simples"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t.commonAreaLabel || "Área Comum"}:{" "}
                    {t.commonAreaType === "DIFFERENCE" ? "Diferença" : t.commonAreaType === "OWN_METER" ? "Medidor Próprio" : "Customizado"}
                  </Badge>
                </div>

                {/* Expandir detalhes */}
                <button
                  className="text-xs text-sky-500 flex items-center gap-1"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  {expandedId === t.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expandedId === t.id ? "Menos detalhes" : "Ver detalhes"}
                </button>

                {expandedId === t.id && (
                  <div className="text-xs space-y-1 bg-muted/30 rounded p-2">
                    {t.description && <p className="text-muted-foreground">{t.description}</p>}
                    {t.includeSewerageRate && <p>Esgoto: {t.sewerageRate}%</p>}
                    {t.includeAdminFee && (
                      <p>Taxa Admin: {t.adminFeeType === "FIXED" ? `R$ ${t.adminFeeValue}` : `${t.adminFeeValue}%`}</p>
                    )}
                    {t.sampleFileName && (
                      <a href={t.sampleFileUrl} target="_blank" className="text-sky-500 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {t.sampleFileName}
                      </a>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(t)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Modelo" : "Novo Modelo de Planilha"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-1">
              <Label>Nome do modelo *</Label>
              <Input placeholder="Ex: Modelo América Clube" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Condomínio */}
            <div className="space-y-1">
              <Label>Condomínio (opcional)</Label>
              <Input placeholder="Nome do condomínio" value={form.complexName} onChange={e => setForm(f => ({ ...f, complexName: e.target.value }))} />
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea placeholder="Observações sobre este modelo..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Método de rateio */}
              <div className="space-y-1">
                <Label>Método de rateio</Label>
                <Select value={form.rateioMethod} onValueChange={v => setForm(f => ({ ...f, rateioMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FRACAO_IDEAL">Fração Ideal</SelectItem>
                    <SelectItem value="DIVISAO_SIMPLES">Divisão Simples</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo área comum */}
              <div className="space-y-1">
                <Label>Tipo de área comum</Label>
                <Select value={form.commonAreaType} onValueChange={v => setForm(f => ({ ...f, commonAreaType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIFFERENCE">Diferença (total - soma)</SelectItem>
                    <SelectItem value="OWN_METER">Medidor próprio</SelectItem>
                    <SelectItem value="CUSTOM">Customizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Nome da área comum */}
            <div className="space-y-1">
              <Label>Como chamar a área comum neste condomínio</Label>
              <Input placeholder="Ex: Área Comum, Alinhamento, Diferença..." value={form.commonAreaLabel} onChange={e => setForm(f => ({ ...f, commonAreaLabel: e.target.value }))} />
            </div>

            {/* Esgoto */}
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-sm font-medium">Cobrar esgoto</p>
                <p className="text-xs text-muted-foreground">Aplica percentual sobre o consumo</p>
              </div>
              <Switch checked={form.includeSewerageRate} onCheckedChange={v => setForm(f => ({ ...f, includeSewerageRate: v }))} />
            </div>
            {form.includeSewerageRate && (
              <div className="space-y-1">
                <Label>Percentual de esgoto (%)</Label>
                <Input type="number" min={0} max={200} value={form.sewerageRate} onChange={e => setForm(f => ({ ...f, sewerageRate: parseFloat(e.target.value) }))} />
              </div>
            )}

            {/* Taxa admin */}
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-sm font-medium">Taxa de administração</p>
                <p className="text-xs text-muted-foreground">Cobrada por unidade</p>
              </div>
              <Switch checked={form.includeAdminFee} onCheckedChange={v => setForm(f => ({ ...f, includeAdminFee: v }))} />
            </div>
            {form.includeAdminFee && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={form.adminFeeType} onValueChange={v => setForm(f => ({ ...f, adminFeeType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Valor fixo (R$)</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentual (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{form.adminFeeType === "FIXED" ? "Valor (R$)" : "Percentual (%)"}</Label>
                  <Input type="number" min={0} value={form.adminFeeValue} onChange={e => setForm(f => ({ ...f, adminFeeValue: parseFloat(e.target.value) }))} />
                </div>
              </div>
            )}

            {/* Ativo */}
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-sm font-medium">Modelo ativo</p>
                <p className="text-xs text-muted-foreground">Disponível para uso na geração de planilhas</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
