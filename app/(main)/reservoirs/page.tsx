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

export default function ReservoirsPage() {
  const { hasAnyReservoirPermission, canViewReservoirs, canCreateReservoirs } = useReservoirPermissions()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("")
  const [searchText, setSearchText] = useState("")
  const [viewType, setViewType] = useState<"Cards" | "List">("Cards")
  const [selectedReservoir, setSelectedReservoir] = useState<string>("")
  const [activeTab, setActiveTab] = useState("management")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Verificação de permissões - precisa ter permissão para ver reservatórios
  if (!canViewReservoirs()) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert>
          <AlertDescription>
            Você não possui permissão para acessar o gerenciamento de reservatórios.
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
            Reservatórios
          </h1>
          <p className="text-muted-foreground">
            Gerencie reservatórios, vinculações e configurações do sistema
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          {canCreateReservoirs() && (
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Reservatório
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Gerenciamento
          </TabsTrigger>
          <TabsTrigger value="linking" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Vinculação de Dispositivos
          </TabsTrigger>
        </TabsList>

        {/* Tab: Gerenciamento */}
        <TabsContent value="management" className="space-y-6">
          {/* Filters and Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros e Controles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and View Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pesquisar</label>
                  <Input
                    placeholder="Nome do reservatório..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Visualização</label>
                  <Tabs value={viewType} onValueChange={(value) => setViewType(value as "Cards" | "List")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="Cards" className="flex items-center gap-1">
                        <Grid3X3 className="h-4 w-4" />
                        Cards
                      </TabsTrigger>
                      <TabsTrigger value="List" className="flex items-center gap-1">
                        <List className="h-4 w-4" />
                        Lista
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content */}
          <ReservoirsList
            key={refreshKey}
            companyId={selectedCompanyId || undefined}
            search={searchText}
            viewType={viewType}
            dateRange={{ from: new Date(), to: new Date() }} // Não precisa de período para gestão
            onReservoirClick={(reservoir) => {
              console.log('Reservoir clicked:', reservoir)
              // Navigate to detailed view or open modal
            }}
            showReadings={false} // Não mostrar leituras na gestão
          />
        </TabsContent>

        {/* Tab: Vinculação de Dispositivos */}
        <TabsContent value="linking" className="space-y-6">
          <ReservoirLinkManager 
            onReservoirLinked={() => setRefreshKey(prev => prev + 1)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ReservoirFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleReservoirSuccess}
      />
    </div>
  )
}
