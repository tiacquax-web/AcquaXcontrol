"use client"

// Gestão dos links públicos de auto-cadastro de moradores por condomínio.

import { useEffect, useMemo, useState } from "react"
import { Copy, Link2, Loader2, Search, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

type Invite = {
  id: string
  token: string
  active: boolean
  createdAt: string
  complexId: string
  complexName: string
  url: string
}

type ComplexOption = { id: string; socialName: string }

export default function RegistrationLinksPage() {
  const { toast } = useToast()
  const [invites, setInvites] = useState<Invite[]>([])
  const [complexes, setComplexes] = useState<ComplexOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [generating, setGenerating] = useState<string | null>(null)

  async function loadInvites() {
    const r = await fetch("/api/user/registration-invites")
    const j = await r.json()
    setInvites(j.list || [])
  }

  useEffect(() => {
    Promise.all([
      loadInvites(),
      fetch("/api/user/complexes?take=200&skip=0").then(r => r.json()).then(j => (j.list || j || [])).catch(() => []),
    ]).then(([, cx]) => {
      setComplexes(cx)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return complexes.slice(0, 20)
    return complexes.filter(c => (c.socialName || "").toLowerCase().includes(q)).slice(0, 30)
  }, [complexes, search])

  const invitesByComplex = useMemo(() => {
    const map = new Map<string, Invite>()
    invites.forEach(i => { if (!map.has(i.complexId)) map.set(i.complexId, i) })
    return map
  }, [invites])

  async function generate(complexId: string) {
    setGenerating(complexId)
    try {
      const r = await fetch("/api/user/registration-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || "Erro ao gerar link")
      await loadInvites()
      await navigator.clipboard.writeText(j.url).catch(() => {})
      toast({ title: "Link gerado", description: "O link já foi copiado para a área de transferência." })
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    } finally {
      setGenerating(null)
    }
  }

  async function toggle(invite: Invite) {
    try {
      const r = await fetch(`/api/user/registration-invites/${invite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !invite.active }),
      })
      if (!r.ok) throw new Error((await r.json())?.error || "Erro")
      await loadInvites()
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "Copiado", description: "Link copiado para a área de transferência." }))
      .catch(() => toast({ title: "Não foi possível copiar", description: url, variant: "destructive" }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6" /> Links de cadastro
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gere um link por condomínio para o síndico divulgar aos moradores. Cada unidade só aceita <strong>um</strong> cadastro —
          unidades já cadastradas aparecem indisponíveis para novos moradores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar link</CardTitle>
          <CardDescription>Busque o condomínio pelo nome.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar condomínio..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {loading ? (
            <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...</div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
              {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum condomínio encontrado.</p>}
              {filtered.map(c => {
                const inv = invitesByComplex.get(c.id)
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.socialName || "(sem nome)"}</p>
                      {inv && (
                        <p className="text-xs text-muted-foreground truncate">{inv.url}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inv ? (
                        <>
                          <Badge variant={inv.active ? "default" : "secondary"}>{inv.active ? "ativo" : "inativo"}</Badge>
                          <Button variant="outline" size="sm" onClick={() => copy(inv.url)}>
                            <Copy className="h-4 w-4 mr-1" /> Copiar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggle(inv)} title={inv.active ? "Desativar" : "Ativar"}>
                            <Power className={`h-4 w-4 ${inv.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => generate(c.id)} disabled={generating === c.id}>
                          {generating === c.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                          Gerar link
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links existentes</CardTitle>
          <CardDescription>{invites.length} link(s) gerado(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {invites.map(i => (
                <div key={i.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{i.complexName}</p>
                    <p className="text-xs text-muted-foreground truncate">{i.url}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={i.active ? "default" : "secondary"}>{i.active ? "ativo" : "inativo"}</Badge>
                    <Button variant="outline" size="sm" onClick={() => copy(i.url)}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle(i)} title={i.active ? "Desativar" : "Ativar"}>
                      <Power className={`h-4 w-4 ${i.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
