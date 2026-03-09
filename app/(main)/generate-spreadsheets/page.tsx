"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FilePlus2, Download, Search, RefreshCw, CheckCircle, Clock, XCircle, Filter } from "lucide-react"
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
  const [newTemplateId, setNewTemplateId] = useState("")

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterMonth, filterYear])

  const filtered = spreadsheets.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.complexName?.toLowerCase().includes(q) || s.fileName?.toLowerCase().includes(q)
  })

  const handleGenerate = async () => {
    if (!newServiceOrderId.trim()) {
      toast({ title: "Informe o ID da ordem de serviço", variant: "destructive" })
      return
    }
    setGenerating(true)
    try {
      await axiosClient.post("/generated-spreadsheets", {
        serviceOrderId: newServiceOrderId.trim(),
        templateId: newTemplateId.trim() || undefined,
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
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Nova Planilha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceOrderId">ID da Ordem de Serviço *</Label>
              <Input
                id="serviceOrderId"
                placeholder="Cole o ID da ordem de serviço aqui"
                value={newServiceOrderId}
                onChange={(e) => setNewServiceOrderId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Você pode copiar o ID na página de Ordens de Serviço.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateId">Modelo de Planilha (opcional)</Label>
              <Input
                id="templateId"
                placeholder="ID do modelo (deixe vazio para usar o padrão)"
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
              />
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
