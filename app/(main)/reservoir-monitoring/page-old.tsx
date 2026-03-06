"use client"

import {
  Building,
  Building2,
  ChevronRight,
  Droplets,
  Filter,
  Calendar,
  Grid3X3,
  List,
  Plus,
  Download,
  Settings,
  Link
} from "lucide-react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ComboboxReservoir from "@/components/ComboboxReservoir"
import ReservoirsList from "@/components/ReservoirsList"
import { DateRangeSelector } from "@/components/date-range-selector"
import { ReservoirFormDialog } from "@/components/ReservoirFormDialog"
import { ReservoirLinkManager } from "@/components/ReservoirLinkManager"
import { useReservoirPermissions } from "@/hooks"

const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30))

export default function ReservoirMonitoringPage() {
  const { hasAnyReservoirPermission, canViewReservoirs, canCreateReservoirs } = useReservoirPermissions()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("")
  const [dateRange, setDateRange] = useState({ from: thirtyDaysAgo, to: new Date() })
  const [searchText, setSearchText] = useState("")
  const [viewType, setViewType] = useState<"Cards" | "List">("Cards")
  const [selectedReservoir, setSelectedReservoir] = useState<string>("")
  const [activeTab, setActiveTab] = useState("monitoring")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Verificação de permissões
  if (!hasAnyReservoirPermission()) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <AlertDescription>
            Você não possui permissão para acessar o monitoramento de reservatórios.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleReservoirSuccess = () => {
    setRefreshKey(prev => prev + 1)
    setShowCreateDialog(false)
  }

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
            Monitore os níveis dos reservatórios em tempo real
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          {canCreateReservoirs() && (
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Reservatório
            </Button>
          )}
        </div>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros e Controles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Date Range */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Buscar</label>
              <Input
                placeholder="Buscar reservatórios..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <DateRangeSelector
                onDateRangeChange={(range) => {
                  setDateRange(range)
                }}
              />
            </div>
          </div>

          <Separator />

          {/* View Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Visualização:</label>
              <Tabs value={viewType} onValueChange={(value) => setViewType(value as "Cards" | "List")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="Cards" className="flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Cards
                  </TabsTrigger>
                  <TabsTrigger value="List" className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Lista
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="text-sm text-muted-foreground">
              Exibindo todos os reservatórios disponíveis
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {canViewReservoirs() && (
        <ReservoirsList
          companyId={selectedCompanyId || undefined}
          search={searchText}
          viewType={viewType}
          dateRange={dateRange}
          onReservoirClick={(reservoir) => {
            console.log('Reservoir clicked:', reservoir)
            // Navigate to detailed view or open modal
          }}
        />
      )}
    </div>
  )
}
