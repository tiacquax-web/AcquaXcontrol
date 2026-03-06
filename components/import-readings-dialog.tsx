"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle, Upload, X, FileSpreadsheet, Loader2, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "./ui/progress"
import * as XLSX from "xlsx"
import { useReadingMutations } from "@/hooks/useReadings"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table"

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

export function ImportReadingsDialog({ open, onOpenChange, onImportComplete }: ImportReadingsDialogProps) {
    const { toast } = useToast()
    const [file, setFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [errors, setErrors] = useState<ImportError[]>([])
    const [importRows, setImportRows] = useState<any[] | null>(null)
    const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([])
    const [generalError, setGeneralError] = useState<string | null>(null)
    const [allowUpdates, setAllowUpdates] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { createReadingsFromSheetMutation, loading: loadingMutation } = useReadingMutations()

    // Função para validar uma linha
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
                rowNumber: index + 2, // +2 porque Excel começa em 1 e tem o header
                missingFields,
                row
            }
        }

        return null
    }

    // Função para validar todas as linhas
    const validateImportRows = (rows: any[]) => {
        const invalid: InvalidRow[] = []
        console.log(rows)
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
                description: "Verifique-as e confirme a correção"
            })
        }
    }

    // Função para remover linhas inválidas
    const removeInvalidRows = () => {
        if (!importRows) return

        const validRows = importRows.filter((_, index) => 
            !invalidRows.some(invalid => invalid.index === index)
        )

        setImportRows(validRows)
        setInvalidRows([])

        toast({
            title: "Linhas inválidas removidas",
            description: `${invalidRows.length} linhas foram removidas. ${validRows.length} linhas restantes.`
        })
    }

    // Effect para validar quando importRows mudar
    useEffect(() => {
        if (importRows && importRows.length > 0) {
            validateImportRows(importRows)
        }
    }, [importRows])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null
        setFile(selectedFile)
        setErrors([])
        setImportRows(null)
        setInvalidRows([])
        if (selectedFile) {
            setIsUploading(true)
            try {
                const data = await selectedFile.arrayBuffer()
                const workbook = XLSX.read(data, { type: "array" })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" })
                setImportRows(json)
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

    const resetFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
        setFile(null)
        setErrors([])
        setInvalidRows([])
        setImportRows(null)
        setGeneralError(null)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl w-full p-0 sm:p-0 rounded-lg shadow-lg border bg-background" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="flex flex-col flex-1 overflow-y-auto p-6">
                    <DialogHeader>
                        <DialogTitle>Importar Leituras</DialogTitle>
                        <DialogDescription>
                            Faça upload de uma planilha com os dados das leituras. O sistema irá atualizar os registros existentes ou criar novos conforme necessário.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="file">Arquivo de Planilha</Label>
                            <div className="flex items-center gap-2">
                                <Input id="file" type="file" accept=".xlsx,.xls,.csv,.ods" onChange={handleFileChange} ref={fileInputRef} className="flex-1" />
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
                            <div className="border rounded-md overflow-auto" style={{ maxHeight: '280px' }}>
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
                        {invalidRows.length > 0 && (
                            <Button 
                                variant="destructive" 
                                onClick={removeInvalidRows}
                                disabled={isUploading}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remover linhas inválidas ({invalidRows.length})
                            </Button>
                        )}
                    </div>
                    <Button 
                        onClick={handleImport} 
                        disabled={!file || isUploading || invalidRows.length > 0}
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
