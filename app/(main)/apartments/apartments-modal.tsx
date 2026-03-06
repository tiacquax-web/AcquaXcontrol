"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Apartment } from "@prisma/client"
import BlocksCombobox from "@/components/ComboboxBlock"
import ComplexesCombobox from "@/components/ComboboxComplex"
import * as XLSX from "xlsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createApartmentsFromSheet } from "@/services/apartmentService"

interface ApartmentModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (apartment: Partial<Apartment>) => void
    apartment: Apartment | null
}

export default function ApartmentModal({ isOpen, onClose, onSave, apartment }: ApartmentModalProps) {
    const [formData, setFormData] = useState<Partial<Apartment>>({
        name: "",
        status: "Ativo",
        blockId: "",
        fraction: 0,
        counter: 0,
    })
    const [complexId, setComplexId] = useState<string>("")
    const [selectedComplex, setSelectedComplex] = useState<any | undefined>(undefined)
    const [selectedBlock, setSelectedBlock] = useState<any | undefined>(undefined)

    // Estado para importação em lote
    const [importRows, setImportRows] = useState<any[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)
    const [importSuccess, setImportSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (apartment) {
            setFormData({
                ...apartment,
            })
            // Se vier o bloco e o complexo, preenche os estados para os comboboxes
            const aptAny = apartment as any;
            if (aptAny.block) {
                setSelectedBlock(aptAny.block)
                setFormData((prev) => ({ ...prev, blockId: aptAny.block.id }))
                if (aptAny.block.complex) {
                    setSelectedComplex(aptAny.block.complex)
                    setComplexId(aptAny.block.complex.id)
                }
            }
        } else {
            setFormData({
                name: "",
                status: "Ativo",
                blockId: "",
                fraction: 0,
                counter: 0,
            })
            setSelectedComplex(undefined)
            setSelectedBlock(undefined)
            setComplexId("")
        }
    }, [apartment, isOpen])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    const handleSelectedComplex = (complex: { id: string; socialName: string } | undefined) => {
        if (complex) {
            setComplexId(complex.id)
            setSelectedComplex(complex)
        } else {
            setComplexId("")
            setSelectedComplex(undefined)
        }
        // Limpa bloco ao trocar condomínio
        setSelectedBlock(undefined)
        setFormData((prev) => ({ ...prev, blockId: "" }))
    }

    const handleSelectedBlock = (block: { id: string; name: string } | undefined) => {
        if (block) {
            setFormData((prev) => ({ ...prev, blockId: block.id }))
            setSelectedBlock(block)
        } else {
            setFormData((prev) => ({ ...prev, blockId: "" }))
            setSelectedBlock(undefined)
        }
    }

    // Handler para upload e parsing da planilha
    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setImportError(null)
        setImportSuccess(null)
        const file = e.target.files?.[0]
        if (!file) return
        setImportLoading(true)
        try {
            const data = await file.arrayBuffer()
            const workbook = XLSX.read(data)
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
            // Espera cabeçalho: nome | bloco | condominio | fracao
            const header = json[0].map((h) => h.toString().toLowerCase().trim())
            const nameIdx = header.indexOf("nome")
            const blocoIdx = header.indexOf("bloco")
            const condIdx = header.indexOf("condominio")
            const fracaoIdx = header.indexOf("fracao")
            if (nameIdx === -1 || blocoIdx === -1 || condIdx === -1) {
                setImportError("A planilha deve conter as colunas 'nome', 'bloco' e 'condominio'.")
                setImportLoading(false)
                return
            }
            const rows = json
                .slice(1)
                .filter((r) => r[nameIdx] !== undefined && r[nameIdx] !== null && r[nameIdx] !== '' &&
                              r[blocoIdx] !== undefined && r[blocoIdx] !== null && r[blocoIdx] !== '' &&
                              r[condIdx] !== undefined && r[condIdx] !== null && r[condIdx] !== '')
                .map((r) => ({
                    name: String(r[nameIdx]),
                    bloco: String(r[blocoIdx]),
                    condominio: String(r[condIdx]),
                    fraction: fracaoIdx !== -1 ? r[fracaoIdx] : undefined,
                    status: r[4] ? r[4] : "Ativo",
                }))
                console.log(rows)
            setImportRows(rows)
        } catch (err) {
            setImportError("Erro ao ler a planilha. Verifique o formato.")
        }
        setImportLoading(false)
    }

    // Envio em lote para o backend
    const handleImportSubmit = async () => {
        setImportLoading(true)
        setImportError(null)
        setImportSuccess(null)
        try {
            // Envia os dados direto para o backend, que faz toda a validação
            const result = await createApartmentsFromSheet(importRows)
            if (result?.error) {
                // Mostra todos os erros retornados pelo backend
                if (result.details && Array.isArray(result.details)) {
                    setImportError(result.details.map((e: any) => `Linha ${e.row}: ${e.message}`).join("\n"))
                } else {
                    setImportError(result.error || "Erro ao cadastrar apartamentos.")
                }
            } else {
                setImportSuccess(`Importação concluída! ${result.count || importRows.length} apartamentos cadastrados.`)
                setImportRows([])
                onClose()
            }
        } catch (err: any) {
            setImportError(err?.response?.data?.error || "Erro inesperado ao importar.")
            if (err?.response?.data?.details) {
                setImportError(err.response.data.details.map((e: any) => `Linha ${e.row}: ${e.message}`).join("\n"))
            }
            console.error("Erro ao importar apartamentos:", err)
        }
        setImportLoading(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{apartment ? "Editar Apartamento" : "Novo Apartamento ou Importação"}</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="basic" className="mb-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="basic">Cadastro Manual</TabsTrigger>
                        <TabsTrigger value="import">Importar Planilha</TabsTrigger>
                    </TabsList>
                    <TabsContent value="basic" className="space-y-4 mt-4">
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="blockId">
                                        Condomínio <span className="text-red-500">*</span>
                                    </Label>
                                    <ComplexesCombobox setSelectedComplex={handleSelectedComplex} complex={selectedComplex} modal required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="blockId">
                                        Bloco <span className="text-red-500">*</span>
                                    </Label>
                                    <BlocksCombobox complexId={complexId} setSelectedBlock={handleSelectedBlock} block={selectedBlock} modal required />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Número do Apartamento <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name || ""}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fraction">
                                        Fração <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="fraction"
                                        name="fraction"
                                        type="number"
                                        step="0.00000001"
                                        value={formData.fraction || 0}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Select
                                        value={formData.status || "Ativo"}
                                        onValueChange={(value) => handleSelectChange("status", value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Ativo">Ativo</SelectItem>
                                            <SelectItem value="Inativo">Inativo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter className="mt-4">
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button type="submit">Salvar</Button>
                            </DialogFooter>
                        </form>
                    </TabsContent>

                    <TabsContent value="import" className="space-y-4 mt-4">
                        <div className="mb-2">
                            <Label>
                                Importe uma planilha (.xlsx ou .csv) com colunas <b>nome</b>, <b>bloco</b>, <b>condominio</b> e{" "}
                                <b>fracao</b> (opcional):
                            </Label>
                            <Input type="file" accept=".xlsx,.csv,.ods" onChange={handleImportFile} disabled={importLoading} />
                        </div>
                        {importError && <div className="text-red-500 text-sm mb-2">{importError}</div>}
                        {importSuccess && <div className="text-green-600 text-sm mb-2">{importSuccess}</div>}
                        {importRows.length > 0 && (
                            <div className="border rounded p-2 max-h-64 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Bloco</TableHead>
                                            <TableHead>Condomínio</TableHead>
                                            <TableHead>Fração</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importRows.map((row, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{row.name}</TableCell>
                                                <TableCell>{row.bloco}</TableCell>
                                                <TableCell>{row.condominio}</TableCell>
                                                <TableCell>{row.fraction}</TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={row.status || "Ativo"}
                                                        onValueChange={(value) => {
                                                            setImportRows((prev) =>
                                                                prev.map((r, i) => (i === idx ? { ...r, status: value } : r))
                                                            )
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-28">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Ativo">Ativo</SelectItem>
                                                            <SelectItem value="Inativo">Inativo</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        <DialogFooter className="mt-4">
                            <Button type="button" variant="outline" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                onClick={handleImportSubmit}
                                disabled={importLoading || importRows.length === 0}
                            >
                                {importLoading ? "Importando..." : "Importar Apartamentos"}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
