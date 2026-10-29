"use client"

// Auto-cadastro público de moradores pelo link do condomínio.
// O morador escolhe bloco e unidade (unidades já cadastradas ficam cinza) e
// cria o próprio acesso. Uma unidade só aceita um cadastro.

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import { Loader2, CheckCircle2, AlertCircle, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Apt = { id: string; name: string; taken: boolean }
type Block = { id: string; name: string; apartments: Apt[] }
type Data = { complex: { name: string }; blocks: Block[] }

export default function PublicRegisterPage() {
  const params = useParams()
  const token = String(params?.token || "")

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [blockId, setBlockId] = useState("")
  const [apartmentId, setApartmentId] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; email: string; unit: string } | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/register/${token}`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json?.error || "Erro ao carregar")
        return json as Data
      })
      .then((d) => {
        setData(d)
        if (d.blocks.length === 1) setBlockId(d.blocks[0].id)
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const block = data?.blocks.find(b => b.id === blockId)
  const selectedApt = block?.apartments.find(a => a.id === apartmentId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!blockId || !apartmentId) { setError("Selecione bloco e unidade."); return }
    if (password !== confirm) { setError("As senhas não conferem."); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/register/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, apartmentId, name, email, phone, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erro ao criar o cadastro")
      setDone({ name: json.name, email: json.email, unit: json.unit })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <Image src="/logo-acquax.png" alt="AcquaX" width={140} height={48} />
          </div>
          <CardTitle className="text-xl">
            {data?.complex?.name ? `Cadastro de morador - ${data.complex.name}` : "Cadastro de morador"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">Escolha sua unidade e crie seu acesso ao AcquaXcontrol.</p>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando condomínio...
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {!loading && !loadError && done && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <div>
                <p className="font-semibold">Cadastro confirmado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {done.name}, seu acesso da unidade {done.unit} foi criado com o e-mail {done.email}.
                </p>
              </div>
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-6 text-sm font-medium"
              >
                Ir para o login
              </a>
            </div>
          )}

          {!loading && !loadError && !done && data && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {data.blocks.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="block">Bloco</Label>
                  <select
                    id="block"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={blockId}
                    onChange={(e) => { setBlockId(e.target.value); setApartmentId("") }}
                    required
                  >
                    <option value="">Selecione o bloco</option>
                    {data.blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {block && (
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-1">
                    {block.apartments.map(a => {
                      const disabled = a.taken
                      const selected = apartmentId === a.id
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setApartmentId(a.id)}
                          title={disabled ? "Unidade já cadastrada" : `Unidade ${a.name}`}
                          className={
                            "h-10 rounded-md border text-sm font-medium transition-colors " +
                            (disabled
                              ? "bg-muted text-muted-foreground/50 border-border cursor-not-allowed line-through"
                              : selected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background hover:bg-accent border-input")
                          }
                        >
                          {a.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Unidades em cinza já possuem cadastro. Se você é o morador, use "Esqueci minha senha" no login.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required minLength={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Celular (opcional)</Label>
                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar senha</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || !selectedApt}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Criando cadastro...</> : "Criar meu cadastro"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Ao se cadastrar você concorda com a{" "}
                <a href="/politica-de-privacidade" className="underline">Política de Privacidade</a>.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
