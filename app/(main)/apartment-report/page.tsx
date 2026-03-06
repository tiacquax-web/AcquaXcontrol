"use client"

import {
  Building,
  Building2,
  BuildingIcon as Buildings,
  ChevronRight,
  DoorClosed,
  Download,
  Filter,
  HomeIcon as House,
  Search,
} from "lucide-react"
import { useState } from "react"
import { PermissionableEntity, type Block, type Complex } from "@prisma/client"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import EnhancedCarousel from "@/components/services-carousel"
import ComplexesCombobox from "@/components/ComboboxComplex"
import BlocksCombobox from "@/components/ComboboxBlock"
import BlocksList from "@/components/BlocksList"
import ComplexesList from "@/components/ComplexesList"
import ApartmentsAndReportsList from "@/components/apartments-and-reports-list"
import { DateRangeSelector } from "@/components/date-range-selector"
import { itemsList as ServicesList } from "@/store/demo"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const viewTypeNames = {
  Cards: "Cards",
  List: "Lista",
}
const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30))

export default function ReadingsPage() {
  const [searchType, setSearchType] = useState<"cards" | "table">("cards")

  const [selection, setSelection] = useState<{ complex: Complex | undefined; block: Block | undefined }>({
    complex: undefined,
    block: undefined,
  })
  const { complex: selectedComplex, block: selectedBlock } = selection

  const [dateRange, setDateRange] = useState({ from: thirtyDaysAgo, to: new Date() })

  const [searchText, setSearchText] = useState("")
  const [complexSearchText, setComplexSearchText] = useState("")
  const [viewType, setViewType] = useState<"Cards" | "List">("Cards")
  const [selectedReports, setSelectedReports] = useState<string[]>([])
  const [utilityType, setUtilityType] = useState<'all' | 'water' | 'gas'>('all')

  const viewTypeName = viewTypeNames[viewType]

  const setSelectedComplex = (complex: Complex | undefined) => {
    setSelection({ complex, block: undefined })
  }

  const setSelectedBlock = (block: Block | undefined) => {
    setSelection({ complex: selectedComplex, block })
  }

  const handleDateRangeChange = (range: { from: Date; to: Date }) => {
    setDateRange(range)
  }
  
  const ApartmentReportFilteringCard = (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Filter />
            <span>Relatórios de Apartamento</span>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => setSearchType(searchType == "cards" ? "table" : "cards")}
            className="h-9 px-0"
          >
            {searchType == "cards" ? "Ver Tabela Completa" : "Navegar por Cards"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 md:flex md:flex-wrap md:space-y-0 gap-5">
        <div className="flex items-center space-x-2">
          <ComplexesCombobox
            setSelectedComplex={setSelectedComplex}
            complex={selectedComplex}
            getAvailableForEntity={PermissionableEntity.apartmentConsumptionReport}
          />
        </div>
        {selectedComplex?.id && (
          <div className="flex items-center space-x-2">
            <BlocksCombobox complexId={selectedComplex.id} setSelectedBlock={setSelectedBlock} block={selectedBlock} />
          </div>
        )}
        {selectedBlock?.id && (
          <div className="flex items-center space-x-2">
            <div className="relative w-full">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <DoorClosed className="h-5 w-5" />
              </span>
              <Input
                type="text"
                placeholder="Apartamento"
                className="border border-gray-300 rounded-md w-full p-2 pl-10 "
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
        )}
        <DateRangeSelector onDateRangeChange={handleDateRangeChange} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tipo</span>
          <Select value={utilityType} onValueChange={(v: 'all' | 'water' | 'gas') => setUtilityType(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="water">Água</SelectItem>
              <SelectItem value="gas">Gás</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-9">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </CardContent>
    </Card>
  )

  const LevelSearchBreadcrumb = (
    <div>
      <Button
        variant="link"
        size="sm"
        className="px-1"
        onClick={() => setSearchType(searchType == "cards" ? "table" : "cards")}
      >
        {searchType == "cards" ? "Ver Tabela Completa" : "Navegar por Cards"}
      </Button>

      <div className="flex items-center space-x-1">
        <Button
          variant="link"
          className="flex items-center px-1 mx-0 py-1"
          onClick={() => setSelectedComplex(undefined)}
        >
          <Building2 />{" "}
          <span>
            {selectedComplex?.socialName?.length
              ? selectedComplex.socialName.length > 12
                ? `${selectedComplex.socialName.slice(0, 12)}...`
                : selectedComplex.socialName
              : "Condomínios"}
          </span>
        </Button>

        {selectedComplex?.id && (
          <>
            <ChevronRight className="text-muted-foreground" width={15} />
            <Button
              variant="link"
              className="flex items-center px-1 mx-0 py-1"
              onClick={() => setSelectedBlock(undefined)}
            >
              <Building />{" "}
              <span>
                {selectedBlock
                  ? selectedBlock.name.length > 12
                    ? `${selectedBlock.name.slice(0, 12)}...`
                    : selectedBlock.name
                  : "Blocos"}
              </span>
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8 w-full md:py-6">
      <section className="container mx-auto px-4 md:px-6 space-y-6">
        {/* <h1 className="text-3xl font-bold mb-6 md:hidden text-center pt-0 mt-0">Relatórios</h1> */}

        {searchType == "table" && ApartmentReportFilteringCard}

        {searchType == "cards" && LevelSearchBreadcrumb}

        {searchType == "cards" && <DateRangeSelector onDateRangeChange={handleDateRangeChange} />}

        {searchType == "cards" && !selectedComplex?.id && (
          <>
            <div className="mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Pesquisar condomínios..."
                  className="pl-10"
                  value={complexSearchText}
                  onChange={(e) => setComplexSearchText(e.target.value)}
                />
              </div>
            </div>
            <ComplexesList 
              viewType="Cards" 
              setSelectedComplex={setSelectedComplex} 
              nameQuery={complexSearchText}
            />
          </>
        )}

        {searchType == "cards" && selectedComplex?.id && !selectedBlock?.id && (
          <BlocksList viewType="Cards" complexId={selectedComplex.id} setSelectedBlock={setSelectedBlock} />
        )}

        {selectedComplex?.id && selectedBlock?.id && (
          <ApartmentsAndReportsList
            complexId={selectedComplex.id}
            blockId={selectedBlock.id}
            search={searchText}
            viewType={searchType === "table" ? "List" : viewType}
            dateRange={dateRange}
            selectedReports={selectedReports}
            setSelectedReports={setSelectedReports}
            utilityType={utilityType}
            onUtilityTypeChange={setUtilityType}
          />
        ) || (
          <div className="text-center text-muted-foreground">
            <span>
              {selectedBlock?.id
                ? <>
                    <Building2 className="inline-block mr-2" />
                    <span>Selecione um condomínio para ver os blocos.</span>
                  </>
                : selectedComplex?.id
                  ? <>
                    <Building className="inline-block mr-2" />
                    <span>Selecione um bloco para ver os apartamentos.</span>
                  </>
                  : <>
                    <Building2 className="inline-block mr-2" />
                    <span>Selecione um condomínio para ver os blocos e apartamentos.</span>
                  </>
              }
            </span>
          </div>
          )}
      </section>

      <Separator className="my-8" />

      <section className="container mx-auto px-4 md:px-6">
        <EnhancedCarousel items={ServicesList} alignItems="center" />
      </section>
    </div>
  )
}
