"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle, Upload, X, FileSpreadsheet, Loader2 } from "lucide-react"
import { toast, useToast } from "./ui/use-toast"
import { Progress } from "./ui/progress"

interface ImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    complexId: string
    blockId: string
    onImportComplete: () => void
}

interface ImportError {
    row: number
    message: string
}

export function ImportDialog({ open, onOpenChange, complexId, blockId, onImportComplete }: ImportDialogProps) {
    const { toast } = useToast()
    const [file, setFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [errors, setErrors] = useState<ImportError[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null
        setFile(selectedFile)
        setErrors([])
    }

    const handleImport = async () => {
        if (!file) {
            toast({
                variant: "destructive",
                title: "Nenhum arquivo selecionado",
                description: "Por favor, selecione um arquivo para importar.",
            })
            return
        }

        setIsUploading(true)
        setProgress(0)
        setErrors([])

        try {
            // Simulação de upload e processamento
            for (let i = 0; i <= 100; i += 10) {
                await new Promise((resolve) => setTimeout(resolve, 200))
                setProgress(i)
            }

            // Simulação de erros (remover na implementação real)
            if (Math.random() > 0.7) {
                setErrors([
                    { row: 3, message: "Medidor com CHASSI ABC123 não encontrado" },
                    { row: 5, message: "Leitura de concessionária não encontrada para o mês 05/2023" },
                ])
            } else {
                // Simulação de sucesso
                toast({
                    title: "Importação concluída",
                    description: "Os dados foram importados com sucesso.",
                })
                onImportComplete()
                onOpenChange(false)
            }
        } catch (error) {
            console.error("Erro na importação:", error)
            toast({
                variant: "destructive",
                title: "Erro na importação",
                description: "Ocorreu um erro ao processar o arquivo.",
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
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Importar Relatórios</DialogTitle>
                    <DialogDescription>
                        Faça upload de uma planilha com os dados dos relatórios de consumo. O sistema irá atualizar os registros
                        existentes ou criar novos conforme necessário.
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

                    {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Processando...</span>
                                <span>{progress}%</span>
                            </div>
                            <Progress value={progress} />
                        </div>
                    )}

                    {errors.length > 0 && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Erros na importação</AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc pl-5 text-sm">
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
                            <li>CHASSI (número do medidor)</li>
                            <li>mes_ref (mês de referência)</li>
                            <li>ano_ref (ano de referência)</li>
                            <li>consumo (em m³)</li>
                            <li>valor_total (em R$)</li>
                        </ul>
                    </div>
                </div>

                <DialogFooter className="flex justify-between sm:justify-between">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                        <X className="mr-2 h-4 w-4" />
                        Cancelar
                    </Button>
                    <Button onClick={handleImport} disabled={!file || isUploading}>
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
