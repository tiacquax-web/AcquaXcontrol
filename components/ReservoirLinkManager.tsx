'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Building2, Link, Unlink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import ComboboxComplex from '@/components/ComboboxComplex'

interface UnlinkedReservoir {
  id: string
  name: string
  telegramChannel: string
  type: string
  description?: string
  location?: string
  createdAt: string
}

interface ReservoirLinkManagerProps {
  onReservoirLinked?: () => void
}

export function ReservoirLinkManager({ onReservoirLinked }: ReservoirLinkManagerProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [reservoirs, setReservoirs] = useState<UnlinkedReservoir[]>([])
  const [selectedComplexId, setSelectedComplexId] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [linkingReservoirId, setLinkingReservoirId] = useState<string | null>(null)

  // Cargar reservatórios não vinculados
  const fetchUnlinkedReservoirs = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reservoirs/unlinked?search=${encodeURIComponent(searchTerm)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar reservatórios')
      }

      setReservoirs(data.reservoirs || [])
    } catch (error: any) {
      console.error('Error fetching unlinked reservoirs:', error)
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao carregar reservatórios',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Vincular reservatório a condomínio
  const linkReservoir = async (reservoirId: string) => {
    if (!selectedComplexId) {
      toast({
        title: 'Erro',
        description: 'Selecione um condomínio primeiro',
        variant: 'destructive',
      })
      return
    }

    setLinkingReservoirId(reservoirId)
    try {
      const response = await fetch(`/api/reservoirs/${reservoirId}/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ complexId: selectedComplexId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao vincular reservatório')
      }

      toast({
        title: 'Sucesso',
        description: data.message || 'Reservatório vinculado com sucesso',
      })

      // Recarregar lista
      fetchUnlinkedReservoirs()
      onReservoirLinked?.()

    } catch (error: any) {
      console.error('Error linking reservoir:', error)
      toast({
        title: 'Erro',
        description: error.message || 'Erro interno do servidor',
        variant: 'destructive',
      })
    } finally {
      setLinkingReservoirId(null)
    }
  }

  // Buscar quando o termo de pesquisa mudar
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      fetchUnlinkedReservoirs()
    }, 300)

    return () => clearTimeout(delayedSearch)
  }, [searchTerm])

  // Carregar inicialmente
  useEffect(() => {
    fetchUnlinkedReservoirs()
  }, [])

  const getTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      'WATER_TANK': 'Caixa d\'água',
      'CISTERN': 'Cisterna',
      'POOL': 'Piscina',
      'FOUNTAIN': 'Chafariz',
      'EMERGENCY_TANK': 'Reserva de Emergência',
      'TREATMENT_TANK': 'Tanque de Tratamento',
    }
    return types[type] || type
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Vincular Reservatórios
          </h2>
          <p className="text-muted-foreground">
            Gerencie a vinculação de reservatórios a condomínios
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações</CardTitle>
          <CardDescription>
            Selecione o condomínio e pesquise por reservatórios não vinculados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seletor de Condomínio */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Condomínio de Destino</label>
              <ComboboxComplex
                setSelectedComplex={(complex) => setSelectedComplexId(complex?.id || '')}
                complex={selectedComplexId ? { id: selectedComplexId } : undefined}
              />
            </div>

            {/* Pesquisa */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pesquisar Reservatórios</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome do reservatório..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Reservatórios */}
      <Card>
        <CardHeader>
          <CardTitle>Reservatórios Sem Vinculação</CardTitle>
          <CardDescription>
            {reservoirs.length} reservatório(s) encontrado(s) sem vinculação a condomínios
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Carregando reservatórios...</span>
            </div>
          ) : reservoirs.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Nenhum reservatório encontrado com este termo' : 'Nenhum reservatório sem vinculação encontrado'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reservoirs.map((reservoir) => (
                <Card key={reservoir.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{reservoir.name}</CardTitle>
                      <Badge variant="outline">{getTypeLabel(reservoir.type)}</Badge>
                    </div>
                    <CardDescription className="text-sm">
                      Canal: {reservoir.telegramChannel}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      {reservoir.location && (
                        <p><span className="font-medium">Local:</span> {reservoir.location}</p>
                      )}
                      {reservoir.description && (
                        <p><span className="font-medium">Descrição:</span> {reservoir.description}</p>
                      )}
                      <p className="text-muted-foreground">
                        Criado em: {new Date(reservoir.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    
                    <div className="mt-4">
                      <Button
                        onClick={() => linkReservoir(reservoir.id)}
                        disabled={!selectedComplexId || linkingReservoirId === reservoir.id}
                        className="w-full"
                        size="sm"
                      >
                        {linkingReservoirId === reservoir.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Vinculando...
                          </>
                        ) : (
                          <>
                            <Link className="mr-2 h-4 w-4" />
                            Vincular ao Condomínio
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
