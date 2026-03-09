"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle, Upload, X, FileSpreadsheet, Loader2, Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "./ui/progress"
import * as XLSX from "xlsx"
import { useReadingMutations } from "@/hooks/useReadings"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table"
import { Badge } from "./ui/badge"

interface ImportReadingsDialogProps {
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
    row: any
}

interface LoadedFile {
    file: File
    rows: any[]
}

// Checks if a row is completely empty (all values null/undefined/"")
function isEmptyRow(row: any): boolean {
    return Object.values(row).every(
        v => v === null || v === undefined || String(v).trim() === ""
    )
}

export function ImportReadingsDialog({ open, onOpenChange, onImportComplete }: ImportReadingsDialogProps) {
    const { toast } = useToast()
    const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [errors, setErrors] = useState<ImportError[]>([])
    const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([])
    const [generalError, setGeneralError] = useState<string | null>(null)
    const [allowUpdates, setAllowUpdates] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { createReadingsFromSheetMutation, loading: loadingMutation } = useReadingMutations()

    // All rows merged from all files
    const importRows: any[] = loadedFiles.flatMap(lf => lf.rows)

    // Validate a single row
    const validateRow = (row: any, index: number): InvalidRow | null => {
        const requiredFields = ['chassi', 'leitura', 'mes_ref', 'ano_ref', 'data_leitura', 'pre_leitura']
        const missingFields: string[] = []

        for (const field of requiredFields) {
            if (row[field] === null || row[field] === undefined || String(row[field]).trim() === '') {
                missingFields.push(field)
            }
        }

        if (missingFields.length > 0) {
            return {
                index,
                rowNumber: index + 2,
                missingFields,
                row
            }
        }

        return null
    }

    // Validate all rows
    const validateImportRows = (rows: any[]) => {
        const invalid: InvalidRow[] = []
        rows.forEach((row, index) => {
            const invalidRow = validateRow(row, index)
            if (invalidRow) {
                invalid.push(invalidRow)
            }
        })

        setInvalidRows(invalid)

        if (invalid.length > 0) {
            toast({
                variant: "destructive",
                title: "Algumas linhas são inválidas",
                description: `${invalid.length} linha(s) com campos obrigatórios em branco. Verifique ou remova-as para continuar.`
            })
        }
    }

    // Remove invalid rows from all loaded files
    const removeInvalidRows = () => {
        if (importRows.length === 0) return

        // Build a set of global indexes to remove
        const indexesToRemove = new Set(invalidRows.map(ir => ir.index))

        // Rebuild per-file rows without the invalid ones
        let globalIndex = 0
        const updatedFiles = loadedFiles.map(lf => {
            const filtered = lf.rows.filter(() => {
                const keep = !indexesToRemove.has(globalIndex)
                globalIndex++
                return keep
            })
            return { ...lf, rows: filtered }
        })

        setLoadedFiles(updatedFiles)
        setInvalidRows([])

        toast({
            title: "Linhas inválidas removidas",
            description: `${invalidRows.length} linhas foram removidas.`
        })
    }

    // Re-validate when merged rows change
    useEffect(() => {
        if (importRows.length > 0) {
            validateImportRows(importRows)
        } else {
            setInvalidRows([])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedFiles])

    // Parse a single file into rows (skip fully empty rows)
    const parseFile = async (file: File): Promise<any[]> => {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: "array" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" })
        // Filter out completely empty rows
        return json.filter(row => !isEmptyRow(row))
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        setIsUploading(true)
        setErrors([])
        setGeneralError(null)

        try {
            const newLoaded: LoadedFile[] = []
            for (const file of files) {
                // Skip if already loaded
                if (loadedFiles.some(lf => lf.file.name === file.name && lf.file.size === file.size)) {
                    toast({
                        variant: "destructive",
                        title: "Arquivo duplicado",
                        description: `${file.name} já foi adicionado.`
                    })
                    continue
                }
                const rows = await parseFile(file)
                newLoaded.push({ file, rows })
            }
            if (newLoaded.length > 0) {
                setLoadedFiles(prev => [...prev, ...newLoaded])
            }
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Erro ao ler arquivo",
                description: err?.message || "Não foi possível ler o arquivo.",
            })
        } finally {
            setIsUploading(false)
            // Reset input so the same file can be added again if needed
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const removeFile = (index: number) => {
        setLoadedFiles(prev => prev.filter((_, i) => i !== index))
        setErrors([])
        setInvalidRows([])
        setGeneralError(null)
    }

    const handleImport = async () => {
        if (importRows.length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum dado para importar",
                description: "Selecione pelo menos um arquivo válido para importar.",
            })
            return
        }
        setIsUploading(true)
        setProgress(0)
        setErrors([])
        setGeneralError(null)
        try {
            const result = await createReadingsFromSheetMutation(importRows, allowUpdates)
            if (result.generalError) {
                setGeneralError(result.generalError)
                toast({
                    variant: "destructive",
                    title: "Erro geral na importação",
                    description: result.generalError,
                })
            } else if (result.errors && result.errors.length > 0) {
                setErrors(result.errors)
                const updatedText = result.updated > 0 ? `, ${result.updated} atualizados` : '';
                toast({
                    variant: "destructive",
                    title: "Importação concluída com erros",
                    description: `${result.created} criados${updatedText}, ${result.errors.length} erros.`,
                })
            } else if (result.details && Array.isArray(result.details)) {
                setErrors(result.details)
                const updatedText = result.updated > 0 ? `, ${result.updated} atualizados` : '';
                toast({
                    variant: "destructive",
                    title: result.error || "Importação concluída com erros",
                    description: `${result.created ?? 0} criados${updatedText}, ${result.details.length} erros.`,
                })
            } else {
                const updatedText = result.updated > 0 ? ` e ${result.updated} atualizadas` : '';
                toast({
                    title: "Importação concluída",
                    description: `${result.created} leituras criadas${updatedText} com sucesso.`,
                })
                onImportComplete()
                onOpenChange(false)
            }
        } catch (error: any) {
            setGeneralError(error?.generalError || error?.message || "Erro inesperado.")
            toast({
                variant: "destructive",
                title: "Erro na importação",
                description: error?.generalError || error?.message || "Ocorreu um erro ao processar o arquivo.",
            })
        } finally {
            setIsUploading(false)
        }
    }

    const resetAll = () => {
        if (fileInputRef.current) fileInputRef.current.value = ""
        setLoadedFiles([])
        setErrors([])
        setInvalidRows([])
        setGeneralError(null)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl w-full p-0 sm:p-0 rounded-lg shadow-lg border bg-background" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="flex flex-col flex-1 overflow-y-auto p-6">
                    <DialogHeader>
                        <DialogTitle>Importar Leituras</DialogTitle>
                        <DialogDescription>
                            Faça upload de uma ou mais planilhas (ex: Fase I e Fase II). Linhas completamente vazias são ignoradas automaticamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {/* File picker */}
                        <div className="space-y-2">
                            <Label htmlFor="file">Arquivo(s) de Planilha</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="file"
                                    type="file"
                                    accept=".xlsx,.xls,.csv,.ods"
                                    multiple
                                    onChange={handleFileChange}
                                    ref={fileInputRef}
                                    className="flex-1"
                                    disabled={isUploading}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    title="Adicionar mais arquivos"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Você pode selecionar múltiplos arquivos de uma vez (Fase I e Fase II, por exemplo).
                            </p>
                        </div>

                        {/* Loaded files list */}
                        {loadedFiles.length > 0 && (
                            <div className="space-y-2">
                                {loadedFiles.map((lf, i) => (
                                    <div key={i} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
                                        <div className="flex items-center gap-2">
                                            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium truncate max-w-[280px]" title={lf.file.name}>{lf.file.name}</span>
                                            <Badge variant="secondary" className="text-xs">{lf.rows.length} linhas</Badge>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => removeFile(i)}
                                            disabled={isUploading}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                {loadedFiles.length > 1 && (
                                    <div className="text-xs text-muted-foreground px-1">
                                        Total combinado: <strong>{importRows.length}</strong> linhas
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview table */}
                        {importRows.length > 0 && (
                            <div className="border rounded-md overflow-auto" style={{ maxHeight: '260px' }}>
                                <Table className="text-xs w-fit min-w-[700px]">
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            {(errors.length > 0 || invalidRows.length > 0) && (
                                                <TableHead className="px-2 py-1 border-b bg-muted font-semibold text-left text-red-600 dark:text-red-400 min-w-[120px] max-w-[200px] truncate">
                                                    Erro/Status
                                                </TableHead>
                                            )}
                                            {Object.keys(importRows[0]).map((col) => (
                                                <TableHead key={col} className="px-2 py-1 border-b bg-muted font-semibold whitespace-nowrap text-left max-w-[160px] truncate text-muted-foreground" style={{ maxWidth: 160 }}>
                                                    <span className="truncate block" title={col}>{col}</span>
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importRows.map((row, i) => {
                                            const errorObj = errors.find(e => e.row === i + 2)
                                            const invalidRowObj = invalidRows.find(invalid => invalid.index === i)
                                            const isInvalid = !!invalidRowObj
                                            const hasError = !!errorObj

                                            return (
                                                <TableRow key={i} className={`border-b last:border-0 hover:bg-muted/40 ${hasError ? 'bg-red-50 dark:bg-red-950/30' : isInvalid ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-card'}`}>
                                                    {(errors.length > 0 || invalidRows.length > 0) && (
                                                        <TableCell className={`px-2 py-1 text-xs max-w-[200px] truncate ${hasError ? 'text-red-600 dark:text-red-400' : isInvalid ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`} title={errorObj?.message || (isInvalid ? `Campos obrigatórios faltando: ${invalidRowObj?.missingFields.join(', ')}` : '')}>
                                                            {errorObj ? errorObj.message : isInvalid ? `Faltando: ${invalidRowObj?.missingFields.join(', ')}` : '✓'}
                                                        </TableCell>
                                                    )}
                                                    {Object.values(row).map((val, j) => (
                                                        <TableCell key={j} className={`px-2 py-1 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis ${hasError ? 'text-red-700 dark:text-red-300' : isInvalid ? 'text-orange-700 dark:text-orange-300' : 'text-card-foreground'}`} style={{ maxWidth: 160 }}>
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
                                    {invalidRows.length} linha(s) possuem campos obrigatórios em branco.
                                    Corrija os dados ou remova essas linhas para continuar com a importação.
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

                        {generalError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Erro geral na importação</AlertTitle>
                                <AlertDescription>
                                    {generalError}
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="text-sm text-muted-foreground">
                            <p>O arquivo deve conter as seguintes colunas:</p>
                            <ul className="list-disc pl-5">
                                <li>chassi</li>
                                <li>leitura</li>
                                <li>mes_ref</li>
                                <li>ano_ref</li>
                                <li>data_leitura</li>
                                <li>prox_leitura (opcional)</li>
                                <li>foto (opcional)</li>
                                <li>pre_leitura (Sim/Não)</li>
                            </ul>
                        </div>

                        {/* Switch para permitir atualizações */}
                        <div className="flex items-center space-x-2 pt-4 border-t">
                            <Switch
                                id="allow-updates"
                                checked={allowUpdates}
                                onCheckedChange={setAllowUpdates}
                                disabled={isUploading}
                            />
                            <Label htmlFor="allow-updates" className="text-sm">
                                Atualizar existentes
                            </Label>
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between px-6 pb-6 pt-2">
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                            <X className="mr-2 h-4 w-4" />
                            Cancelar
                        </Button>
                        {loadedFiles.length > 0 && (
                            <Button variant="ghost" onClick={resetAll} disabled={isUploading}>
                                Limpar tudo
                            </Button>
                        )}
                        {invalidRows.length > 0 && (
                            <Button
                                variant="destructive"
                                onClick={removeInvalidRows}
                                disabled={isUploading}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remover inválidas ({invalidRows.length})
                            </Button>
                        )}
                    </div>
                    <Button
                        onClick={handleImport}
                        disabled={importRows.length === 0 || isUploading || invalidRows.length > 0}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Importar {importRows.length > 0 ? `(${importRows.length} linhas)` : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
