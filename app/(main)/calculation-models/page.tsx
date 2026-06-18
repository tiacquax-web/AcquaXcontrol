'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useToast } from '@/hooks/use-toast'
import {
  Upload, Plus, ChevronRight, Trash2, Edit2, Check, X,
  AlertCircle, CheckCircle2, Loader2, Building2,
  BookOpen, Settings, Calculator,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TariffTier {
  limitM3: number | null
  pricePerM3: number
  label: string
}

interface ExtraColumn {
  name: string
  type: string
  value?: number
  description: string
}

interface ModelDraft {
  detectedCondominiumName: string
  sourceFileName: string
  tariffTiers: TariffTier[]
  tariffMode: string
  sewagePercent: number
  sewageFormula: string
  commonAreaType: string
  commonAreaFormula: string
  kiteCarEnabled: boolean
  kiteCarType?: string
  extraColumns: ExtraColumn[]
  autoDescription: string
  warnings: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface SavedModel {
  id: string
  name: string
  description: string
  tariffTiers: string
  tariffMode: string
  sewagePercent: number
  commonAreaType: string
  kiteCarEnabled: boolean
  kiteCarType?: string
  extraColumns?: string
  sourceFile?: string
  isActive: boolean
  createdAt: string
  complexModels: { complex: { id: string; socialName: string } }[]
}

interface Complex {
  id: string
  socialName: string
  aliasName?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const COMMON_AREA_LABELS: Record<string, string> = {
  NONE: 'Sem rateio',
  EQUAL: 'Rateio igual',
  FRACTION: 'Fração ideal',
  PROPORTIONAL: 'Proporcional ao consumo',
  INVERSE_PROPORTIONAL: 'Inversamente proporcional',
}

const CONFIDENCE_CONFIG = {
  HIGH: { label: 'Alta confiança', cls: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  MEDIUM: { label: 'Confiança média', cls: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  LOW: { label: 'Revisão necessária', cls: 'bg-red-100 text-red-800', icon: AlertCircle },
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function CalculationModelsPage() {
  const { toast } = useToast()
  const [models, setModels] = useState<SavedModel[]>([])
  const [complexes, setComplexes] = useState<Complex[]>([])
  const [loading, setLoading] = useState(true)

  const [uploading, setUploading] = useState(false)
  const [draft, setDraft] = useState<ModelDraft | null>(null)
  const [showDraftModal, setShowDraftModal] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTiers, setFormTiers] = useState<TariffTier[]>([])
  const [formSewage, setFormSewage] = useState(0)
  const [formCommonArea, setFormCommonArea] = useState('NONE')
  const [formKiteCar, setFormKiteCar] = useState(false)
  const [formKiteCarType, setFormKiteCarType] = useState('PER_UNIT')
  const [formComplexIds, setFormComplexIds] = useState<string[]>([])
  const [formExtraColumns, setFormExtraColumns] = useState<ExtraColumn[]>([])
  const [saving, setSaving] = useState(false)

  const [selectedModel, setSelectedModel] = useState<SavedModel | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // ── Carregar ────────────────────────────────────────────────────────────────

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch('/api/user/calculation-models')
      const data = await res.json()
      setModels(data.models || [])
    } catch { }
  }, [])

  const loadComplexes = useCallback(async () => {
    try {
      const res = await fetch('/api/user/complexes?limit=500')
      const data = await res.json()
      setComplexes(data.list || data.complexes || [])
    } catch { }
  }, [])

  useEffect(() => {
    Promise.all([loadModels(), loadComplexes()]).finally(() => setLoading(false))
  }, [loadModels, loadComplexes])

  // ── Upload ──────────────────────────────────────────────────────────────────

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/user/calculation-models/parse', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar planilha')

      const d: ModelDraft = data.draft
      setDraft(d)
      setFormName('')
      setFormDescription(d.autoDescription)
      setFormTiers(d.tariffTiers)
      setFormSewage(d.sewagePercent)
      setFormCommonArea(d.commonAreaType)
      setFormKiteCar(d.kiteCarEnabled)
      setFormKiteCarType(d.kiteCarType || 'PER_UNIT')
      setFormComplexIds([])
      setFormExtraColumns(d.extraColumns || [])
      setShowDraftModal(true)
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }, [toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  })

  // ── Salvar ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) { toast({ title: 'Dê um nome ao modelo.', variant: 'destructive' }); return }
    if (formTiers.length === 0) { toast({ title: 'Adicione pelo menos uma faixa de tarifa.', variant: 'destructive' }); return }

    setSaving(true)
    try {
      const res = await fetch('/api/user/calculation-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          tariffTiers: formTiers,
          sewagePercent: formSewage,
          commonAreaType: formCommonArea,
          kiteCarEnabled: formKiteCar,
          kiteCarType: formKiteCar ? formKiteCarType : null,
          extraColumns: formExtraColumns,
          sourceFile: draft?.sourceFileName,
          complexIds: formComplexIds.map(id => ({ complexId: id, utilityType: 'water' })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Modelo salvo com sucesso!' })
      setShowDraftModal(false)
      setDraft(null)
      loadModels()
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Excluir ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este modelo?')) return
    try {
      const res = await fetch(`/api/user/calculation-models/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast({ title: 'Modelo removido.' })
      loadModels()
    } catch { toast({ title: 'Erro ao remover.', variant: 'destructive' }) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-teal-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator size={24} className="text-teal-600" />
            Modelos de Cálculo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suba uma planilha para detectar o modelo automaticamente, revise e salve com nome.
          </p>
        </div>
        <Badge variant="outline" className="text-gray-600">
          {models.length} {models.length === 1 ? 'modelo' : 'modelos'}
        </Badge>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-teal-600" size={36} />
            <p className="text-teal-700 font-medium">Analisando planilha...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={36} className="text-gray-400" />
            <div>
              <p className="font-medium text-gray-700">
                {isDragActive ? 'Solte a planilha aqui' : 'Arraste uma planilha aqui'}
              </p>
              <p className="text-sm text-gray-400 mt-1">ou clique para selecionar · apenas .xlsx</p>
            </div>
            <p className="text-xs text-gray-400 max-w-md">
              O sistema detecta automaticamente: tarifas, esgoto, tipo de rateio de área comum e colunas extras
            </p>
          </div>
        )}
      </div>

      {/* Lista de modelos */}
      {models.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700">Modelos salvos</h2>
          {models.map(m => {
            const tiers: TariffTier[] = (() => { try { return JSON.parse(m.tariffTiers) } catch { return [] } })()
            return (
              <Card key={m.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{m.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {COMMON_AREA_LABELS[m.commonAreaType] || m.commonAreaType}
                        </Badge>
                        {m.kiteCarEnabled && (
                          <Badge className="text-xs bg-orange-100 text-orange-700 border-0">🚚 Carro-pipa</Badge>
                        )}
                        {m.sewagePercent > 0 && (
                          <Badge className="text-xs bg-blue-100 text-blue-700 border-0">
                            🚰 Esgoto {m.sewagePercent}%
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1.5 flex gap-2 flex-wrap">
                        {tiers.map((t, i) => (
                          <span key={i} className="text-xs bg-gray-100 rounded px-2 py-0.5 text-gray-600">
                            {t.label}: R$ {t.pricePerM3.toFixed(4)}/m³
                          </span>
                        ))}
                      </div>

                      {m.complexModels.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <Building2 size={12} className="text-gray-400" />
                          {m.complexModels.slice(0, 4).map(cm => (
                            <span key={cm.complex.id} className="text-xs bg-teal-50 text-teal-700 rounded px-2 py-0.5">
                              {cm.complex.socialName}
                            </span>
                          ))}
                          {m.complexModels.length > 4 && (
                            <span className="text-xs text-gray-400">+{m.complexModels.length - 4} mais</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setSelectedModel(m); setShowDetailModal(true) }}
                      >
                        <ChevronRight size={16} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {models.length === 0 && !uploading && (
        <div className="text-center py-16 text-gray-400">
          <Calculator size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">Nenhum modelo salvo ainda.</p>
          <p className="text-sm mt-1">Suba uma planilha para começar.</p>
        </div>
      )}

      {/* ── Modal: Revisão do Draft ── */}
      <Dialog open={showDraftModal} onOpenChange={setShowDraftModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={18} className="text-teal-600" />
              Revisar modelo detectado
            </DialogTitle>
            {draft && (
              <DialogDescription className="flex items-center gap-2 flex-wrap">
                <span>Arquivo: <strong>{draft.sourceFileName}</strong></span>
                {draft.detectedCondominiumName && (
                  <span>· Condomínio detectado: <strong>{draft.detectedCondominiumName}</strong></span>
                )}
                <ConfidenceBadge confidence={draft.confidence} />
              </DialogDescription>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-5 py-2">

              {/* Avisos */}
              {draft?.warnings && draft.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
                  {draft.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-800 flex items-start gap-1.5">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Nome */}
              <div>
                <Label className="text-sm font-medium">
                  Nome do modelo <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="mt-1"
                  placeholder="ex: Tarifa Única IGUÁ — Esgoto 100% — Rateio Igual"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>

              {/* Descritivo */}
              <div>
                <Label className="text-sm font-medium">Descritivo (editável)</Label>
                <Textarea
                  className="mt-1 text-sm font-mono"
                  rows={7}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                />
              </div>

              <Separator />

              {/* Faixas de tarifa */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Faixas de Tarifa</Label>
                <div className="space-y-2">
                  {formTiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className="flex-1 text-sm"
                        placeholder="Label (ex: 0 – 15 m³)"
                        value={t.label}
                        onChange={e => {
                          const tiers = [...formTiers]
                          tiers[i] = { ...t, label: e.target.value }
                          setFormTiers(tiers)
                        }}
                      />
                      <Input
                        className="w-24 text-sm"
                        type="number"
                        placeholder="Limite m³"
                        value={t.limitM3 ?? ''}
                        onChange={e => {
                          const tiers = [...formTiers]
                          tiers[i] = { ...t, limitM3: e.target.value !== '' ? Number(e.target.value) : null }
                          setFormTiers(tiers)
                        }}
                      />
                      <Input
                        className="w-28 text-sm"
                        type="number"
                        step="0.0001"
                        placeholder="R$/m³"
                        value={t.pricePerM3}
                        onChange={e => {
                          const tiers = [...formTiers]
                          tiers[i] = { ...t, pricePerM3: Number(e.target.value) }
                          setFormTiers(tiers)
                        }}
                      />
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                        onClick={() => setFormTiers(formTiers.filter((_, j) => j !== i))}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline" size="sm" className="text-xs"
                    onClick={() => setFormTiers([...formTiers, { limitM3: null, pricePerM3: 0, label: '' }])}
                  >
                    <Plus size={12} className="mr-1" /> Adicionar faixa
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Esgoto + Área Comum */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Esgoto (% do valor água)</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0} max={200} step={5}
                    value={formSewage}
                    onChange={e => setFormSewage(Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-400 mt-1">0 = não cobrado</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Tipo de Área Comum</Label>
                  <Select value={formCommonArea} onValueChange={setFormCommonArea}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COMMON_AREA_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Carro-pipa */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={formKiteCar} onCheckedChange={setFormKiteCar} id="kiteCar" />
                  <Label htmlFor="kiteCar" className="text-sm cursor-pointer">Carro-pipa ativo</Label>
                </div>
                {formKiteCar && (
                  <Select value={formKiteCarType} onValueChange={setFormKiteCarType}>
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PER_UNIT">Igual por unidade</SelectItem>
                      <SelectItem value="PROPORTIONAL">Proporcional ao consumo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Colunas extras */}
              {formExtraColumns.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Colunas adicionais detectadas</Label>
                    <div className="space-y-2">
                      {formExtraColumns.map((ec, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded p-2 text-sm">
                          <span className="font-medium text-gray-700 flex-1">{ec.name}</span>
                          <Badge variant="outline" className="text-xs">{ec.type}</Badge>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-red-400"
                            onClick={() => setFormExtraColumns(formExtraColumns.filter((_, j) => j !== i))}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Vincular condomínios */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Condomínios que usam este modelo
                  <span className="text-gray-400 font-normal ml-1">({formComplexIds.length} selecionados)</span>
                </Label>
                <ComplexSelector
                  complexes={complexes}
                  selected={formComplexIds}
                  onChange={setFormComplexIds}
                />
              </div>

            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t mt-2">
            <Button variant="outline" onClick={() => setShowDraftModal(false)}>Cancelar</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? <Loader2 size={16} className="animate-spin mr-2" />
                : <Check size={16} className="mr-2" />}
              Salvar modelo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Detalhe ── */}
      {selectedModel && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedModel.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <pre className="bg-gray-50 rounded-lg p-3 text-xs whitespace-pre-wrap font-mono text-gray-700 border">
                {selectedModel.description}
              </pre>
              {selectedModel.complexModels.length > 0 && (
                <div>
                  <p className="font-medium text-gray-700 mb-2">Condomínios vinculados:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedModel.complexModels.map(cm => (
                      <Badge key={cm.complex.id} variant="secondary">{cm.complex.socialName}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {selectedModel.sourceFile && (
                <p className="text-xs text-gray-400">Origem: {selectedModel.sourceFile}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const cfg = CONFIDENCE_CONFIG[confidence]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function ComplexSelector({
  complexes, selected, onChange,
}: {
  complexes: Complex[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = complexes.filter(c =>
    c.socialName.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-2 border-b">
        <Input
          placeholder="Buscar condomínio..."
          className="h-8 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <ScrollArea className="h-40">
        <div className="p-1">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 p-2 text-center">Nenhum condomínio encontrado</p>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors
                ${selected.includes(c.id) ? 'bg-teal-50 text-teal-700' : 'text-gray-700'}`}
            >
              {selected.includes(c.id)
                ? <Check size={14} className="text-teal-600 shrink-0" />
                : <div className="w-3.5 h-3.5 shrink-0" />}
              {c.socialName}
            </button>
          ))}
        </div>
      </ScrollArea>
      {selected.length > 0 && (
        <div className="p-2 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-xs text-gray-500">{selected.length} selecionados</span>
          <button
            className="text-xs text-red-500 hover:underline"
            onClick={() => onChange([])}
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  )
}
