"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle, Upload, X, FileSpreadsheet, Loader2, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "./ui/progress"
import * as XLSX from "xlsx"
import { useMeterMutations } from "@/hooks/useMeters"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table"

interface ImportMetersDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImportComplete: () => void
}

interface ImportError {
    row: number
    message: string
}

interface InvalidRow {
    index: number
    rowNumber: number
    missingFields: string[]
    duplicatedChassi?: string
    duplicateType?: 'exact' | 'different' // exact = dados iguais, different = dados diferentes
    row: any
}

export function ImportMetersDialog({ open, onOpenChange, onImportComplete }: ImportMetersDialogProps) {
    const { toast } = useToast()
    const [file, setFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [errors, setErrors] = useState<ImportError[]>([])
    const [importRows, setImportRows] = useState<any[] | null>(null)
    const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { createMetersFromSheet, loading: loadingMutation } = useMeterMutations()

    // Função para verificar se duas linhas são exatamente iguais (exceto posição)
    const areRowsIdentical = (row1: any, row2: any): boolean => {
        const keysToCompare = ['chassi', 'tipo', 'condominio', 'bloco', 'apartamento', 'localizacao', 'leitura_inicial', 'ano_fabricacao', 'principal', 'rotacao']
        return keysToCompare.every(key => {
            const val1 = row1[key] === undefined || row1[key] === null || row1[key] === '' ? '' : String(row1[key]).toLowerCase().trim()
            const val2 = row2[key] === undefined || row2[key] === null || row2[key] === '' ? '' : String(row2[key]).toLowerCase().trim()
            return val1 === val2
        })
    }

    // Função para validar uma linha
    const validateRow = (row: any, index: number, allRows: any[]): InvalidRow | null => {
        const requiredFields = ['chassi', 'tipo', 'condominio', 'bloco', 'apartamento', 'rotacao']
        const missingFields: string[] = []

        for (const field of requiredFields) {
            if (row[field] === null || row[field] === undefined || String(row[field]).trim() === '') {
                missingFields.push(field)
            }
        }

        // Verificar se a rotação é válida
        if (row.rotacao && row.rotacao !== 'Crescente' && row.rotacao !== 'Decrescente') {
            missingFields.push('rotacao (deve ser "Crescente" ou "Decrescente")')
        }

        // Verificar chassi duplicado no mesmo lote
        let duplicatedChassi: string | undefined
        let duplicateType: 'exact' | 'different' | undefined
        if (row.chassi) {
            const chassiLower = String(row.chassi).toLowerCase().trim()
            const duplicateIndex = allRows.findIndex((r, i) => 
                i !== index && 
                r.chassi && 
                String(r.chassi).toLowerCase().trim() === chassiLower
            )
            if (duplicateIndex !== -1) {
                duplicatedChassi = String(row.chassi)
                // Verificar se são exatamente iguais ou diferentes
                duplicateType = areRowsIdentical(row, allRows[duplicateIndex]) ? 'exact' : 'different'
            }
        }

        if (missingFields.length > 0 || duplicatedChassi) {
            return {
                index,
                rowNumber: index + 2, // +2 porque Excel começa em 1 e tem o header
                missingFields,
                duplicatedChassi,
                duplicateType,
                row
            }
        }

        return null
    }

    // Função para validar todas as linhas
    const validateImportRows = (rows: any[]) => {
        const invalid: InvalidRow[] = []
        
        // Validar todas as linhas (incluindo duplicatas)
        rows.forEach((row, index) => {
            const invalidRow = validateRow(row, index, rows)
            if (invalidRow) {
                invalid.push(invalidRow)
            }
        })

        setInvalidRows(invalid)
        
        if (invalid.length > 0) {
            const hasFieldErrors = invalid.some(row => row.missingFields.length > 0)
            const hasExactDuplicates = invalid.some(row => row.duplicateType === 'exact')
            const hasDifferentDuplicates = invalid.some(row => row.duplicateType === 'different')
            
            if (hasFieldErrors || hasDifferentDuplicates) {
                toast({
                    variant: "destructive",
                    title: "Algumas linhas são inválidas",
                    description: "Verifique-as e confirme a correção"
                })
            }

            if (hasDifferentDuplicates) {
                toast({
                    variant: "destructive",
                    title: "Chassi duplicados com dados diferentes",
                    description: "Alguns chassi estão duplicados mas com dados diferentes. Use a lixeira para escolher qual manter, ou importe a planilha corrigida."
                })
            }

            if (hasExactDuplicates && !hasFieldErrors && !hasDifferentDuplicates) {
                toast({
                    title: "Duplicatas exatas detectadas",
                    description: "Use o botão 'Remover linhas inválidas' para limpar automaticamente."
                })
            }
        }
    }

    // Função para ordenar linhas por chassi
    const sortRowsByChassi = (rows: any[]) => {
        return rows.sort((a, b) => {
            const chassiA = a.chassi ? String(a.chassi).toLowerCase().trim() : ''
            const chassiB = b.chassi ? String(b.chassi).toLowerCase().trim() : ''
            return chassiA.localeCompare(chassiB, undefined, { numeric: true, sensitivity: 'base' })
        })
    }

    // Função para remover linhas inválidas (campos obrigatórios faltando e duplicatas exatas)
    const removeInvalidRows = () => {
        if (!importRows) return

        // Primeiro, remover linhas com campos obrigatórios faltando
        const rowsWithoutMissingFields = importRows.filter((_, index) => 
            !invalidRows.some(invalid => invalid.index === index && invalid.missingFields.length > 0)
        )

        // Segundo, processar apenas duplicatas exatas (manter uma de cada grupo)
        const chassiGroups = new Map<string, { indices: number[], rows: any[] }>()
        
        // Agrupar linhas por chassi
        rowsWithoutMissingFields.forEach((row, index) => {
            if (row.chassi) {
                const chassiLower = String(row.chassi).toLowerCase().trim()
                if (!chassiGroups.has(chassiLower)) {
                    chassiGroups.set(chassiLower, { indices: [], rows: [] })
                }
                chassiGroups.get(chassiLower)!.indices.push(index)
                chassiGroups.get(chassiLower)!.rows.push(row)
            }
        })

        // Identificar quais linhas manter (primeira de cada grupo de duplicatas exatas)
        const indicesToKeep = new Set<number>()
        let exactDuplicatesRemoved = 0

        chassiGroups.forEach(({ indices, rows }, chassi) => {
            if (indices.length > 1) {
                // Verificar se são todas exatamente iguais
                const firstRow = rows[0]
                const exactDuplicateIndices: number[] = []
                
                // Encontrar todas as linhas exatamente iguais à primeira
                for (let i = 0; i < rows.length; i++) {
                    if (areRowsIdentical(firstRow, rows[i])) {
                        exactDuplicateIndices.push(i)
                    }
                }

                if (exactDuplicateIndices.length > 1) {
                    // Há duplicatas exatas - manter apenas a primeira
                    indicesToKeep.add(indices[exactDuplicateIndices[0]])
                    exactDuplicatesRemoved += exactDuplicateIndices.length - 1
                    
                    // Adicionar as linhas que NÃO são duplicatas exatas (dados diferentes)
                    for (let i = 0; i < rows.length; i++) {
                        if (!exactDuplicateIndices.includes(i)) {
                            indicesToKeep.add(indices[i])
                        }
                    }
                } else {
                    // Não há duplicatas exatas, manter todas (são duplicatas com dados diferentes)
                    indices.forEach(idx => indicesToKeep.add(idx))
                }
            } else {
                // Linha única, sempre manter
                indicesToKeep.add(indices[0])
            }
        })

        // Adicionar linhas que não têm chassi
        rowsWithoutMissingFields.forEach((row, index) => {
            if (!row.chassi) {
                indicesToKeep.add(index)
            }
        })

        // Filtrar para manter apenas as linhas selecionadas
        const finalRows = rowsWithoutMissingFields.filter((_, index) => indicesToKeep.has(index))
        
        const missingFieldsRemoved = importRows.length - rowsWithoutMissingFields.length
        const sortedFinalRows = sortRowsByChassi(finalRows)
        setImportRows(sortedFinalRows)

        let description = ""
        if (missingFieldsRemoved > 0 && exactDuplicatesRemoved > 0) {
            description = `${missingFieldsRemoved} linhas com campos faltando e ${exactDuplicatesRemoved} duplicatas exatas foram removidas. ${sortedFinalRows.length} linhas restantes.`
        } else if (missingFieldsRemoved > 0) {
            description = `${missingFieldsRemoved} linhas com campos faltando foram removidas. ${sortedFinalRows.length} linhas restantes.`
        } else if (exactDuplicatesRemoved > 0) {
            description = `${exactDuplicatesRemoved} duplicatas exatas foram removidas. ${sortedFinalRows.length} linhas restantes.`
        }

        toast({
            title: "Linhas inválidas removidas",
            description: description
        })
    }

    // Função para remover uma linha específica
    const removeSpecificRow = (rowIndex: number) => {
        if (!importRows) return

        const newRows = importRows.filter((_, index) => index !== rowIndex)
        const sortedNewRows = sortRowsByChassi(newRows)
        setImportRows(sortedNewRows)

        toast({
            title: "Linha removida",
            description: `Linha ${rowIndex + 2} foi removida.`
        })
    }

    // Effect para validar quando importRows mudar
    useEffect(() => {
        if (importRows && importRows.length > 0) {
            validateImportRows(importRows)
        }
    }, [importRows])
    
    if (errors) {
        console.error("Import errors:", errors)
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null
        
        // Limpar estados anteriores
        setFile(null)
        setErrors([])
        setImportRows(null)
        setInvalidRows([])
        
        // Processar o novo arquivo
        setFile(selectedFile)
        
        if (selectedFile) {
            setIsUploading(true)
            try {
                const data = await selectedFile.arrayBuffer()
                const workbook = XLSX.read(data, { type: "array" })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" })
                
                // Ordenar por chassi alfanumericamente
                const sortedJson = json.sort((a, b) => {
                    const chassiA = a.chassi ? String(a.chassi).toLowerCase().trim() : ''
                    const chassiB = b.chassi ? String(b.chassi).toLowerCase().trim() : ''
                    return chassiA.localeCompare(chassiB, undefined, { numeric: true, sensitivity: 'base' })
                })
                
                setImportRows(sortedJson)
                
                toast({
                    title: "Arquivo carregado",
                    description: `${sortedJson.length} linhas carregadas de ${selectedFile.name}`
                })
            } catch (err: any) {
                toast({
                    variant: "destructive",
                    title: "Erro ao ler arquivo",
                    description: err?.message || "Não foi possível ler o arquivo.",
                })
            } finally {
                setIsUploading(false)
            }
        }
    }

    const handleImport = async () => {
        if (!importRows || importRows.length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum dado para importar",
                description: "Selecione um arquivo válido para importar.",
            })
            return
        }
        setIsUploading(true)
        setProgress(0)
        setErrors([])
        try {
            const result = await createMetersFromSheet(importRows)
            // Se o backend retornar erro de importação em massa (status 400), pode vir como { error, details, created }
            if (result.errors && result.errors.length > 0) {
                setErrors(result.errors)
                toast({
                    variant: "destructive",
                    title: "Importação concluída com erros",
                    description: `${result.created} criados, ${result.errors.length} erros.`,
                })
            } else if (result.details && Array.isArray(result.details)) {
                setErrors(result.details)
                toast({
                    variant: "destructive",
                    title: result.error || "Importação concluída com erros",
                    description: `${result.created ?? 0} criados, ${result.details.length} erros.`,
                })
            } else {
                toast({
                    title: "Importação concluída",
                    description: `${result.created ?? result.updated ?? 0} medidores criados e ${result.updated ?? 0} atualizados.`,
                })
                onImportComplete()
                onOpenChange(false)
            }
        } catch (error: any) {
            // Tenta extrair detalhes do erro do backend
            if (error && error.details && Array.isArray(error.details)) {
                setErrors(error.details)
                toast({
                    variant: "destructive",
                    title: error.error || "Erro na importação",
                    description: `${error.created ?? 0} criados, ${error.details.length} erros.`,
                })
            } else {
                console.error("Erro na importação:", error)
                toast({
                    variant: "destructive",
                    title: "Erro na importação",
                    description: error?.message || "Ocorreu um erro ao processar o arquivo.",
                })
            }
        } finally {
            setIsUploading(false)
        }
    }

    const resetFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
        setFile(null)
        setErrors([])
        setInvalidRows([])
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl w-full p-0 sm:p-0 rounded-lg shadow-lg border bg-background"
                style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                <div className="flex flex-col flex-1 overflow-y-auto p-6">
                    <DialogHeader>
                        <DialogTitle>Importar Medidores</DialogTitle>
                        <DialogDescription>
                            Faça upload de uma planilha com os dados dos medidores. O sistema irá atualizar os registros existentes ou criar novos conforme necessário.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="file">Arquivo de Planilha</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="file"
                                    type="file"
                                    accept=".xlsx,.xls,.csv,.ods"
                                    onChange={handleFileChange}
                                    onClick={(e) => {
                                        // Limpar o valor do input para garantir que onChange sempre dispare
                                        const target = e.target as HTMLInputElement
                                        target.value = ''
                                    }}
                                    ref={fileInputRef}
                                    className="flex-1"
                                />
                                {file && (
                                    <Button variant="ghost" size="icon" onClick={resetFileInput}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                        {file && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileSpreadsheet className="h-4 w-4" />
                                <span>{file.name}</span>
                            </div>
                        )}
                        {importRows && importRows.length > 0 && (
                            <div 
                                className="border rounded-md overflow-auto"
                                style={{ maxHeight: '280px' }}
                            >
                                <Table className="text-xs w-fit min-w-[700px]">
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            {(errors.length > 0 || invalidRows.length > 0) && (
                                                <TableHead className="px-2 py-1 border-b bg-muted font-semibold text-left text-red-600 dark:text-red-400 min-w-[120px] max-w-[200px] truncate">
                                                    Erro/Status
                                                </TableHead>
                                            )}
                                            {Object.keys(importRows[0]).map((col) => (
                                                <TableHead
                                                    key={col}
                                                    className="px-2 py-1 border-b bg-muted font-semibold whitespace-nowrap text-left max-w-[160px] truncate text-muted-foreground"
                                                    style={{ maxWidth: 160 }}
                                                >
                                                    <span className="truncate block" title={col}>{col}</span>
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importRows.map((row, i) => {
                                            const errorObj = errors.find(e => e.row === i + 2); // +2 pois o backend considera header + 1-based
                                            const invalidObj = invalidRows.find(inv => inv.index === i);
                                            const hasError = !!errorObj;
                                            const isInvalid = !!invalidObj;
                                            
                                            const errorMessage = errorObj?.message || 
                                                (invalidObj ? 
                                                    [
                                                        ...(invalidObj.missingFields.length > 0 ? [`Campos obrigatórios: ${invalidObj.missingFields.join(', ')}`] : []),
                                                        ...(invalidObj.duplicatedChassi && invalidObj.duplicateType === 'exact' ? [`Chassi duplicado (exato): ${invalidObj.duplicatedChassi}`] : []),
                                                        ...(invalidObj.duplicatedChassi && invalidObj.duplicateType === 'different' ? [`Chassi duplicado (dados diferentes): ${invalidObj.duplicatedChassi}`] : [])
                                                    ].join(' | ') 
                                                    : ''
                                                );
                                            
                                            return (
                                                <TableRow key={i} className={`border-b last:border-0 hover:bg-muted/40 ${hasError ? 'bg-red-50 dark:bg-red-950/30' : isInvalid ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-card'}`}>
                                                    {(errors.length > 0 || invalidRows.length > 0) && (
                                                        <TableCell className={`px-2 py-1 text-xs max-w-[200px] ${hasError ? 'text-red-600 dark:text-red-400' : isInvalid ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`} title={errorMessage || ''}>
                                                            <div className="flex items-center gap-1">
                                                                <span className="truncate flex-1">
                                                                    {hasError ? errorMessage : isInvalid ? errorMessage : '✓'}
                                                                </span>
                                                                {(hasError || isInvalid) && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-4 w-4 p-0 hover:bg-red-100"
                                                                        onClick={() => removeSpecificRow(i)}
                                                                        title="Remover esta linha"
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                    {Object.values(row).map((val, j) => (
                                                        <TableCell
                                                            key={j}
                                                            className={`px-2 py-1 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis ${hasError ? 'text-red-700 dark:text-red-300' : isInvalid ? 'text-orange-700 dark:text-orange-300' : 'text-card-foreground'}`}
                                                            style={{ maxWidth: 160 }}
                                                        >
                                                            <span className="truncate block" title={String(val)}>{String(val)}</span>
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {isUploading && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Processando...</span>
                                    <span>{progress}%</span>
                                </div>
                                <Progress value={progress} />
                            </div>
                        )}
                        {invalidRows.length > 0 && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Linhas inválidas detectadas</AlertTitle>
                                <AlertDescription>
                                    <ul className="list-disc pl-5 text-sm max-h-40 overflow-y-auto">
                                        {invalidRows.map((invalid, index) => (
                                            <li key={index}>
                                                Linha {invalid.rowNumber}: {
                                                    [
                                                        ...(invalid.missingFields.length > 0 ? [`Campos obrigatórios: ${invalid.missingFields.join(', ')}`] : []),
                                                        ...(invalid.duplicatedChassi && invalid.duplicateType === 'exact' ? [`Chassi duplicado (exato): ${invalid.duplicatedChassi}`] : []),
                                                        ...(invalid.duplicatedChassi && invalid.duplicateType === 'different' ? [`Chassi duplicado com dados diferentes: ${invalid.duplicatedChassi}`] : [])
                                                    ].join(' | ')
                                                }
                                            </li>
                                        ))}
                                    </ul>
                                    {(invalidRows.some(row => row.duplicateType === 'different') || invalidRows.some(row => row.duplicateType === 'exact')) && (
                                        <div className="mt-2 text-sm">
                                            {invalidRows.some(row => row.duplicateType === 'different') && (
                                                <p className="font-medium">
                                                    💡 Use a lixeira na tabela para escolher qual linha manter OU use o botão "Remover linhas inválidas" para remover todas as linhas com chassi duplicado.
                                                </p>
                                            )}
                                            {invalidRows.some(row => row.duplicateType === 'exact') && (
                                                <p className="font-medium">
                                                    🔄 Use o botão "Remover linhas inválidas" para limpar todas as linhas com erro e eliminar duplicatas automaticamente.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                        {errors.length > 0 && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Erros na importação</AlertTitle>
                                <AlertDescription>
                                    <ul className="list-disc pl-5 text-sm max-h-40 overflow-y-auto">
                                        {errors.map((error, index) => (
                                            <li key={index}>
                                                Linha {error.row}: {error.message}
                                            </li>
                                        ))}
                                    </ul>
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="text-sm text-muted-foreground">
                            <p>O arquivo deve conter as seguintes colunas:</p>
                            <ul className="list-disc pl-5">
                                <li>chassi</li>
                                <li>tipo</li>
                                <li>condominio</li>
                                <li>bloco</li>
                                <li>apartamento</li>
                                <li>localizacao (opcional)</li>
                                <li>leitura_inicial</li>
                                <li>ano_fabricacao (opcional)</li>
                                <li>principal (Sim/Não)</li>
                                <li>rotacao (Crescente/Decrescente)</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between px-6 pb-6 pt-2">
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                        </Button>
                        {(invalidRows.filter(row => row.missingFields.length > 0).length > 0 || 
                          invalidRows.filter(row => row.duplicateType === 'exact').length > 0 ||
                          invalidRows.filter(row => row.duplicateType === 'different').length > 0) && (
                            <Button 
                                variant="destructive" 
                                onClick={removeInvalidRows}
                                disabled={isUploading}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remover linhas inválidas ({
                                    invalidRows.filter(row => row.missingFields.length > 0).length +
                                    invalidRows.filter(row => row.duplicateType === 'exact').length +
                                    invalidRows.filter(row => row.duplicateType === 'different').length
                                })
                            </Button>
                        )}
                    </div>
                    <Button 
                        onClick={handleImport} 
                        disabled={!file || isUploading || invalidRows.some(row => row.missingFields.length > 0)}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Importar
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
