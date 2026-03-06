"use client"

import { useApartments } from "@/hooks/useApartments"
import { PermissionableEntity, type Apartment } from "@prisma/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Home, Activity, DoorClosed } from "lucide-react"
import { ApartmentFull } from "@/types/fullTypes"

interface ApartmentsListProps {
  blockId?: string
  nameQuery?: string
  viewType: "Cards" | "List"
  setSelectedApartment: (apartment: Apartment) => void
}

export default function ApartmentsList({ blockId, nameQuery, viewType, setSelectedApartment }: ApartmentsListProps) {
  const { apartments, loading, error } = useApartments({ blockId, nameQuery, getAvailableForEntity: PermissionableEntity.reading, take: 1000, skip: 0, orderBy: 'name', orderDirection: 'asc' })

  if (loading) {
    return <LoadingSkeleton viewType={viewType} />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>{error.toString()}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {viewType === "Cards" &&
        apartments.map((apartment) => <ApartmentCard key={apartment.id} apartment={apartment} onCardClick={setSelectedApartment} />)}
      {viewType === "List" && (
        <ScrollArea className="w-full">
          <table className="w-full">
            <thead className="border-b sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2">Apartmento</th>
                <th className="text-center p-2">Medidores</th>
              </tr>
            </thead>
            <tbody>
              {apartments.map((apartment) => (
                <tr
                  key={apartment.id}
                  className="border-b cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setSelectedApartment(apartment)}
                >
                  <td className="p-2">{apartment.name}</td>
                  <td className="text-center p-2">{apartment._count?.meters || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  )
}

function ApartmentCard({ apartment, onCardClick }: { apartment: ApartmentFull; onCardClick: (apartment: Apartment) => void }) {
  return (
    <Card
      onClick={() => onCardClick(apartment)}
      className="cursor-pointer hover:shadow-md transition-all duration-200 h-full"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-full">
            <DoorClosed className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="line-clamp-1">{apartment.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <div className="h-px w-full bg-border" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">{apartment._count?.meters || 0} Medidores</p>
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
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="bg-muted h-12 w-12 rounded-full animate-pulse" />
                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="h-px w-full bg-border" />
              <div className="space-y-2">
                <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  } else {
    return (
      <div className="w-full">
        <div className="h-10 w-full bg-muted rounded mb-4 animate-pulse" />
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-12 w-full bg-muted rounded mb-2 animate-pulse" />
        ))}
      </div>
    )
  }
}
