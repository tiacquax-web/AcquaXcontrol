"use client"

import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

import { DealershipReadingForm } from "@/components/dealership-reading/dealership-reading-form"
import { useDealershipReadings } from "@/hooks/useDealershipReadings"

export default function EditDealershipReadingPage() {
  const { id } = useParams()
  const [isLoading, setIsLoading] = useState(true)

  const { dealershipReadings, loading, error } = useDealershipReadings({ id: id as string, withComplex: true, withCompany: true, withDealership: true })

  const originalReading = dealershipReadings[0]

  useEffect(() => {
    if (!loading) {
      setIsLoading(false)
    }
  }, [loading])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!originalReading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Leitura não encontrada.</p>
      </div>
    )
  }

  return <DealershipReadingForm mode="edit" initialData={originalReading} id={id as string} />
}
