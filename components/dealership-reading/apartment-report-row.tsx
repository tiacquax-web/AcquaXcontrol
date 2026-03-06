"use client"

import { useState, useEffect, useRef } from "react"
import type { ApartmentWithConsumptionReport } from "@/types/apartment"
import type { ApartmentConsumptionReport } from "@prisma/client"
import { Check, Eye, Loader2, RefreshCw, Save, ToggleLeft, ToggleRight, Thermometer } from "lucide-react"
import ReadingDetailsModal from "@/components/ReadingDetailsModal"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useApartmentReportMutations, useUnifiedApartmentReport } from "@/hooks/useApartmentReport"
import { useApartmentReportsOperations } from "@/hooks/useApartmentReportsOperations"
import { useToast } from "@/hooks/use-toast"
import { DealershipReadingFull } from "@/types/fullTypes"
import { useRouter } from "next/navigation"

// Extended local report shape (adds transient reading meta fields for the unified creation UI)
interface LocalReportExtended extends Partial<ApartmentConsumptionReport> {
    nextReadingDate?: string;
    isPreReading?: boolean;
    registerName?: string;
}

interface ApartmentReportRowProps {
    report: ApartmentWithConsumptionReport;
    dealershipReading: DealershipReadingFull;
    calculationMethod: string;
    triggerSave: boolean;
    onSaveCompleted?: () => void;
    readingColumnsEnabled?: boolean;
}

