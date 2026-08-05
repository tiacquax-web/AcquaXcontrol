"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Settings, Eye, EyeOff, RotateCcw, Save, Check, LayoutDashboard,
  Building2, Users, ShieldCheck, DoorClosed, Gauge, Droplets,
  FileText, TrendingUp, Receipt, ClipboardList, BellDot, Key,
  Radio, HousePlus, DatabaseZap, BookOpen, MessageSquare, Lightbulb,
  CircleGauge, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from "@/components/ui/use-toast"

// Mesma estrutura do sidebar, mas simplificada para customização
const ROLE_TYPES = ['morador', 'sindico', 'administradora', 'programador', 'administrador'] as const
type RoleType = typeof ROLE_TYPES[number]

const ROLE_LABELS: Record<RoleType, string> = {
  morador: 'Morador',
  sindico: 'Síndico',
  administradora: 'Administradora',
  programador: 'Programador',
  administrador: 'Administrador',
}

const ROLE_COLORS: Record<RoleType, string> = {
  morador: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  sindico: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  administradora: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  programador: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  administrador: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

// Lista de todas as abas do sidebar (mesma estrutura do app-sidebar.tsx)
interface TabDef {
  title: string
  url: string
  group: string
  icon: any
}

const ALL_TABS: TabDef[] = [
  { title: 'Início', url: '/dashboard', group: 'Geral', icon: LayoutDashboard },
  { title: 'Relatórios', url: '/apartment-report', group: 'Geral', icon: TrendingUp },
  { title: 'Contas', url: '/dealership-readings', group: 'Geral', icon: Receipt },
  { title: 'Leituras', url: '/readings', group: 'Geral', icon: CircleGauge },
  { title: 'Filipeta Medição', url: '/meter-report', group: 'Geral', icon: FileText },
  { title: 'Levantamento', url: '/levantamento', group: 'Geral', icon: TrendingUp },
  { title: 'Monitoramento', url: '/monitoring', group: 'Geral', icon: Gauge },
  { title: 'Central de Alertas', url: '/alerts', group: 'Geral', icon: BellDot },
  { title: 'Medidores de Nível', url: '/reservoir-monitoring', group: 'Geral', icon: Droplets },
  { title: 'Apuração', url: '/apuracao', group: 'Geral', icon: ClipboardList },
  { title: 'Guia de Uso', url: '/guia', group: 'Geral', icon: BookOpen },
  { title: 'Suporte', url: '/suporte', group: 'Geral', icon: MessageSquare },
  { title: 'Sugestões', url: '/sugestoes', group: 'Geral', icon: Lightbulb },
  { title: 'API', url: '/api-manager', group: 'Integrações', icon: Key },
  // Cadastros
  { title: 'Administradoras', url: '/companies', group: 'Cadastros', icon: HousePlus },
  { title: 'Condomínios', url: '/complexes', group: 'Cadastros', icon: Building2 },
  { title: 'Blocos', url: '/blocks', group: 'Cadastros', icon: Building2 },
  { title: 'Apartamentos', url: '/apartments', group: 'Cadastros', icon: DoorClosed },
  { title: 'Medidores', url: '/meters', group: 'Cadastros', icon: Gauge },
  { title: 'IOTs', url: '/devices', group: 'Cadastros', icon: Radio },
  { title: 'GroupLink (GL)', url: '/gl-integration', group: 'Cadastros', icon: DatabaseZap },
  { title: 'Reservatórios', url: '/reservoirs', group: 'Cadastros', icon: Droplets },
  { title: 'Usuários', url: '/users', group: 'Cadastros', icon: Users },
  { title: 'Papéis', url: '/roles', group: 'Cadastros', icon: ShieldCheck },
]

// Configuração padrão (visa o que já existe hoje no sistema)
const DEFAULT_CONFIG: Record<string, Record<RoleType, boolean>> = {
  // Geral
  '/dashboard':          { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/apartment-report':   { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/dealership-readings':{ morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/readings':           { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/meter-report':       { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/levantamento':       { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/monitoring':         { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/alerts':              { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/reservoir-monitoring':{ morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/apuracao':           { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/guia':               { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/suporte':            { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/sugestoes':          { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/api-manager':        { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  // Cadastros
  '/companies':          { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/complexes':          { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/blocks':             { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/apartments':         { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/meters':             { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/devices':            { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  '/gl-integration':     { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  '/reservoirs':         { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/users':              { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/roles':              { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
}

export default function RoleCustomizationPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, Record<RoleType, boolean>>>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Carregar config salva do localStorage (por enquanto)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('role-tab-config')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Merge com defaults para garantir que novas abas apareçam
        const merged = { ...DEFAULT_CONFIG }
        Object.keys(merged).forEach(url => {
          if (parsed[url]) merged[url] = parsed[url]
        })
        setConfig(merged)
      }
    } catch {}
    setLoading(false)
  }, [])

  const toggleTab = (url: string, role: RoleType) => {
    setConfig(prev => ({
      ...prev,
      [url]: {
        ...prev[url],
        [role]: !prev[url][role],
      },
    }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      localStorage.setItem('role-tab-config', JSON.stringify(config))
      setDirty(false)
      toast({ title: 'Configuração salva! As abas serão atualizadas para cada tipo de usuário.' })
    } catch {
      toast({ title: 'Erro ao salvar configuração' })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setConfig(DEFAULT_CONFIG)
    setDirty(true)
    toast({ title: 'Configuração resetada para o padrão. Clique em Salvar para confirmar.' })
  }

  const groups = [...new Set(ALL_TABS.map(t => t.group))]

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold">Personalização de Perfis</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Alterações não salvas
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Resetar
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Skeleton className="h-4 w-16" /> : dirty ? <><Save className="w-3.5 h-3.5 mr-1" /> Salvar</> : <><Check className="w-3.5 h-3.5 mr-1" /> Salvo</>}
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Eye className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Marque ou desmarque quais abas cada tipo de usuário pode ver no menu lateral.</p>
              <p>Use o seletor <strong>"Visualizar como..."</strong> no menu lateral para testar como cada perfil vê o sistema.</p>
              <p className="text-blue-600">
                <Link href="/dashboard" className="inline-flex items-center gap-1 hover:underline">
                  Ir para o dashboard e testar <ChevronRight className="w-3 h-3" />
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de configuração */}
      {groups.map(group => (
        <Card key={group}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {group === 'Cadastros' && <Building2 className="w-4 h-4 text-orange-500" />}
              {group === 'Geral' && <LayoutDashboard className="w-4 h-4 text-blue-500" />}
              {group === 'Integrações' && <Key className="w-4 h-4 text-purple-500" />}
              {group}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Aba</th>
                    {ROLE_TYPES.map(role => (
                      <th key={role} className="text-center py-2 px-2 min-w-[90px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}>
                            {ROLE_LABELS[role]}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_TABS.filter(t => t.group === group).map(tab => (
                    <tr key={tab.url} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <tab.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium">{tab.title}</span>
                        </div>
                      </td>
                      {ROLE_TYPES.map(role => {
                        const visible = config[tab.url]?.[role] ?? false
                        return (
                          <td key={role} className="text-center py-2 px-2">
                            <button
                              onClick={() => toggleTab(tab.url, role)}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-all ${
                                visible
                                  ? 'bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200 dark:hover:bg-green-900'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
                              }`}
                              title={visible ? `${ROLE_LABELS[role]} vê esta aba` : `${ROLE_LABELS[role]} não vê esta aba`}
                            >
                              {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Resumo por perfil */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Resumo por Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {ROLE_TYPES.map(role => {
              const visibleTabs = ALL_TABS.filter(t => config[t.url]?.[role]).length
              const hiddenTabs = ALL_TABS.length - visibleTabs
              return (
                <div key={role} className="rounded-xl border p-3 text-center">
                  <div className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-2 ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </div>
                  <p className="text-2xl font-bold text-foreground">{visibleTabs}</p>
                  <p className="text-[10px] text-muted-foreground">abas visíveis</p>
                  {hiddenTabs > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">{hiddenTabs} oculta{hiddenTabs !== 1 ? 's' : ''}</p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
