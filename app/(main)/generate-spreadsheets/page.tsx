"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilePlus2, Download, Search, RefreshCw, CheckCircle, Clock, XCircle, Filter, Loader2, Building2, Calendar, Info } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import axiosClient from "@/services/axiosClient"
import { toast } from "@/hooks/use-toast"

interface GeneratedSpreadsheet {
  id: string
  serviceOrderId: string
  templateId?: string
  complexId?: string
  complexName?: string
  month: number
  year: number
  status: "GENERATING" | "READY" | "ERROR"
  fileUrl?: string
  fileName?: string
  fileSize?: number
  generatedAt?: string
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  GENERATING: "Gerando",
  READY: "Pronta",
  ERROR: "Erro",
}

const STATUS_COLORS: Record<string, string> = {
  GENERATING: "bg-yellow-100 text-yellow-800",
  READY: "bg-green-100 text-green-800",
  ERROR: "bg-red-100 text-red-800",
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "READY") return <CheckCircle className="h-4 w-4 text-green-500" />
  if (status === "ERROR") return <XCircle className="h-4 w-4 text-red-500" />
  return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function GenerateSpreadsheetsPage() {
  const [spreadsheets, setSpreadsheets] = useState<GeneratedSpreadsheet[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterMonth, setFilterMonth] = useState<string>("")
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()))
  const [search, setSearch] = useState("")
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [newServiceOrderId, setNewServiceOrderId] = useState("")
  const [newTemplateId, setNewTemplateId] = useState("none")
  // OS lookup state
  const [lookingUpOS, setLookingUpOS] = useState(false)
  const [foundOrder, setFoundOrder] = useState<any>(null)
  // Templates list
  const [templates, setTemplates] = useState<any[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterStatus) params.status = filterStatus
      if (filterMonth) params.month = filterMonth
      if (filterYear) params.year = filterYear
      const res = await axiosClient.get<{ list: GeneratedSpreadsheet[] }>("/generated-spreadsheets", { params })
      setSpreadsheets(res.data.list || [])
    } catch {
      setSpreadsheets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Load templates
    fetch("/api/spreadsheet-templates?take=100")
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setTemplates(d.data || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterMonth, filterYear])

  const filtered = spreadsheets.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.complexName?.toLowerCase().includes(q) || s.fileName?.toLowerCase().includes(q)
  })

  // Lookup OS details when ID changes
  const lookupOS = useCallback(async (id: string) => {
    if (!id.trim() || id.length < 10) { setFoundOrder(null); return }
    setLookingUpOS(true)
    try {
      const res = await fetch(`/api/service-orders?search=${encodeURIComponent(id)}&take=1`)
      if (!res.ok) { setFoundOrder(null); return }
      const data = await res.json()
      const orders = data.data || []
      // Try exact match on orderNumber or id
      const match = orders.find((o: any) => o.id === id.trim() || o.orderNumber === id.trim())
      setFoundOrder(match || orders[0] || null)
    } catch { setFoundOrder(null) }
    finally { setLookingUpOS(false) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => lookupOS(newServiceOrderId), 600)
    return () => clearTimeout(timer)
  }, [newServiceOrderId, lookupOS])

  const handleGenerate = async () => {
    if (!newServiceOrderId.trim()) {
      toast({ title: "Informe o ID da ordem de serviço", variant: "destructive" })
      return
    }
    setGenerating(true)
    try {
      await axiosClient.post("/generated-spreadsheets", {
        serviceOrderId: newServiceOrderId.trim(),
        templateId: (newTemplateId && newTemplateId !== "none") ? newTemplateId.trim() : undefined,
      })
      toast({ title: "Planilha em geração! Aguarde alguns instantes." })
      setGenerateOpen(false)
      setNewServiceOrderId("")
      setNewTemplateId("")
      setTimeout(load, 2000)
    } catch {
      toast({ title: "Erro ao gerar planilha", variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i))

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FilePlus2 className="h-8 w-8 text-sky-500" />
            Gerar Planilhas
          </h1>
          <p className="text-muted-foreground mt-1">
            Geração automática de planilhas a partir das leituras registradas
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)} className="bg-sky-500 hover:bg-sky-600">
          <FilePlus2 className="h-4 w-4 mr-2" /> Nova Planilha
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar condomínio ou arquivo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Todos os status</option>
              <option value="GENERATING">Gerando</option>
              <option value="READY">Pronta</option>
              <option value="ERROR">Erro</option>
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Todos os meses</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planilhas Geradas</CardTitle>
          <CardDescription>{filtered.length} planilha{filtered.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <FilePlus2 className="h-16 w-16 mb-4" />
              <p className="text-xl font-medium">Nenhuma planilha encontrada</p>
              <p className="text-sm mt-1">Clique em &quot;Nova Planilha&quot; para gerar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Condomínio</th>
                    <th className="text-left py-3 px-2">Competência</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Arquivo</th>
                    <th className="text-left py-3 px-2">Gerada em</th>
                    <th className="text-left py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">{s.complexName || "—"}</td>
                      <td className="py-3 px-2">
                        {s.month && s.year ? `${MONTHS[s.month - 1]}/${s.year}` : "—"}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded font-medium w-fit ${STATUS_COLORS[s.status]}`}>
                          <StatusIcon status={s.status} />
                          {STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {s.fileName ? (
                          <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{s.fileName}</span>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-2">
                        {s.generatedAt
                          ? new Date(s.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                      <td className="py-3 px-2">
                        {s.status === "READY" && s.fileUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={s.fileUrl} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3 mr-1" /> Baixar
                            </a>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={generateOpen} onOpenChange={(open) => { setGenerateOpen(open); if (!open) { setFoundOrder(null); setNewServiceOrderId(""); setNewTemplateId("none") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Nova Planilha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceOrderId">Número ou ID da Ordem de Serviço *</Label>
              <div className="relative">
                <Input
                  id="serviceOrderId"
                  placeholder="Ex: OS-2026-03-A1B2C3 ou cole o ID"
                  value={newServiceOrderId}
                  onChange={(e) => setNewServiceOrderId(e.target.value)}
                />
                {lookingUpOS && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {foundOrder && (
                <div className="rounded-md bg-green-50 border border-green-200 p-2.5 text-sm space-y-1">
                  <div className="flex items-center gap-1.5 text-green-700 font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    {foundOrder.complexSocialName || foundOrder.complexName || "Condomínio"}
                  </div>
                  <div className="flex items-center gap-1.5 text-green-600 text-xs">
                    <Calendar className="h-3 w-3" />
                    {MONTHS[(foundOrder.month || 1) - 1]} / {foundOrder.year}
                    &nbsp;·&nbsp;OS: {foundOrder.orderNumber}
                  </div>
                </div>
              )}
              {!foundOrder && newServiceOrderId.trim().length > 5 && !lookingUpOS && (
                <p className="text-xs text-muted-foreground">
                  OS não encontrada. Verifique o número ou acesse{" "}
                  <a href="/service-orders" className="text-blue-600 hover:underline">Ordens de Serviço</a>.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateId">Modelo de Planilha</Label>
              <Select value={newTemplateId} onValueChange={setNewTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Padrão (sem modelo)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Padrão (sem modelo)</SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newTemplateId && newTemplateId !== "none" && (() => {
                const tmpl = templates.find((t: any) => t.id === newTemplateId)
                if (!tmpl) return null
                return (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 space-y-0.5">
                    <div className="flex items-center gap-1 font-medium">
                      <Info className="h-3 w-3" />
                      Sobre este modelo
                    </div>
                    {tmpl.description && <p>{tmpl.description}</p>}
                    <p>Método de rateio: <strong>{tmpl.rateioMethod === "FRACAO_IDEAL" ? "Fração Ideal" : tmpl.rateioMethod}</strong></p>
                    {tmpl.commonAreaLabel && <p>Área comum: <strong>{tmpl.commonAreaLabel}</strong></p>}
                  </div>
                )
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generating} className="bg-sky-500 hover:bg-sky-600">
              {generating ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><FilePlus2 className="h-4 w-4 mr-2" /> Gerar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
