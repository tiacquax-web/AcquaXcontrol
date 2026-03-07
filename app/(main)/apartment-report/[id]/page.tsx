"use client"
import ReadingsGraph, { type DateRange } from "@/components/ReadingsGraph"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useApartmentsReports } from "@/hooks/useApartmentReport"
import { Loader2 } from "lucide-react"
import { useParams } from "next/navigation"
import { ApartmentReportForm } from "@/components/apartment-report/apartment-report-form"

export default function ApartmentReportPage() {
  const { id } = useParams()

  const {
    apartmentReports,
    loading,
    error,
    refetch: refetchReadings,
  } = useApartmentsReports({
    id: id as string,
    withMeters: true,
    withTotalDays: true,
    withReadingDate: true,
    withApartment: true,
  })

  const report = apartmentReports?.[0]
  const { totalDays, readingDate } = report?.DealershipReading || {}
  const meters = report?.apartment?.meters

  const dateRange: DateRange = {
    from:
      readingDate && totalDays
        ? new Date(new Date(readingDate).setDate(new Date(readingDate).getDate() - totalDays))
        : undefined,
    to: readingDate ? new Date(new Date(readingDate).setHours(23, 59, 59, 999)) : undefined,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Relatório não encontrado</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 w-full md:py-6">
      <section className="container mx-0 px-0 md:px-6 md:mx-auto">
        <ApartmentReportForm mode="view" report={report} onSuccess={refetchReadings} />
      </section>

      <section className="container mx-0 px-0 md:px-6 md:mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Gráficos de Consumo</CardTitle>
            <CardDescription>Leituras dos medidores durante o período</CardDescription>
          </CardHeader>
          <CardContent className="p-1 md:p-6">
            {meters?.map((meter) => (
              <ReadingsGraph meterId={meter.id} register={meter.register} key={meter.id} dateRange={dateRange} detailsModalAvailable />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
