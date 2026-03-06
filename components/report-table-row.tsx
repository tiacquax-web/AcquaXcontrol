"use client"

import { useState } from "react"
import { TableCell, TableRow } from "./ui/table"
import { Checkbox } from "./ui/checkbox"
import { Button } from "./ui/button"
import { Eye, Trash, Loader2 } from "lucide-react"
import { toast, useToast } from "./ui/use-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog"
import type { ApartmentWithConsumptionReport } from "@/types/apartment"
import { deleteApartmentReport } from "@/services/apartmentReportsService"
import { Badge } from "./ui/badge"
import { Droplets, Flame } from "lucide-react"

interface ReportTableRowProps {
    report: ApartmentWithConsumptionReport
    isSelected: boolean
    onToggleSelect: () => void
    onViewDetails: () => void
    onReportDeleted: () => void
    canDelete?: boolean
}

export function ReportTableRow({
    report,
    isSelected,
    onToggleSelect,
    onViewDetails,
    onReportDeleted,
    canDelete = false,
}: ReportTableRowProps) {
    const { toast } = useToast()
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const reportType = report.utilityType ?? report.DealershipReading?.type
    const isGas = reportType === "gas"
    const displayConsumption = isGas
        ? (report.consumptionGasValue ?? report.consumption ?? 0)
        : (report.consumption ?? 0)
    const displayTotal = isGas
        ? (report.totalGasValue ?? report.totalUnit ?? 0)
        : (report.totalUnit ?? 0)

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteApartmentReport(report.id)
            toast({
                title: "Relatório excluído",
                description: "O relatório foi excluído com sucesso.",
            })
            onReportDeleted()
        } catch (error) {
            console.error("Erro ao excluir relatório:", error)
            toast({
                variant: "destructive",
                title: "Erro na exclusão",
                description: "Não foi possível excluir o relatório.",
            })
        }
        finally {
            setIsDeleting(false)
            setShowDeleteConfirm(false)
        }
    }

    return (
        <>
            <TableRow className={`hover:bg-muted/50 transition-all duration-200 ${isSelected ? "bg-muted" : ""}`}>
                <TableCell className="w-12">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={onToggleSelect}
                        onClick={(e) => e.stopPropagation()}
                        disabled={isDeleting}
                    />
                </TableCell>
                <TableCell>{report.apartment.name}</TableCell>
                {/* <TableCell>{report.apartment.meters?.[0]?.register ?? "-"}</TableCell> */}
                <TableCell>{displayConsumption.toFixed(3).toString().replace(".", ",")}</TableCell>
                <TableCell>R$ {displayTotal.toFixed(2).toString().replace(".", ",")}</TableCell>
                <TableCell>{report.yearRef}</TableCell>
                <TableCell>{report.monthRef}</TableCell>
                <TableCell>
                    {reportType === 'water' ? (
                        <Badge variant="secondary" className="gap-1"><Droplets className="h-3 w-3" /> Água</Badge>
                    ) : reportType === 'gas' ? (
                        <Badge variant="secondary" className="gap-1"><Flame className="h-3 w-3" /> Gás</Badge>
                    ) : (
                        <Badge variant="outline">-</Badge>
                    )}
                </TableCell>
                <TableCell className="w-[100px]">
                    <div className="flex space-x-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation()
                                onViewDetails()
                            }}
                            disabled={isDeleting}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowDeleteConfirm(true)
                                }}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                            </Button>
                        )}
                    </div>
                </TableCell>
            </TableRow>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você está prestes a excluir o relatório do apartamento {report.apartment.name}. Esta ação não pode ser
                            desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? "Excluindo..." : "Confirmar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
