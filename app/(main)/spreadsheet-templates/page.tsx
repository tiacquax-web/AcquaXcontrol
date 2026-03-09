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
import { Plus, FileSpreadsheet, Pencil, Trash2, Upload, Eye, Building2, FileUp, Info, X } from "lucide-react"
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
  complexId: "none",
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axiosClient.get<{ list: SpreadsheetTemplate[] }>("/spreadsheet-templates")
      setTemplates(res.data.list || [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = templates.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.complexName || "").toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setUploadFile(null)
    setModalOpen(true)
  }

  const openEdit = (t: SpreadsheetTemplate) => {
    setEditing(t)
    setForm({
      name: t.name,
      description: t.description || "",
      complexId: t.complexId || "none",
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
    setUploadFile(null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        complexId: form.complexId !== "none" ? form.complexId : undefined,
        complexName: form.complexName || undefined,
      }
      if (editing) {
        await axiosClient.put(`/spreadsheet-templates/${editing.id}`, payload)
        toast({ title: "Modelo atualizado!" })
      } else {
        const res = await axiosClient.post<{ id: string }>("/spreadsheet-templates", payload)
        // If a file was selected, upload it now
        if (uploadFile && res.data?.id) {
          await doUpload(res.data.id, uploadFile)
        }
        toast({ title: "Modelo criado!" })
      }
      setModalOpen(false)
      load()
    } catch {
      toast({ title: "Erro ao salvar modelo", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const doUpload = async (templateId: string, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    try {
      setUploadingId(templateId)
      await axiosClient.post(`/spreadsheet-templates/${templateId}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      toast({ title: "Planilha modelo enviada!", description: "O sistema processará o mapeamento de colunas." })
    } catch {
      toast({ title: "Erro ao enviar planilha", description: "Verifique o arquivo e tente novamente.", variant: "destructive" })
    } finally {
      setUploadingId(null)
      load()
    }
  }

  const handleUploadExisting = async (templateId: string, file: File) => {
    await doUpload(templateId, file)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await axiosClient.delete(`/spreadsheet-templates/${deleteId}`)
      toast({ title: "Modelo excluído" })
      setDeleteId(null)
      load()
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" })
    }
  }

  const f = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-sky-500" />
            Modelos de Planilha
          </h1>
          <p className="text-muted-foreground mt-1">
            Cadastre os modelos usados para gerar as filipetas mensais de cada condomínio.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-sky-500 hover:bg-sky-600">
          <Plus className="h-4 w-4 mr-2" /> Novo Modelo
        </Button>
      </div>

      {/* Info box */}
      <Card className="mb-6 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 pb-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Como funciona:</strong> Faça upload da planilha Excel que a administradora usa (ex.: filipeta do condomínio).
            O sistema aprende o layout da planilha e, a cada mês, preenche automaticamente com as leituras registradas nas Ordens de Serviço.
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <Input
          placeholder="Buscar por nome ou condomínio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-xl font-medium text-muted-foreground">Nenhum modelo encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em &quot;Novo Modelo&quot; para começar.</p>
            <Button className="mt-4 bg-sky-500 hover:bg-sky-600" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Criar Primeiro Modelo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{t.name}</span>
                      <Badge variant={t.isActive ? "default" : "secondary"}>
                        {t.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {t.rateioMethod === "FRACAO_IDEAL" ? "Fração Ideal" : "Divisão Simples"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {t.commonAreaType === "DIFFERENCE" ? "Área comum = Diferença"
                          : t.commonAreaType === "OWN_METER" ? "Área comum = Medidor próprio"
                          : "Área comum = Personalizado"}
                      </Badge>
                    </div>
                    {t.complexName && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {t.complexName}
                      </p>
                    )}
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
                    )}
                    {t.sampleFileName && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <FileUp className="h-3 w-3" />
                        Planilha: {t.sampleFileName}
                        {t.sampleFileUrl && (
                          <a href={t.sampleFileUrl} target="_blank" rel="noopener noreferrer"
                            className="ml-1 text-blue-600 underline" onClick={e => e.stopPropagation()}>
                            ver
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Upload button */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (file) await handleUploadExisting(t.id, file)
                          e.target.value = ""
                        }}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          {uploadingId === t.id ? (
                            <><Upload className="h-3 w-3 mr-1 animate-bounce" /> Enviando...</>
                          ) : (
                            <><Upload className="h-3 w-3 mr-1" /> {t.sampleFileName ? "Atualizar" : "Upload Planilha"}</>
                          )}
                        </span>
                      </Button>
                    </label>
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Modelo de Planilha" : "Novo Modelo de Planilha"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Modelo *</Label>
              <Input id="name" value={form.name} onChange={e => f("name", e.target.value)}
                placeholder="Ex.: Filipeta Padrão SABESP" />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="desc">Descrição / Observações</Label>
              <Textarea id="desc" value={form.description}
                onChange={e => f("description", e.target.value)}
                placeholder="Descreva quando usar este modelo, particularidades, etc." rows={2} />
            </div>

            {/* Condomínio */}
            <div className="space-y-2">
              <Label>Condomínio (opcional)</Label>
              <Input value={form.complexName}
                onChange={e => f("complexName", e.target.value)}
                placeholder="Nome do condomínio (deixe vazio para modelo genérico)" />
              <p className="text-xs text-muted-foreground">Se preenchido, este modelo será vinculado a este condomínio específico.</p>
            </div>

            {/* Rateio */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Método de Rateio *</Label>
                <Select value={form.rateioMethod} onValueChange={v => f("rateioMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FRACAO_IDEAL">Fração Ideal</SelectItem>
                    <SelectItem value="DIVISAO_SIMPLES">Divisão Simples (igual)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.rateioMethod === "FRACAO_IDEAL"
                    ? "Rateio proporcional à fração ideal de cada unidade"
                    : "Divisão igual entre todas as unidades"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Área Comum *</Label>
                <Select value={form.commonAreaType} onValueChange={v => f("commonAreaType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIFFERENCE">Diferença (total - soma individuais)</SelectItem>
                    <SelectItem value="OWN_METER">Medidor próprio de área comum</SelectItem>
                    <SelectItem value="CUSTOM">Personalizado (alinhamento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome da Linha de Área Comum</Label>
              <Input value={form.commonAreaLabel}
                onChange={e => f("commonAreaLabel", e.target.value)}
                placeholder="Ex.: Área Comum, Alinhamento, Compensação..." />
            </div>

            {/* Sewerage */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Incluir Taxa de Esgoto</Label>
                <Switch checked={form.includeSewerageRate}
                  onCheckedChange={v => f("includeSewerageRate", v)} />
              </div>
              {form.includeSewerageRate && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Taxa de Esgoto (%)</Label>
                    <Input type="number" value={form.sewerageRate}
                      onChange={e => f("sewerageRate", parseFloat(e.target.value) || 0)}
                      placeholder="Ex.: 100" />
                  </div>
                </div>
              )}
            </div>

            {/* Admin fee */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Incluir Taxa de Administração</Label>
                <Switch checked={form.includeAdminFee}
                  onCheckedChange={v => f("includeAdminFee", v)} />
              </div>
              {form.includeAdminFee && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.adminFeeType} onValueChange={v => f("adminFeeType", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Percentual (%)</SelectItem>
                        <SelectItem value="FIXED">Valor Fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor</Label>
                    <Input type="number" value={form.adminFeeValue}
                      onChange={e => f("adminFeeValue", parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              )}
            </div>

            {/* File upload (new template) */}
            {!editing && (
              <div className="space-y-2">
                <Label>Upload da Planilha Modelo (opcional)</Label>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-sky-400 transition-colors ${uploadFile ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-muted"}`}>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    id="template-file-upload"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                  <label htmlFor="template-file-upload" className="cursor-pointer block">
                    {uploadFile ? (
                      <div className="flex items-center justify-center gap-2 text-green-600">
                        <FileUp className="h-5 w-5" />
                        <span className="font-medium">{uploadFile.name}</span>
                        <button type="button" onClick={e => { e.preventDefault(); setUploadFile(null) }}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">
                        <Upload className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">Clique para selecionar ou arraste o arquivo .xlsx aqui</p>
                        <p className="text-xs mt-1">O sistema irá mapear as colunas automaticamente</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border rounded-lg p-3">
              <Label>Modelo Ativo</Label>
              <Switch checked={form.isActive} onCheckedChange={v => f("isActive", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-sky-500 hover:bg-sky-600">
              {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Criar Modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Modelo?</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
