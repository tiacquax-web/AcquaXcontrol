"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Calculator, Download, Loader2, RefreshCw, Save, Upload, X, AlertTriangle, Info, FileText, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApartmentsReports } from "@/hooks/useApartmentReport"
import { useApartmentReportsOperations } from "@/hooks/useApartmentReportsOperations"
import { ApartmentReportsTable } from "./apartment-reports-table"
import { ImportApartmentReportsDialog } from "./import-apartment-reports-dialog"
import { ImportCombinedDialog } from "./import-combined-dialog"
import { useToast } from "@/hooks/use-toast"
import { useApartments } from "@/hooks/useApartments"
import { ApartmentWithConsumptionReport } from "@/types/apartment"
import { DealershipReadingFull } from "@/types/fullTypes"
import { CombinedImportResult } from "@/types/combined-import"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { DescriptionModal } from "./DescriptionModal" // Import the new modal
import { usePermissionChecker } from "@/hooks/use-permission-checker"

interface ApartmentReportsSectionProps {
    dealershipReading: DealershipReadingFull
    complexId: string
    monthRef: string
    yearRef: string
}

type CalculationMethod = "proportional" | "equal" | "consumption"

export function ApartmentReportsSection({
    dealershipReading,
    complexId,
    monthRef,
    yearRef,
}: ApartmentReportsSectionProps) {
    const dealershipReadingId = dealershipReading.id
    const router = useRouter()
    const { toast } = useToast()
    const { hasPermission } = usePermissionChecker()
    const [calculationMethod, setCalculationMethod] = useState<CalculationMethod>("proportional")
    const [isSavingAll, setIsSavingAll] = useState(false)
    const [saveAllProgress, setSaveAllProgress] = useState({ total: 0, completed: 0 })
    const [importedReports, setImportedReports] = useState<Partial<ApartmentWithConsumptionReport>[]>([])
    const [combinedImportResult, setCombinedImportResult] = useState<CombinedImportResult | null>(null)
    const [showIssuesModal, setShowIssuesModal] = useState(false)
    const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false) // State for the new modal
    const [isSendingEmails, setIsSendingEmails] = useState(false)

    const { apartmentReports: existingReports, totalCount, loading, error, refetch } = useApartmentsReports({ dealershipReadingId, withApartment: true, take: 2000, skip: 0 })
    const { apartments } = useApartments({ complexId, take: 2000, skip: 0, withBlock: true })
    const { generate } = useApartmentReportsOperations()
    // FILTRO: manter apenas relatórios do mês/ano selecionados
    const reportsForSelectedMonth = existingReports.filter(r => r.monthRef === monthRef && r.yearRef === yearRef)

    // DIAG: detectar duplicidade de meses
    if (existingReports.length > reportsForSelectedMonth.length && typeof window !== 'undefined') {
        const duplicateRatio = (existingReports.length / (apartments.length || 1)).toFixed(2)
        console.warn('[AX_DIAG] Detectada mistura de meses nos reports', {
            apartments: apartments.length,
            existingReports: existingReports.length,
            reportsForSelectedMonth: reportsForSelectedMonth.length,
            duplicateRatio,
            monthRef, yearRef
        })
    }

    const apartmentReports: ApartmentWithConsumptionReport[] = apartments.map((apartment) => {
        // Agora busca somente dentro do mês/ano selecionados
        const existingReport = reportsForSelectedMonth.find((report) => report.apartmentId === apartment.id) || {} as ApartmentWithConsumptionReport
        if (!existingReport.id) {
            // limitar volume de logs
            if (typeof window !== 'undefined') {
                const g: any = window as any
                g.__AX_MISSING_REPORTS__ = g.__AX_MISSING_REPORTS__ || 0
                if (g.__AX_MISSING_REPORTS__ < 40) {
                    g.__AX_MISSING_REPORTS__++
                    console.debug('[AX_DIAG] Report ausente para apt', {
                        apartmentId: apartment.id,
                        block: apartment.block?.name,
                        apartment: apartment.name
                    })
                }
            }
        }
        
        // Check if there's imported data for this apartment
        const importedReport = importedReports.find((imported) => imported.apartmentId === apartment.id)
        
        // Merge existing, imported, and apartment data
        const mergedReport = {
            ...existingReport,
            ...(importedReport || {}),
            dealershipReadingId,
            apartmentId: apartment.id,
            apartment
        } as ApartmentWithConsumptionReport

        return mergedReport
    }).sort((a, b) => {
        // Sort by block name first
        const blockA = a.apartment.block?.name || ''
        const blockB = b.apartment.block?.name || ''
        const blockComparison = blockA.localeCompare(blockB, 'pt-BR', { numeric: true })

        if (blockComparison !== 0) {
            return blockComparison
        }

        // Then sort by apartment name
        const apartmentA = a.apartment.name || ''
        const apartmentB = b.apartment.name || ''
        return apartmentA.localeCompare(apartmentB, 'pt-BR', { numeric: true })
    })

    // Function to clear imported data
    const handleClearImportedData = () => {
        setImportedReports([])
        toast({
            title: "Dados limpos",
            description: "Os dados importados foram removidos da visualização.",
        })
    }

    // Function to handle successful import
    const handleImportSuccess = (importedData: Partial<ApartmentWithConsumptionReport>[]) => {
        console.log(importedData)

        // Process imported data to map it correctly to existing apartments
        console.log(apartments)

        const processedImports = importedData.map(imported => {
            // Find the corresponding apartment
            const apartment = apartments.find(apt => {
                const apartmentMatch = apt.name?.toString() === imported.apartment?.name?.toString()
                const blockMatch = apt.block?.name?.toString() === imported.apartment?.block?.name?.toString()
                return apartmentMatch && blockMatch
            })

            if (apartment) {
                return {
                    ...imported,
                    apartmentId: apartment.id,
                    apartment: apartment,
                    dealershipReadingId,
                    monthRef,
                    yearRef
                } as Partial<ApartmentWithConsumptionReport>
            }

            return null
        }).filter(Boolean) as Partial<ApartmentWithConsumptionReport>[]

        console.log("Processed Imports:", processedImports)

        setImportedReports(processedImports)

        const validImportsCount = processedImports.length
        const totalImportsCount = importedData.length

        if (validImportsCount === totalImportsCount) {
            toast({
                title: "Dados importados",
                description: `${validImportsCount} registros foram carregados com sucesso. Verifique os dados e salve as alterações.`,
            })
        } else {
            toast({
                title: "Importação parcial",
                description: `${validImportsCount} de ${totalImportsCount} registros foram carregados. Alguns apartamentos podem não ter sido encontrados.`,
                variant: "destructive",
            })
        }
    }

    // Function to handle successful combined import (readings + reports)
    const handleCombinedImportSuccess = (result: CombinedImportResult) => {
        console.log("Combined import result:", result)

        // Refresh the data to show newly imported reports
        refetch()

    setCombinedImportResult(result)

        toast({
            title: "Importação combinada concluída",
            description: `${result.readingsCreated} leituras e ${result.reportsCreated + result.reportsUpdated} relatórios processados. ${result.linkedReports} vinculações criadas.`,
        })

        // Show additional info if there were issues
        if (result.errors.length > 0 || result.warnings.length > 0) {
            const issueCount = result.errors.length + result.warnings.length
            toast({
                title: "Atenção",
                description: `A importação foi concluída, mas ${issueCount} item(s) precisam de atenção. Verifique os detalhes no resultado da importação.`,
                variant: "default",
            })
        }
    }

    // Function to generate apartment reports
    const handleGenerateReports = async () => {
        try {
            await generate.execute({
                dealershipReadingId,
                complexId,
                monthRef,
                yearRef,
                calculationMethod,
            })

            toast({
                title: "Relatórios gerados",
                description: "Os relatórios de apartamentos foram gerados com sucesso.",
            })

            // Refresh the page to show the new reports
            router.refresh()
        } catch (error) {
            toast({
                title: "Erro ao gerar relatórios",
                description: generate.error || "Ocorreu um erro ao gerar os relatórios.",
                variant: "destructive",
            })
        }    }
    // Function to manually trigger pending email jobs
    const handleTriggerEmails = async () => {
        setIsSendingEmails(true)
        try {
            const response = await fetch('/api/user/trigger-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Erro ao disparar emails')
            }

            toast({
                title: "Emails processados",
                description: `${data.sent || 0} enviados, ${data.failed || 0} falhas, ${data.skipped || 0} pulados${data.message ? ' — ' + data.message : ''}`,
            })
        } catch (error: any) {
            toast({
                title: "Erro ao disparar emails",
                description: error?.message || "Ocorreu um erro ao processar a fila de emails.",
                variant: "destructive",
            })
        } finally {
            setIsSendingEmails(false)
        }
    }

    // Function to handle completion of a single save operation
    const handleSaveCompleted = () => {
        setSaveAllProgress(prev => {
            const newCompleted = prev.completed + 1
            const newProgress = { ...prev, completed: newCompleted }
            
            // Check if all saves are completed
            if (newCompleted >= prev.total && prev.total > 0) {
                setIsSavingAll(false)
                toast({
                    title: "Processamento concluído",
                    description: `Todos os ${prev.total} relatórios foram processados.`,
                })
                // Reset progress
                setSaveAllProgress({ total: 0, completed: 0 })
            }
            
            return newProgress
        })
    }// Function to save all reports
    const handleSaveAll = () => {
        // Count total reports (all rows will respond to triggerSave)
        const totalCount = apartmentReports.length

        if (totalCount === 0) {
            toast({
                title: "Nenhum relatório",
                description: "Não há relatórios para salvar.",
            })
            return
        }

        setIsSavingAll(true)
        setSaveAllProgress({ total: totalCount, completed: 0 })
    }

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Relatórios de Apartamentos</CardTitle>
                <CardDescription>Gerencie os relatórios de consumo para cada apartamento do condomínio.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8 text-destructive">Erro ao carregar relatórios {error}</div>
                ) : apartmentReports.length === 0 ? (
                    <div className="space-y-4">
                        <p className="text-center py-4 text-muted-foreground">
                            Não há relatórios de apartamentos para esta leitura de concessionária.
                        </p>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                            <div className="space-y-2 flex-1">
                                <label htmlFor="calculation-method" className="text-sm font-medium">
                                    Método de Cálculo
                                </label>
                                <Select
                                    value={calculationMethod}
                                    onValueChange={(value) => setCalculationMethod(value as CalculationMethod)}
                                >
                                    <SelectTrigger id="calculation-method">
                                        <SelectValue placeholder="Selecione um método de cálculo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="proportional">Rateio Proporcional</SelectItem>
                                        <SelectItem value="equal">Rateio Igual</SelectItem>
                                        <SelectItem value="consumption">Baseado no Consumo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>                            <Button onClick={handleGenerateReports} disabled={generate.loading} className="min-w-[200px]">
                                {generate.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Gerar Relatórios
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground">Total de relatórios (mês {monthRef}/{yearRef}): {reportsForSelectedMonth.length}</span>
                                {importedReports.length > 0 && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                                        <Upload className="h-4 w-4" />
                                        {importedReports.length} registro(s) importado(s)
                                    </div>
                                )}
                            </div><div className="flex flex-wrap gap-2">
                                <ImportApartmentReportsDialog
                                    monthRef={monthRef}
                                    yearRef={yearRef}
                                    complexId={complexId}
                                    onImportSuccess={handleImportSuccess}
                                />
                                <ImportCombinedDialog
                                    monthRef={monthRef}
                                    yearRef={yearRef}
                                    complexId={complexId}
                                    dealershipReadingId={dealershipReadingId}
                                    onImportSuccess={handleCombinedImportSuccess}
                                />
                                {combinedImportResult && (combinedImportResult.errors.length > 0 || combinedImportResult.warnings.length > 0) && (
                                    <Button
                                        variant={combinedImportResult.errors.length ? "destructive" : "outline"}
                                        onClick={() => setShowIssuesModal(true)}
                                        className="relative"
                                    >
                                        <AlertTriangle className="h-4 w-4 mr-2" />
                                        Problemas ({combinedImportResult.errors.length + combinedImportResult.warnings.length})
                                        {combinedImportResult.errors.length > 0 && (
                                            <Badge variant="secondary" className="ml-2 bg-red-600 text-white hover:bg-red-600/90">{combinedImportResult.errors.length}E</Badge>
                                        )}
                                        {combinedImportResult.warnings.length > 0 && (
                                            <Badge variant="secondary" className="ml-2 bg-amber-500 text-white hover:bg-amber-500/90">{combinedImportResult.warnings.length}A</Badge>
                                        )}
                                    </Button>
                                )}
                                {importedReports.length > 0 && (
                                    <Button 
                                        variant="outline" 
                                        onClick={handleClearImportedData}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <X className="h-4 w-4 mr-2" />
                                        Limpar Importados ({importedReports.length})
                                    </Button>
                                )}
                                {hasPermission('generateFilipeta', 'do') && (
                                    <Button variant="outline" onClick={() => setIsDescriptionModalOpen(true)}>
                                        <FileText className="h-4 w-4 mr-2" />
                                        Gerar Filipeta
                                    </Button>
                                )}
                                {hasPermission('generateFilipeta', 'do') && (
                                    <Button
                                        variant="outline"
                                        onClick={handleTriggerEmails}
                                        disabled={isSendingEmails}
                                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                    >
                                        {isSendingEmails ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Mail className="h-4 w-4 mr-2" />
                                        )}
                                        Disparar Emails
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => router.refresh()} disabled={generate.loading}>
                                    {generate.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Download className="h-4 w-4 mr-2" />
                                    Exportar
                                </Button>
                                <Select
                                    value={calculationMethod}
                                    onValueChange={(value) => setCalculationMethod(value as CalculationMethod)}
                                >
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Método de cálculo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="proportional">Rateio Proporcional</SelectItem>
                                        <SelectItem value="equal">Rateio Igual</SelectItem>
                                        <SelectItem value="consumption">Baseado no Consumo</SelectItem>
                                    </SelectContent>
                                </Select>                                <Button variant="outline" onClick={handleGenerateReports} disabled={generate.loading}>
                                    {generate.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Calculator className="h-4 w-4 mr-2" />
                                         Todos
                                </Button>                                <Button onClick={handleSaveAll} disabled={isSavingAll}>
                                    {isSavingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="h-4 w-4 mr-2" />
                                    {isSavingAll ? 
                                        `Salvando (${saveAllProgress.completed}/${saveAllProgress.total})` : 
                                        "Salvar Todos"
                                    }
                                </Button>
                            </div>
                        </div>

                        <ApartmentReportsTable
                            apartmentReports={apartmentReports}
                            dealershipReading={dealershipReading}
                            calculationMethod={calculationMethod}
                            triggerSaveAll={isSavingAll}
                            onSaveCompleted={handleSaveCompleted}
                        />
                    </div>
                )}
            </CardContent>
            {/* Modal de Problemas da Importação Combinada */}
            {combinedImportResult && (
                <Dialog open={showIssuesModal} onOpenChange={setShowIssuesModal}>
                    <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                                Problemas da Importação Combinada
                            </DialogTitle>
                            <DialogDescription>
                                Detalhes de erros e avisos retornados ao importar leituras e relatórios. Revise e corrija na planilha se necessário.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6">
                            <div className="flex flex-wrap gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-blue-600 text-white">{combinedImportResult.readingsCreated}</Badge>
                                    <span>Leituras criadas</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-green-600 text-white">{combinedImportResult.reportsCreated}</Badge>
                                    <span>Relatórios criados</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-orange-600 text-white">{combinedImportResult.reportsUpdated}</Badge>
                                    <span>Relatórios atualizados</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-purple-600 text-white">{combinedImportResult.linkedReports}</Badge>
                                    <span>Vinculações</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-red-600 text-white">{combinedImportResult.errors.length}</Badge>
                                    <span>Erros</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-amber-500 text-white">{combinedImportResult.warnings.length}</Badge>
                                    <span>Avisos</span>
                                </div>
                            </div>

                            <Tabs defaultValue={combinedImportResult.errors.length ? "errors" : "warnings"}>
                                <TabsList>
                                    <TabsTrigger value="errors" disabled={combinedImportResult.errors.length === 0}>Erros ({combinedImportResult.errors.length})</TabsTrigger>
                                    <TabsTrigger value="warnings" disabled={combinedImportResult.warnings.length === 0}>Avisos ({combinedImportResult.warnings.length})</TabsTrigger>
                                    <TabsTrigger value="resumo">Resumo</TabsTrigger>
                                </TabsList>
                                <TabsContent value="errors" className="mt-4">
                                    {combinedImportResult.errors.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Nenhum erro.</p>
                                    ) : (
                                        <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
                                            {combinedImportResult.errors.map((err, idx) => (
                                                <div key={idx} className="p-3 text-sm">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="secondary" className="bg-red-600 text-white">Linha {err.row}</Badge>
                                                        <Badge variant="outline">{err.type}</Badge>
                                                    </div>
                                                    <p className="mt-1 text-red-700 leading-snug">{err.message}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="warnings" className="mt-4">
                                    {combinedImportResult.warnings.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Nenhum aviso.</p>
                                    ) : (
                                        <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
                                            {combinedImportResult.warnings.map((w, idx) => (
                                                <div key={idx} className="p-3 text-sm">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="secondary" className="bg-amber-500 text-white">Linha {w.row}</Badge>
                                                        <Badge variant="outline">{w.type}</Badge>
                                                    </div>
                                                    <p className="mt-1 text-amber-700 leading-snug">{w.message}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="resumo" className="mt-4">
                                    <div className="space-y-4 text-sm">
                                        <p className="text-muted-foreground flex items-center gap-2"><Info className="h-4 w-4" />Resumo de contexto:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Total de problemas: {combinedImportResult.errors.length + combinedImportResult.warnings.length}</li>
                                            <li>Erros bloqueiam criação; avisos indicam dados ignorados ou não críticos.</li>
                                            <li>Corrija as linhas com erro na planilha original e importe novamente se necessário.</li>
                                        </ul>
                                    </div>
                                </TabsContent>
                            </Tabs>
                            <div className="flex justify-end">
                                <Button variant="outline" onClick={() => setShowIssuesModal(false)}>Fechar</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
            <DescriptionModal
                isOpen={isDescriptionModalOpen}
                onOpenChange={setIsDescriptionModalOpen}
                dealershipReadingId={dealershipReadingId}
            />
        </Card>
    )
}
