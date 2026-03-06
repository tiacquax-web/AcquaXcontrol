"use client"

import { useBlocks } from "@/hooks/useBlocks"
import { PermissionableEntity, type Block } from "@prisma/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Building, Home, Activity } from "lucide-react"
import { BlockFull } from "@/types/fullTypes"

interface BlocksListProps {
  complexId?: string
  nameQuery?: string
  viewType: "Cards" | "List"
  setSelectedBlock: (block: Block) => void
}

export default function BlocksList({ complexId, nameQuery, viewType, setSelectedBlock }: BlocksListProps) {
  const { blocks, loading, error } = useBlocks({ 
    complexId, 
    nameQuery, 
    getAvailableForEntity: PermissionableEntity.apartmentConsumptionReport,
    withComplexName: true,
    withApartmentsCount: true,
    withMetersCount: true
  })

  if (loading) {
    return <LoadingSkeleton viewType={viewType} />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.toString()}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {viewType === "Cards" &&
        blocks.map((block) => <BlockCard key={block.id} block={block} onCardClick={setSelectedBlock} />)}
      {viewType === "List" && (
        <ScrollArea className="w-full">
          <table className="w-full">
            <thead className="border-b sticky top-0 bg-background">
              <tr>
                <th className="text-left p-2">Block</th>
                <th className="text-center p-2">Apartments</th>
                <th className="text-center p-2">Meters</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr
                  key={block.id}
                  className="border-b cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setSelectedBlock(block)}
                >
                  <td className="p-2">{block.name}</td>
                  <td className="text-center p-2">30</td>
                  <td className="text-center p-2">40</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  )
}

function BlockCard({ block, onCardClick }: { block: BlockFull; onCardClick: (block: Block) => void }) {
  return (
    <Card
      onClick={() => onCardClick(block)}
      className="cursor-pointer hover:shadow-md transition-all duration-200 h-full"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-full">
            <Building className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="line-clamp-1">{block.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <div className="h-px w-full bg-border" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">{block._count?.apartments||0} Apartamentos</p>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">{(block.apartments ?? []).reduce((acc, apartment) => acc + (apartment._count?.meters || 0), 0)} Medidores</p>
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