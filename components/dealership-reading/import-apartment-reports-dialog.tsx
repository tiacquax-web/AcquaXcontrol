"use client"

import { useState, useRef } from "react"
import { Upload, FileText, AlertTriangle, CheckCircle, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useComplexes } from "@/hooks/useComplexes"
import { useImportApartmentReports } from "@/hooks/useImportApartmentReports"
import { ApartmentWithConsumptionReport } from "@/types/apartment"

interface ImportApartmentReportsDialogProps {
  monthRef: string
  yearRef: string
  complexId: string
  onImportSuccess: (importedData: Partial<ApartmentWithConsumptionReport>[]) => void
}

export function ImportApartmentReportsDialog({ 
  monthRef, 
  yearRef, 
  complexId, 
  onImportSuccess 
}: ImportApartmentReportsDialogProps) {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { complexes, loading: complexesLoading, error: complexesError } = useComplexes({id: complexId})
  
  const {
    file,
    setFile,
    isValidating,
    validationResult,
    isImporting,
    validateFile,
    importData,
    clearData,
  } = useImportApartmentReports()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const handleValidate = async () => {
    if (!file) return

    // Check if complexes are still loading
    if (complexesLoading) {
      toast({
        title: "Aguarde",
        description: "Aguarde o carregamento dos condomínios...",
        variant: "destructive",
      })
      return
    }

    // Check if there was an error loading complexes
    if (complexesError) {
      toast({
        title: "Erro",
        description: `Erro ao carregar condomínios: ${complexesError}`,
        variant: "destructive",
      })
      return
    }

    try {
      await validateFile(file, monthRef, yearRef, complexes)
      
      if (validationResult?.isValid) {
        toast({
          title: "Validação concluída",
          description: `${validationResult.validRows.length} linhas válidas encontradas.`,
        })
      } else if (validationResult) {
        toast({
          title: "Erros encontrados na validação",
          description: `${validationResult.errors.length} erro(s) encontrado(s).`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Erro ao validar arquivo",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleImport = async () => {
    try {
      await importData((convertedData) => {
        onImportSuccess(convertedData)
        
        toast({
          title: "Importação concluída",
          description: `${validationResult?.validRows.length} registros importados com sucesso.`,
        })

        // Reset state and close dialog
        setOpen(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      })
    } catch (error: any) {
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleCancel = () => {
    setOpen(false)
    clearData()
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Relatórios de Apartamentos</DialogTitle>
          <DialogDescription>
            Importe uma planilha Excel com os dados de consumo dos apartamentos para o período {monthRef}/{yearRef}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Upload Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.ods"
                onChange={handleFileSelect}
                className="flex-1"
              />
              <Button
                onClick={handleValidate}
                disabled={!file || isValidating || complexesLoading}
                variant="outline"
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Validar
              </Button>
            </div>

            {file && (
              <div className="text-sm text-muted-foreground">
                Arquivo selecionado: {file.name}
              </div>
            )}

            {/* Show complexes loading/error state */}
            {complexesLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando condomínios...
              </div>
            )}

            {complexesError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar condomínios: {complexesError}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-2">
                {validationResult.isValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-medium">
                  {validationResult.isValid ? "Validação aprovada" : "Validação reprovada"}
                </span>
              </div>

              {/* Complex Info */}
              {validationResult.complexName && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Condomínio:</span>
                  <Badge variant={validationResult.complexExists ? "default" : "destructive"}>
                    {validationResult.complexName}
                  </Badge>
                  {!validationResult.complexExists && (
                    <span className="text-sm text-destructive">não encontrado</span>
                  )}
                </div>
              )}

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium">Linhas válidas:</span> {validationResult.validRows.length}
                </div>
                <div>
                  <span className="font-medium">Erros:</span> {validationResult.errors.length}
                </div>
                <div>
                  <span className="font-medium">Avisos:</span> {validationResult.warnings.length}
                </div>
              </div>

              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Erros encontrados:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.errors.map((error: string, index: number) => (
                          <li key={index} className="text-sm">{error}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Avisos:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.warnings.map((warning: string, index: number) => (
                          <li key={index} className="text-sm">{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={!validationResult?.isValid || isImporting || validationResult.validRows.length === 0}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar ({validationResult?.validRows.length || 0} registros)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
