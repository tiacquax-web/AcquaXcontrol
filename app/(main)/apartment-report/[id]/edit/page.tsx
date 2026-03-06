"use client"

import { ApartmentReportForm } from "@/components/apartment-report/apartment-report-form"
import { useApartmentsReports } from "@/hooks/useApartmentReport"
import { Loader2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"

export default function EditApartmentReportPage() {
  const { id } = useParams()
  const router = useRouter()

  const { apartmentReports, loading, error, refetch } = useApartmentsReports({
    id: id as string,
    withApartment: true,
    withTotalDays: true,
  })

  const report = apartmentReports?.[0]

  const handleSuccess = () => {
    refetch()
    router.push(`/apartment-report/${id}`)
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
    <div className="container mx-auto py-6 px-4 md:px-6">
      <ApartmentReportForm mode="edit" report={report} onSuccess={handleSuccess} />
    </div>
  )
}
