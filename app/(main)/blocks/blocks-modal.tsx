"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Block } from "@prisma/client"
import ComplexesCombobox from "@/components/ComboboxComplex"
import * as XLSX from "xlsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createBlocksFromSheet } from "@/services/blocksService"
import { getComplexes } from "@/services/complexesService"

interface BlockModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (block: Partial<Block>) => void
    block: Block | null
}

export default function BlockModal({ isOpen, onClose, onSave, block }: BlockModalProps) {
    const [formData, setFormData] = useState<Partial<Block>>({
        name: "",
        status: "Ativo",
        complexId: "",
        counter: 0,
    })

    useEffect(() => {
        if (block) {
            setFormData({
                ...block,
            })
        } else {
            setFormData({
                name: "",
                status: "Ativo",
                complexId: "",
                counter: 0,
            })
        }
    }, [block, isOpen])

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
            setFormData((prev) => ({ ...prev, complexId: complex.id }))
        }
    }

    // Estado para importação em lote
    const [importRows, setImportRows] = useState<any[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)
    const [importSuccess, setImportSuccess] = useState<string | null>(null)

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
            // Espera cabeçalho: nome | condominio
            const header = json[0].map(h => h.toString().toLowerCase().trim())
            const nameIdx = header.indexOf("nome")
            const condIdx = header.indexOf("condominio")
            if (nameIdx === -1 || condIdx === -1) {
                setImportError("A planilha deve conter as colunas 'nome' e 'condominio'.")
                setImportLoading(false)
                return
            }
            const rows = json.slice(1)
                .filter(r => r[nameIdx] !== undefined && r[nameIdx] !== null && r[nameIdx] !== '' &&
                            r[condIdx] !== undefined && r[condIdx] !== null && r[condIdx] !== '')
                .map(r => ({ name: r[nameIdx], condominio: r[condIdx], status: r[2] ? r[2] : "Ativo" }))
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
            // Busca apenas os condomínios necessários
            const socialNames = importRows.reduce<string[]>((acc, row) => {
                if (!acc.includes(row.condominio)) acc.push(row.condominio)
                return acc
            }, [])
            const data = await getComplexes({ withCompany: false, socialNames })
            const complexList = Array.isArray(data.list) ? data.list : []
            const blocks = importRows.map(row => {
                const complex = complexList.find((c: any) => c.socialName?.toLowerCase().trim() === row.condominio.toLowerCase().trim())
                return {
                    name: String(row.name),
                    complexId: String(complex?.id),
                    status: row.status || "Ativo"
                }
            }).filter(b => b.name !== undefined && b.name !== null && b.name !== '' && 
                          b.complexId !== undefined && b.complexId !== null && b.complexId !== '')
            // Validação mínima
            const notFound = importRows.filter(row => {
                const complex = complexList.find((c: any) => c.socialName?.toLowerCase().trim() === row.condominio.toLowerCase().trim())
                return !complex
            })
            if (notFound.length > 0) {
                const notFoundNames = notFound.reduce<string[]>((acc, b) => {
                    if (b.condominio && !acc.includes(b.condominio)) acc.push(b.condominio)
                    return acc
                }, [])
                setImportError(`Condomínio(s) não encontrado(s): ${notFoundNames.map(n => `'${n}'`).join(', ')}`)
                setImportLoading(false)
                return
            }
            // Envia para o backend usando a service
            const result = await createBlocksFromSheet(blocks)
            if (result?.error) {
                setImportError(result.error || "Erro ao cadastrar blocos.")
            } else {
                setImportSuccess(`Importação concluída! ${blocks.length} blocos cadastrados.`)
                setImportRows([])
                onClose()
            }
        } catch (err) {
            setImportError("Erro inesperado ao importar.")
        }
        setImportLoading(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{block ? "Editar Bloco" : "Novo Bloco ou Importação"}</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="basic" className="mb-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="basic">Cadastro Manual</TabsTrigger>
                        <TabsTrigger value="import">Importar Planilha</TabsTrigger>
                        <TabsTrigger value="additional">Adicional</TabsTrigger>
                    </TabsList>
                    <TabsContent value="basic" className="space-y-4 mt-4">
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="complexId">
                                        Condomínio <span className="text-red-500">*</span>
                                    </Label>
                                    <ComplexesCombobox 
                                        setSelectedComplex={handleSelectedComplex} 
                                        complex={formData.complexId ? { id: formData.complexId } : undefined}
                                        modal 
                                        required 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Nome do Bloco <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name || ""}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>
                            <DialogFooter className="mt-6">
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button type="submit">{block ? "Atualizar" : "Criar"} Bloco</Button>
                            </DialogFooter>
                        </form>
                    </TabsContent>
                    <TabsContent value="import" className="space-y-4 mt-4">
                        <div className="mb-2">
                            <Label>
                                Importe uma planilha (.xlsx ou .csv) com colunas <b>nome</b> e <b>condominio</b>:
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
                                            <TableHead>Condomínio</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importRows.map((row, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{row.name}</TableCell>
                                                <TableCell>{row.condominio}</TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={row.status || "Ativo"}
                                                        onValueChange={value => {
                                                            setImportRows(prev => prev.map((r, i) => i === idx ? { ...r, status: value } : r))
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
                                {importLoading ? "Importando..." : "Importar Blocos"}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                    <TabsContent value="additional" className="space-y-4 mt-4">
                        <div className="grid grid-cols-1 gap-4">
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
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
