"use client"

import {
  Building2,
  ChevronRight,
  Droplets,
  Download,
  Search,
  Gauge,
  AlertTriangle,
  TrendingUp,
  DollarSign
} from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ComplexesList from "@/components/ComplexesList"
import ReservoirsList from "@/components/ReservoirsList"
import { DatePickerComponent } from "@/components/date-picker"
import { useReservoirPermissions, useReservoirStats } from "@/hooks"
import { usePermissionChecker } from "@/hooks/use-permission-checker"
import { PermissionableEntity, type Complex } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { DateRange } from "react-day-picker"
import { useUserContext } from "@/hooks/useUserContext"

const sixMonthsAgo = new Date(new Date().setMonth(new Date().getMonth() - 6))

export default function ReservoirMonitoringPage() {
  const { canViewReservoirReadings } = useReservoirPermissions()
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker()
  const { context: userContext, loading: ctxLoading } = useUserContext()
  const router = useRouter()
  const [selectedComplex, setSelectedComplex] = useState<Complex | undefined>()

  // Auto-selecionar condomínio para síndico com 1 condomínio
  useEffect(() => {
    if (ctxLoading || !userContext || selectedComplex) return
    if (!userContext.isSystem && userContext.complexes.length > 0) {
      const glComplexes = userContext.complexes.filter(c => userContext.glComplexIds?.includes(c.id))
      if (glComplexes.length === 1) {
        setSelectedComplex(glComplexes[0] as Complex)
      }
    }
  }, [ctxLoading, userContext, selectedComplex])

  const hasGLAccess = (() => {
    if (!userContext) return false
    if (userContext.isSystem) return true
    return userContext.glComplexIds && userContext.glComplexIds.length > 0
  })()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: sixMonthsAgo, to: new Date() })
  const [searchText, setSearchText] = useState("")

  // Memoizar o dateRange para evitar re-renderizações desnecessárias
  const memoizedDateRange = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return undefined;
    return { 
      from: dateRange.from, 
      to: dateRange.to 
    };
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  // Hook para buscar estatísticas dos reservatórios do complexo selecionado
  const { stats, loading: loadingStats } = useReservoirStats({
    complexId: selectedComplex?.id,
    dateRange: memoizedDateRange,
    enabled: !!selectedComplex
  })

  // Verificação de permissões — síndicos devem sempre conseguir acessar a aba
  // mesmo que o papel não tenha 'reservoirReading' explícito.
  // Qualquer usuário com acesso a leituras, condomínio ou apartamento pode ver a página
  // (o conteúdo vazio é mostrado quando não há reservatórios vinculados).
  const canAccessPage = canViewReservoirReadings()
    || hasPermission('reading', 'read')
    || hasPermission('complex', 'read')
    || hasPermission('apartment', 'read')
    || hasPermission('dealershipReading', 'read')
    || hasPermission('apartmentConsumptionReport', 'read')

  // Aguardar carregamento das permissões antes de decidir acesso
  if (permissionsLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    )
  }

  // Bloquear usuários sem acesso a condomínios com GL
  if (!ctxLoading && !hasGLAccess) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            O monitoramento de nível está disponível apenas para condomínios com medidores integrados ao sistema.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Bloquear apenas usuários totalmente sem permissão (sem nenhum contexto)
  if (!canAccessPage) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <AlertDescription>
            Você não possui permissão para acessar o monitoramento de níveis dos reservatórios.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Se não há condomínio selecionado, mostra seleção de condomínios
  if (!selectedComplex) {
    return (
      <div className="flex-1 space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Droplets className="h-8 w-8 text-blue-500" />
              Medidores de Nível
            </h1>
            <p className="text-muted-foreground">
              Selecione um condomínio para monitorar os níveis dos reservatórios em tempo real
            </p>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar Condomínios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Nome do condomínio..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="max-w-md"
            />
          </CardContent>
        </Card>

        {/* Lista de Condomínios com Reservatórios */}
        {/* Usa 'reading' como entidade de referência para que síndicos sem
            permissão explícita de reservoirReading consigam ver seus condomínios.
            onlyWithReservoirs filtra apenas condomínios que possuem reservatórios cadastrados. */}
        <ComplexesList
          getAvailableForEntity={PermissionableEntity.reading}
          nameQuery={searchText}
          viewType="Cards"
          setSelectedComplex={(complex) => setSelectedComplex(complex)}
          onlyWithReservoirs={true}
          emptyMessage="Nenhum condomínio com reservatórios cadastrados foi encontrado. Verifique se os reservatórios foram vinculados ao condomínio."
        />
      </div>
    )
  }

  const firstDayYear = new Date(new Date().getFullYear(), 0, 1)
  const daysSinceFirstDayYear = Math.floor((new Date().getTime() - firstDayYear.getTime()) / (1000 * 60 * 60 * 24))

  // Dashboard do condomínio selecionado
  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header com breadcrumb */}
      <div className="flex items-center justify-between flex-wrap">
        <div className="space-y-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedComplex(undefined)}
              className="h-auto p-0 hover:underline"
            >
              Medidores de Nível
            </Button>
            <ChevronRight className="h-4 w-4" />
            <span>{selectedComplex.socialName}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8 text-blue-500" />
            {selectedComplex.socialName}
          </h1>
          <p className="text-muted-foreground">
            Monitoramento dos reservatórios em tempo real
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-2">
          <DatePickerComponent
            isRangeable={true}
            dateRange={dateRange}
            setDateRange={setDateRange}
            minDaysBack={daysSinceFirstDayYear+1}
          />
          {/* <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar Dados
          </Button> */}
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Reservatórios</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? "..." : stats.totalReservoirs}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalReservoirs > 0 ? "Todos monitorados" : "Nenhum reservatório"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nível Médio</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? "..." : `${stats.averageLevel}%`}
            </div>
            <p className={`text-xs ${
              stats.levelTrend === 'up' ? 'text-green-600' : 
              stats.levelTrend === 'down' ? 'text-red-600' : 
              'text-gray-600'
            }`}>
              {stats.levelTrend === 'up' && `↗ +${stats.levelTrendPercent}% desde ontem`}
              {stats.levelTrend === 'down' && `↘ -${stats.levelTrendPercent}% desde ontem`}
              {stats.levelTrend === 'stable' && "→ Estável desde ontem"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-red-600">2 críticos, 1 aviso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Economia Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 2.340</div>
            <p className="text-xs text-green-600">↗ +12% vs mês anterior</p>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Reservatórios */}
      <Card className="md:border md:shadow-sm border-0 shadow-none mx-0">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Droplets className="h-6 w-6" />
            Reservatórios em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent className="md:p-6 p-0">
          <ReservoirsList
            complexId={selectedComplex.id}
            search=""
            viewType="Cards"
            dateRange={memoizedDateRange || { from: sixMonthsAgo, to: new Date() }}
            onReservoirClick={(reservoir) => {
              // Navegar para página de detalhes do reservatório
              console.log("Reservatório selecionado:", reservoir)
            //   router.push(`/reservoir-monitoring/${reservoir.id}`)
            }}
            showReadings={true}
          />
        </CardContent>
      </Card>
    </div>
  )
}
