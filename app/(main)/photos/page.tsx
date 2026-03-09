"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Camera, Search, Filter, ZoomIn, Trash2, Upload } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import axiosClient from "@/services/axiosClient"
import { toast } from "@/hooks/use-toast"

interface FieldPhoto {
  id: string
  url: string
  thumbnailUrl?: string
  fileName?: string
  photoType: "METER" | "FACADE" | "OTHER"
  caption?: string
  complexId?: string
  complexName?: string
  apartmentId?: string
  apartmentName?: string
  month?: number
  year?: number
  takenAt?: string
  createdAt: string
}

const PHOTO_TYPE_LABELS: Record<string, string> = {
  METER: "Medidor",
  FACADE: "Fachada",
  OTHER: "Outro",
}

const PHOTO_TYPE_COLORS: Record<string, string> = {
  METER: "bg-blue-100 text-blue-800",
  FACADE: "bg-green-100 text-green-800",
  OTHER: "bg-gray-100 text-gray-800",
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function PhotosPage() {
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<string>("")
  const [filterMonth, setFilterMonth] = useState<string>("")
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()))
  const [selectedPhoto, setSelectedPhoto] = useState<FieldPhoto | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const loadPhotos = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterType) params.photoType = filterType
      if (filterMonth) params.month = filterMonth
      if (filterYear) params.year = filterYear
      const res = await axiosClient.get<{ list: FieldPhoto[] }>("/field-photos", { params })
      setPhotos(res.data.list || [])
    } catch {
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterMonth, filterYear])

  const filtered = photos.filter((p) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.fileName?.toLowerCase().includes(s) ||
      p.caption?.toLowerCase().includes(s) ||
      p.complexName?.toLowerCase().includes(s) ||
      p.apartmentName?.toLowerCase().includes(s)
    )
  })

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta foto?")) return
    try {
      await axiosClient.delete(`/field-photos/${id}`)
      toast({ title: "Foto excluída" })
      loadPhotos()
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" })
    }
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i))

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Camera className="h-8 w-8 text-sky-500" />
            Fotos de Campo
          </h1>
          <p className="text-muted-foreground mt-1">
            Galeria de fotos tiradas nas ordens de serviço
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar foto, condomínio, apartamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Todos os tipos</option>
              <option value="METER">Medidor</option>
              <option value="FACADE">Fachada</option>
              <option value="OTHER">Outro</option>
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
            <Button variant="outline" size="sm" onClick={loadPhotos}>
              <Filter className="h-4 w-4 mr-1" /> Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="text-sm text-muted-foreground mb-4">
        {filtered.length} foto{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
      </div>

      {/* Photo Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Camera className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-xl font-medium text-muted-foreground">Nenhuma foto encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              As fotos aparecem aqui após serem registradas nas Ordens de Serviço.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer hover:ring-2 hover:ring-sky-500 transition-all"
              onClick={() => { setSelectedPhoto(photo); setLightboxOpen(true) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbnailUrl || photo.url}
                alt={photo.caption || photo.fileName || "Foto"}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logo-acquax.png"
                }}
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                <ZoomIn className="h-6 w-6 text-white" />
              </div>
              {/* Type badge */}
              <div className="absolute top-1 left-1">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PHOTO_TYPE_COLORS[photo.photoType]}`}>
                  {PHOTO_TYPE_LABELS[photo.photoType]}
                </span>
              </div>
              {/* Delete button */}
              <button
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); handleDelete(photo.id) }}
                title="Excluir"
                type="button"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-sky-500" />
              {selectedPhoto?.caption || selectedPhoto?.fileName || "Foto"}
            </DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption || "Foto"}
                className="w-full max-h-[60vh] object-contain rounded-lg bg-muted"
              />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <Badge variant="outline">{PHOTO_TYPE_LABELS[selectedPhoto.photoType]}</Badge>
                </div>
                {selectedPhoto.complexName && (
                  <div>
                    <span className="text-muted-foreground">Condomínio:</span>{" "}
                    {selectedPhoto.complexName}
                  </div>
                )}
                {selectedPhoto.apartmentName && (
                  <div>
                    <span className="text-muted-foreground">Apartamento:</span>{" "}
                    {selectedPhoto.apartmentName}
                  </div>
                )}
                {selectedPhoto.month && selectedPhoto.year && (
                  <div>
                    <span className="text-muted-foreground">Competência:</span>{" "}
                    {MONTHS[selectedPhoto.month - 1]}/{selectedPhoto.year}
                  </div>
                )}
                {selectedPhoto.takenAt && (
                  <div>
                    <span className="text-muted-foreground">Tirada em:</span>{" "}
                    {new Date(selectedPhoto.takenAt).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" asChild>
                  <a href={selectedPhoto.url} download target="_blank" rel="noopener noreferrer">
                    <Upload className="h-4 w-4 mr-1" /> Baixar
                  </a>
                </Button>
                <Button variant="destructive" onClick={() => { handleDelete(selectedPhoto.id); setLightboxOpen(false) }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