export function ApartmentReportRow({
    report,
    dealershipReading,
    calculationMethod,
    triggerSave,
    onSaveCompleted,
    readingColumnsEnabled = false,
}: ApartmentReportRowProps) {
    const { toast } = useToast()
    const router = useRouter()
    const dealershipReadingId = dealershipReading.id
    
    // Function to normalize values (null/undefined becomes 0)
    const normalizeValue = (value: number | null | undefined): number => {
        return value ?? 0
    }

    // Function to compare values considering null/undefined as 0
    // For new reports, undefined in originalReport indicates "no data yet"
    const valuesAreEqual = (newValue: number | null | undefined, current: number | null | undefined): boolean => {
        // If current is undefined (original value for new reports), any actual value represents a change
        if (current === undefined) {
            return false // Any imported data represents a change for new reports
        }
        return normalizeValue(newValue) === normalizeValue(current)
    }

    const [localReport, setLocalReport] = useState<LocalReportExtended>({
        id: report.id,
        consumption: report.consumption || 0,
        totalConsumption: report.totalConsumption || 0,
        consumptionCost: report.consumptionCost || 0,
        sewageCost: report.sewageCost || 0,
        partial: report.partial || 0,
        totalUnit: report.totalUnit || 0,
        kiteCarConsumption: report.kiteCarConsumption || 0,
        kiteCarCost: report.kiteCarCost || 0,
        consumptionGasValue: report.consumptionGasValue || 0,
        totalGasValue: report.totalGasValue || 0,
        dealershipReadingId: report.dealershipReadingId || dealershipReadingId,
        apartmentId: report.apartmentId || report.apartment.id,
        nextReadingDate: undefined,
        isPreReading: false,
        registerName: undefined,
    })
    // Store original report values to compare against
    // For new reports (no ID), initialize as undefined to detect any imported data as changes
    // For existing reports, use actual values
    const originalReport = useRef<Partial<ApartmentConsumptionReport>>({
        id: report.id,
        consumption: report.id ? normalizeValue(report.consumption) : undefined,
        totalConsumption: report.id ? normalizeValue(report.totalConsumption) : undefined,
        consumptionCost: report.id ? normalizeValue(report.consumptionCost) : undefined,
        sewageCost: report.id ? normalizeValue(report.sewageCost) : undefined,
        partial: report.id ? normalizeValue(report.partial) : undefined,
        totalUnit: report.id ? normalizeValue(report.totalUnit) : undefined,
        kiteCarConsumption: report.id ? normalizeValue(report.kiteCarConsumption) : undefined,
        kiteCarCost: report.id ? normalizeValue(report.kiteCarCost) : undefined,
        consumptionGasValue: report.id ? normalizeValue(report.consumptionGasValue) : undefined,
        totalGasValue: report.id ? normalizeValue(report.totalGasValue) : undefined,
    })// Track if the report has been modified or needs to be created
    const [isModified, setIsModified] = useState(false)
    const [isNewReport, setIsNewReport] = useState(!report.id) // Track if this is a new report
    const [needsSave, setNeedsSave] = useState(!report.id) // Track if report needs to be saved
    const [hasImportedData, setHasImportedData] = useState(false) // Track if data was imported    // Get mutation hooks
    const { createApartmentReport, updateApartmentReport, loading, error } = useApartmentReportMutations()
    const { calculate } = useApartmentReportsOperations()
    const unified = useUnifiedApartmentReport()
    // Inline reading state
    const [enableReading, setEnableReading] = useState(false)
    const [readingValue, setReadingValue] = useState<number | ''>('')
    const [readingDate, setReadingDate] = useState<string>('')
    const [readingUrlCover, setReadingUrlCover] = useState<string>('')
    const [readingDirty, setReadingDirty] = useState(false)
    const [readingModalOpen, setReadingModalOpen] = useState(false)

    const toggleReading = () => { setEnableReading(v => !v); setReadingDirty(true) }
    // Reading change tracking
    const readingHasRequiredFields = enableReading && readingValue !== '' && readingDate !== ''
    const readingNeedsSave = readingHasRequiredFields && readingDirty
    // Effect to detect if the report was updated from imported data
    useEffect(() => {
        // Check if current report data differs from the original report using robust comparison
        const hasChanged = 
            !valuesAreEqual(localReport.consumption, originalReport.current.consumption) ||
            !valuesAreEqual(localReport.totalConsumption, originalReport.current.totalConsumption) ||
            !valuesAreEqual(localReport.consumptionCost, originalReport.current.consumptionCost) ||
            !valuesAreEqual(localReport.sewageCost, originalReport.current.sewageCost) ||
            !valuesAreEqual(localReport.partial, originalReport.current.partial) ||
            !valuesAreEqual(localReport.totalUnit, originalReport.current.totalUnit) ||
            !valuesAreEqual(localReport.kiteCarConsumption, originalReport.current.kiteCarConsumption) ||
            !valuesAreEqual(localReport.kiteCarCost, originalReport.current.kiteCarCost) ||
            !valuesAreEqual(localReport.consumptionGasValue, originalReport.current.consumptionGasValue) ||
            !valuesAreEqual(localReport.totalGasValue, originalReport.current.totalGasValue)

        setIsModified(hasChanged)
        
        // A report needs to be saved if it's new OR if it has been modified OR if it has imported data
        setNeedsSave(isNewReport || hasChanged || hasImportedData)
    }, [localReport, isNewReport, hasImportedData])// Effect to update local report when the report prop changes (e.g., from imports)
    useEffect(() => {
        setLocalReport({
            id: report.id,
            consumption: normalizeValue(report.consumption),
            totalConsumption: normalizeValue(report.totalConsumption),
            consumptionCost: normalizeValue(report.consumptionCost),
            sewageCost: normalizeValue(report.sewageCost),
            partial: normalizeValue(report.partial),
            totalUnit: normalizeValue(report.totalUnit),
            kiteCarConsumption: normalizeValue(report.kiteCarConsumption),
            kiteCarCost: normalizeValue(report.kiteCarCost),
            consumptionGasValue: normalizeValue(report.consumptionGasValue),
            totalGasValue: normalizeValue(report.totalGasValue),
            dealershipReadingId: report.dealershipReadingId || dealershipReadingId,
            apartmentId: report.apartmentId || report.apartment.id,
            yearRef: report.yearRef || dealershipReading.yearRef || undefined,
            monthRef: report.monthRef || dealershipReading.monthRef || undefined,
                // keep existing reading meta if already filled by user
                nextReadingDate: localReport.nextReadingDate,
                isPreReading: localReport.isPreReading,
                registerName: localReport.registerName,
        })
        
        // Update isNewReport state when report.id changes
        const newIsNewReport = !report.id
        setIsNewReport(newIsNewReport)
        
        // For new reports, detect if data was imported by checking if any field has actual data
        if (!report.id) {
            const hasAnyData = report.consumption || report.totalConsumption || report.consumptionCost ||
                              report.sewageCost || report.partial || report.totalUnit ||
                              report.kiteCarConsumption || report.kiteCarCost ||
                              report.consumptionGasValue || report.totalGasValue
            setHasImportedData(!!hasAnyData)
        }
        
        // Update original report reference when the report prop changes
        if (report.id) {
            originalReport.current = {
                id: report.id,
                consumption: normalizeValue(report.consumption),
                totalConsumption: normalizeValue(report.totalConsumption),
                consumptionCost: normalizeValue(report.consumptionCost),
                sewageCost: normalizeValue(report.sewageCost),
                partial: normalizeValue(report.partial),
                totalUnit: normalizeValue(report.totalUnit),
                kiteCarConsumption: normalizeValue(report.kiteCarConsumption),
                kiteCarCost: normalizeValue(report.kiteCarCost),
                consumptionGasValue: normalizeValue(report.consumptionGasValue),
                totalGasValue: normalizeValue(report.totalGasValue),
            }
        }
    }, [report.id, report.consumption, report.totalConsumption, report.consumptionCost, 
        report.sewageCost, report.partial, report.totalUnit, report.kiteCarConsumption,
        report.kiteCarCost, report.consumptionGasValue, report.totalGasValue])

    // Handle input changes
    const handleInputChange = (field: keyof ApartmentConsumptionReport, value: number) => {
        setLocalReport((prev) => ({
            ...prev,
            [field]: value,
        }))
        setIsModified(true)
    }    // Function to update original report after successful save
    const updateOriginalReport = (savedData: Partial<ApartmentConsumptionReport>) => {
        originalReport.current = {
            id: savedData.id,
            consumption: normalizeValue(savedData.consumption),
            totalConsumption: normalizeValue(savedData.totalConsumption),
            consumptionCost: normalizeValue(savedData.consumptionCost),
            sewageCost: normalizeValue(savedData.sewageCost),
            partial: normalizeValue(savedData.partial),
            totalUnit: normalizeValue(savedData.totalUnit),
            kiteCarConsumption: normalizeValue(savedData.kiteCarConsumption),
            kiteCarCost: normalizeValue(savedData.kiteCarCost),
            consumptionGasValue: normalizeValue(savedData.consumptionGasValue),
            totalGasValue: normalizeValue(savedData.totalGasValue),
        }
        
        // After saving, it's no longer a new report and doesn't need saving
        setIsNewReport(false)
        setNeedsSave(false)
    }

    // Handle recalculate
    const handleRecalculate = async () => {
        try {
            const calculatedData = await calculate.execute({
                apartmentId: report.apartment.id,
                dealershipReadingId,
                calculationMethod,
            })

            // Update local state with calculated values
            setLocalReport((prev) => ({
                ...prev,
                ...calculatedData,
            }))

            setIsModified(true)
            toast({
                title: "Valores recalculados",
                description: `Os valores para o apartamento ${report.apartment.name} foram recalculados.`,
            })
        } catch (error) {
            toast({
                title: "Erro ao recalcular valores",
                description: calculate.error || "Ocorreu um erro ao recalcular os valores.",
                variant: "destructive",
            })
        }
    }

    // Handle save
    const handleSave = async () => {        try {
            // Unified path (create reading then report linking)
            if (enableReading && readingValue !== '' && readingDate) {
                const unifiedPayload = {
                    report: {
                        apartmentId: report.apartment.id,
                        dealershipReadingId,
                        monthRef: dealershipReading.monthRef || localReport.monthRef || '',
                        yearRef: dealershipReading.yearRef || localReport.yearRef || '',
                        consumption: localReport.consumption,
                        totalConsumption: localReport.totalConsumption,
                        consumptionCost: localReport.consumptionCost,
                        sewageCost: localReport.sewageCost,
                        partial: localReport.partial,
                        totalUnit: localReport.totalUnit,
                        kiteCarConsumption: localReport.kiteCarConsumption,
                        kiteCarCost: localReport.kiteCarCost,
                        consumptionGasValue: localReport.consumptionGasValue,
                        totalGasValue: localReport.totalGasValue,
                    },
                    reading: {
                        enabled: true,
                        readingId: report.lastReading?.id, // include for update existing reading
                        reading: typeof readingValue === 'number' ? readingValue : parseFloat(readingValue as any),
                        readAtDate: readingDate,
                        urlCover: readingUrlCover || undefined,
                        nextReadingDate: localReport.nextReadingDate || undefined,
                        isPreReading: localReport.isPreReading || false,
                        registerName: localReport.registerName || undefined,
                    }
                }
                const unifiedResult = await unified.submit([unifiedPayload as any])
                const first = unifiedResult.items?.[0]
                if (first?.errors?.length) throw new Error(first.errors.join('\n'))
                if (first?.reportId) {
                    setLocalReport(prev => ({ ...prev, id: first.reportId }))
                    updateOriginalReport({ ...localReport, id: first.reportId })
                }
                setReadingDirty(false)
                setIsModified(false)
                setIsNewReport(false)
                setNeedsSave(false)
                if (onSaveCompleted) onSaveCompleted()
                toast({ title: 'Relatório e leitura salvos', description: `Apartamento ${report.apartment.name}` })
                return
            }
            let savedEntity: any;
            if (report.id) {
                // Update existing report
                savedEntity = await updateApartmentReport(report.id, {
                    ...localReport,
                    dealershipReadingId,
                })
                if (!savedEntity || !savedEntity.id) {
                    throw new Error("Erro ao atualizar o relatório do apartamento")
                }
            } else {                console.warn("CREATING NEW REPORT", report)
                if (dealershipReading && dealershipReading.yearRef && dealershipReading.monthRef) {
                    // Create new report
                    savedEntity = await createApartmentReport({
                        ...localReport,
                        dealershipReadingId,
                        apartmentId: report.apartment.id,
                        yearRef: dealershipReading.yearRef,
                        monthRef: dealershipReading.monthRef,
                    })
                    if (!savedEntity || !savedEntity.id) {
                        throw new Error("Erro ao criar o relatório do apartamento")
                    }                    setLocalReport((prev) => ({
                        ...prev,
                        id: savedEntity.id,
                        dealershipReadingId: savedEntity.dealershipReadingId,
                        apartmentId: savedEntity.apartmentId,
                        consumption: savedEntity.consumption,
                        totalConsumption: savedEntity.totalConsumption,
                        consumptionCost: savedEntity.consumptionCost,
                        sewageCost: savedEntity.sewageCost,
                        partial: savedEntity.partial,
                        totalUnit: savedEntity.totalUnit,
                        kiteCarConsumption: savedEntity.kiteCarConsumption,
                        kiteCarCost: savedEntity.kiteCarCost,
                        consumptionGasValue: savedEntity.consumptionGasValue,
                        totalGasValue: savedEntity.totalGasValue,
                    }))

                } else {
                    throw new Error("Dados de leitura do concessionário não disponíveis")
                }
            }            // Update original report with saved data
            updateOriginalReport(savedEntity)
            setIsModified(false)
            
            // Notify parent component that save completed
            if (onSaveCompleted) {
                onSaveCompleted()
            }
            
            toast({
                title: "Relatório salvo",
                description: `O relatório para o apartamento ${report.apartment.name} foi salvo com sucesso.`,
            })
        } catch (error) {
            console.error("Error saving report:", error)
            
            // Notify parent component that save completed (even with error)
            if (onSaveCompleted) {
                onSaveCompleted()
            }
            
            toast({
                title: "Erro ao salvar relatório",
                description: error instanceof Error ? error.message : "Ocorreu um erro ao salvar o relatório.",
                variant: "destructive",
            })
        }
    }    // Effect to handle the save all trigger (report or reading changes)
    useEffect(() => {
        if (triggerSave) {
            if (needsSave || readingNeedsSave) {
                (async () => { await handleSave() })()
            } else {
                if (onSaveCompleted) onSaveCompleted()
            }
        }
    }, [triggerSave, needsSave, readingNeedsSave])

    // Effect to show error toast if there's an error
    useEffect(() => {
        if (error) {
            toast({
                title: "Erro",
                description: error,
                variant: "destructive",
            })
        }
    }, [error])

    // Hydrate reading UI fields from lastReading when available (initial load only or when lastReading changes)
    useEffect(() => {
        const lr = report.lastReading
        if (!lr) return
    // If user already modified (dirty), don't override
    if (readingDirty) return
    // Auto-enable toggle when existing reading is present
    if (!enableReading) setEnableReading(true)
        // Normalize readAtDate format ("YYYY-MM-DD" expected by input type=date)
        const normalizedReadAtDate = lr.readAtDate ? lr.readAtDate.substring(0, 10) : ''
        // Normalize nextReadingDate: if comes as DD/MM/YYYY convert to YYYY-MM-DD
        let normalizedNext: string | undefined = undefined
        if (lr.nextReadingDate) {
            if (lr.nextReadingDate.includes('/')) {
                const parts = lr.nextReadingDate.split('/') // dd/MM/yyyy
                if (parts.length === 3) {
                    normalizedNext = `${parts[2]}-${parts[1]}-${parts[0]}`
                }
            } else {
                normalizedNext = lr.nextReadingDate
            }
        }
        setReadingValue(lr.reading ?? '')
        setReadingDate(normalizedReadAtDate)
        setReadingUrlCover(lr.urlCover || '')
        setLocalReport(prev => ({
            ...prev,
            nextReadingDate: prev.nextReadingDate || normalizedNext,
            isPreReading: prev.isPreReading ?? (lr.isPreReading ?? false),
            registerName: prev.registerName || lr.registerName || undefined,
        }))
    }, [report.lastReading?.id])

    return (
        <>
        <TableRow>
            <TableCell className="font-medium">
                <div className="flex flex-col">
                    <span>{report.apartment.name}</span>
                    <span className="text-xs text-muted-foreground">{report.apartment.block?.name}</span>
                    <div className="mt-1">
                        {error ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Erro</Badge>
                        ) : (readingNeedsSave || (needsSave && (isModified || hasImportedData))) ? (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Atualizar</Badge>
                        ) : needsSave && isNewReport && !hasImportedData ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Novo</Badge>
                        ) : localReport.id ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Salvo</Badge>
                        ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Vazio</Badge>
                        )}
                        {enableReading && (
                            <div className="mt-1 text-[10px] text-primary flex items-center gap-1">
                                <Thermometer className="h-3 w-3" /> Leitura ativa
                            </div>
                        )}
                    </div>
                </div>
            </TableCell>
                {dealershipReading.type === 'gas' ? (
                    <>
                        {/* consumo_gas_m3 */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.consumptionGasValue || 0}
                                onChange={(e) => handleInputChange("consumptionGasValue", Number.parseFloat(e.target.value))}
                                step="0.001"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* valor_consumo_gas */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.totalGasValue || 0}
                                onChange={(e) => handleInputChange("totalGasValue", Number.parseFloat(e.target.value))}
                                step="0.01"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                    </>
                ) : (
                    <>
                        {/* consumo_agua_m3 */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.consumption || 0}
                                onChange={(e) => handleInputChange("consumption", Number.parseFloat(e.target.value))}
                                step="0.001"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* valor_consumo_agua */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.consumptionCost || 0}
                                onChange={(e) => handleInputChange("consumptionCost", Number.parseFloat(e.target.value))}
                                step="0.01"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* valor_esgoto */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.sewageCost || 0}
                                onChange={(e) => handleInputChange("sewageCost", Number.parseFloat(e.target.value))}
                                step="0.01"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* consumo_pipa_m3 */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.kiteCarConsumption || 0}
                                onChange={(e) => handleInputChange("kiteCarConsumption", Number.parseFloat(e.target.value))}
                                step="0.001"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* custo_pipa */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.kiteCarCost || 0}
                                onChange={(e) => handleInputChange("kiteCarCost", Number.parseFloat(e.target.value))}
                                step="0.01"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* rateio_agua */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.partial || 0}
                                onChange={(e) => handleInputChange("partial", Number.parseFloat(e.target.value))}
                                step="0.001"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* consumo_total_agua_m3 */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.totalConsumption || 0}
                                onChange={(e) => handleInputChange("totalConsumption", Number.parseFloat(e.target.value))}
                                step="0.001"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                        {/* valor_total_agua_unidade */}
                        <TableCell>
                            <Input
                                type="number"
                                value={localReport.totalUnit || 0}
                                onChange={(e) => handleInputChange("totalUnit", Number.parseFloat(e.target.value))}
                                step="0.01"
                                min="0"
                                className="w-24"
                            />
                        </TableCell>
                    </>
                )}
            
                        {readingColumnsEnabled && (
                            <>
                                {/* prox_leitura (nextReadingDate) */}
                                <TableCell>
                                    {readingColumnsEnabled && (
                                        <Input
                                            type="date"
                                            value={localReport.nextReadingDate || ''}
                                            onChange={(e) => { setLocalReport(p => ({ ...p, nextReadingDate: e.target.value })); setReadingDirty(true); }}
                                            className="w-36"
                                        />
                                    )}
                                </TableCell>
                                {/* foto (urlCover) */}
                                <TableCell>
                                    {readingColumnsEnabled && (
                                        <div className="relative w-40">
                                            <Input
                                                placeholder="URL"
                                                value={readingUrlCover}
                                                onChange={(e) => { setReadingUrlCover(e.target.value); setReadingDirty(true); }}
                                                className="pr-7"
                                            />
                                            {(report.lastReading || readingUrlCover) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setReadingModalOpen(true)}
                                                    className="absolute inset-y-0 right-1 flex items-center text-muted-foreground hover:text-foreground transition"
                                                    title="Ver leitura"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                                {/* pre_leitura (isPreReading) */}
                                <TableCell>
                                    {readingColumnsEnabled && (
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={!!localReport.isPreReading}
                                                onCheckedChange={(v) => { setLocalReport(p => ({ ...p, isPreReading: v })); setReadingDirty(true); }}
                                            />
                                            <span className="text-xs w-10 select-none">{localReport.isPreReading ? 'Sim' : 'Não'}</span>
                                        </div>
                                    )}
                                </TableCell>
                                {/* leitura (reading) */}
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Button type="button" variant={enableReading ? 'default' : 'outline'} size="sm" onClick={toggleReading} disabled={loading || unified.loading}>
                                            {enableReading ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                                        </Button>
                                        {readingColumnsEnabled && (
                                            <Input
                                                placeholder="0.000"
                                                type="number"
                                                value={readingValue}
                                                onChange={(e) => { setReadingValue(e.target.value === '' ? '' : Number(e.target.value)); setReadingDirty(true); }}
                                                className="w-24"
                                                step="0.001"
                                                min="0"
                                            />
                                        )}
                                    </div>
                                </TableCell>
                                {/* data_leitura (readAtDate) */}
                                <TableCell>
                                    {readingColumnsEnabled && (
                                        <Input
                                            type="date"
                                            value={readingDate}
                                            onChange={(e) => { setReadingDate(e.target.value); setReadingDirty(true); }}
                                            className="w-36"
                                        />
                                    )}
                                </TableCell>
                                {/* chassi (registerName / meter register) */}
                                <TableCell>
                                    {readingColumnsEnabled && (
                                        <Input
                                            placeholder="Chassi"
                                            value={localReport.registerName || ''}
                                            onChange={(e) => { setLocalReport(p => ({ ...p, registerName: e.target.value })); setReadingDirty(true); }}
                                            className="w-32"
                                        />
                                    )}
                                </TableCell>
                            </>
                        )}
            <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={calculate.loading || loading}>
                        {calculate.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={(loading || unified.loading) || (!needsSave && !readingNeedsSave)}>
                        {(loading || unified.loading) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (needsSave || readingNeedsSave) ? (
                            <Save className="h-4 w-4" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                    </Button>
                    <Button variant="link" size="sm" disabled={!report.id && !localReport.id} onClick={() => (report.id || localReport.id) && router.push(`/apartment-report/${report.id || localReport.id}`)}>
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
        {report.lastReading && (
            <ReadingDetailsModal
                open={readingModalOpen}
                onOpenChange={setReadingModalOpen}
                reading={{
                    ...report.lastReading,
                    readAt: report.lastReading?.readAtDate ? new Date(report.lastReading.readAtDate.replace(' ', 'T')) : undefined,
                    monthRef: report.monthRef,
                    yearRef: report.yearRef,
                    nextReadingDate: localReport.nextReadingDate || report.lastReading?.nextReadingDate,
                    isPreReading: localReport.isPreReading ?? report.lastReading?.isPreReading,
                    urlCover: readingUrlCover || report.lastReading?.urlCover,
                }}
            />
        )}
        </>
    )
}
