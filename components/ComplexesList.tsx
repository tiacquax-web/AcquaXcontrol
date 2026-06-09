"use client"

import { useComplexes } from "@/hooks/useComplexes"
import { PermissionableEntity, type Complex } from "@prisma/client"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, Building2, Home, Activity, ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"
import { ComplexFull } from "@/types/fullTypes"
import { useState } from "react"

interface ComplexesListProps {
  nameQuery?: string
  viewType: "Cards" | "List"
  setSelectedComplex: (complex: Complex) => void
  getAvailableForEntity?: PermissionableEntity
  onlyWithReservoirs?: boolean
  /** Mensagem exibida quando não há condomínios encontrados (estado vazio) */
  emptyMessage?: string
}

export default function ComplexesList({ nameQuery, viewType, setSelectedComplex, getAvailableForEntity = PermissionableEntity.apartmentConsumptionReport, onlyWithReservoirs = false, emptyMessage }: ComplexesListProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(12)
  
  const skip = (currentPage - 1) * itemsPerPage
  const take = itemsPerPage
  
  const { 
    complexes, 
    loading, 
    error, 
    totalCount,
    hasNextPage,
    hasPreviousPage 
  } = useComplexes({ 
    nameQuery, 
    getAvailableForEntity, 
    withBlocksCount: true, 
    withApartmentsCount: true, 
    withMetersCount: true,
    onlyWithReservoirs,
    take,
    skip
  })

  const handleNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1)
    }
  }

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      setCurrentPage(prev => prev - 1)
    }
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  if (loading) {
    return <LoadingSkeleton viewType={viewType} />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load complexes.</AlertDescription>
      </Alert>
    )
  }

  // Estado vazio — sem erros, mas sem dados
  if (!loading && !error && complexes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">
          {emptyMessage || "Nenhum condomínio encontrado."}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {viewType === "Cards" &&
          complexes.map((complex) => <ComplexCard key={complex.id} complex={complex} onCardClick={setSelectedComplex} />)}
        {viewType === "List" && (
          <ScrollArea className="w-full">
            <table className="w-full">
              <thead className="border-b sticky top-0 bg-background">
                <tr>
                  <th className="text-left p-2">Condomínio</th>
                  <th className="text-center p-2">Blocks</th>
                  <th className="text-center p-2">Apartments</th>
                  <th className="text-center p-2">Meters</th>
                </tr>
              </thead>
              <tbody>
                {complexes.map((complex) => (
                  <tr
                    key={complex.id}
                    className="border-b hover:bg-secondary/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedComplex(complex)}
                  >
                    <td className="p-2">{complex.socialName}</td>
                    <td className="text-center p-2">12</td>
                    <td className="text-center p-2">152</td>
                    <td className="text-center p-2">193</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
      
      {/* Componente de Paginação - apenas para Cards */}
      {viewType === "Cards" && totalCount > itemsPerPage && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={!hasPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasNextPage}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Mostrando {Math.min(skip + 1, totalCount)} - {Math.min(skip + take, totalCount)} de {totalCount} condomínios
          </div>
        </div>
      )}
    </div>
  )
}

function ComplexCard({ complex, onCardClick }: { complex: ComplexFull; onCardClick: (complex: Complex) => void }) {
  return (
    <Card
      onClick={() => onCardClick(complex)}
      className="cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden h-full"
    >
      <div className="relative aspect-square w-full">
        <Image
          fill
          src="/placeholder.svg?height=300&width=300"
          alt={complex.socialName}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
      <CardContent className="p-4 space-y-3">
        <CardTitle className="line-clamp-1 text-lg">{complex.socialName}</CardTitle>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">{complex._count?.blocks ?? 0} Blocos</p>
          </div>
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {complex.blocks?.reduce((total, block) => total + (block._count?.apartments ?? 0), 0) ?? 0} Apartamentos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {complex.blocks?.reduce(
                (total, block) =>
                  total +
                  (block.apartments? block.apartments.reduce((aptTotal, apartment) => aptTotal + (apartment._count?.meters ?? 0), 0) : 0),
                0
              ) ?? 0}{" "}
              Medidores
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton({ viewType }: { viewType: "Cards" | "List" }) {
  if (viewType === "Cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <div className="aspect-square w-full bg-muted animate-pulse" />
            <CardContent className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-muted rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 w-1/2 bg-muted rounded animate-pulse"></div>
                <div className="h-4 w-2/3 bg-muted rounded animate-pulse"></div>
                <div className="h-4 w-1/2 bg-muted rounded animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  } else {
    return (
      <div className="w-full">
        <div className="h-10 w-full bg-muted rounded mb-4 animate-pulse"></div>
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-12 w-full bg-muted rounded mb-2 animate-pulse"></div>
        ))}
      </div>
    )
  }
}

