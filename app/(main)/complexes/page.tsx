"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Download, Loader2, MapPin, Phone, Plus, Search, Upload } from "lucide-react"
import { useComplexes, useComplexMutations } from "@/hooks/useComplexes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import ComplexModal from "./complexes-modal"
import type { Complex } from "@prisma/client"
import type { ComplexFull } from "@/types/fullTypes"
import axios from "axios"
import { useRef } from "react"

export default function ComplexesPage() {
    const [filters, setFilters] = useState({ nameQuery: "", documentCompany: "" })
    const { complexes, error, loading } = useComplexes(filters)
    const { createComplex, updateComplex, deleteComplex, error: mutationError } = useComplexMutations()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentComplex, setCurrentComplex] = useState<Complex | null>(null)
    const { toast } = useToast()
    // Estado local para lista reativa
    const [localComplexes, setLocalComplexes] = useState<ComplexFull[]>([])
    const [exportLoading, setExportLoading] = useState(false)
    const [importLoading, setImportLoading] = useState(false)
    const importInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setLocalComplexes(complexes)
    }, [complexes])

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFilters((prev) => ({ ...prev, [name]: value }))
    }

    const handleAddComplex = () => {
        setCurrentComplex(null)
        setIsModalOpen(true)
    }

    const handleEditComplex = (complex: Complex) => {
        setCurrentComplex(complex)
        setIsModalOpen(true)
    }

    const handleSaveComplex = async (complexData: Partial<Complex>) => {
        try {
            if (currentComplex) {
                const updatedComplex = await updateComplex(currentComplex.id, { ...currentComplex, ...complexData })
                if (!updatedComplex) {
                    throw new Error("Erro ao atualizar condomínio")
                }
                // Atualiza o item editado na lista local
                setLocalComplexes((prev) => prev.map((c) => c.id === currentComplex.id ? { ...c, ...complexData } : c))
            } else {
                // Criação: recebe o objeto criado e adiciona na lista local
                const created = await createComplex(complexData as Complex)
                if (created && created.id) {
                    setLocalComplexes((prev) => [created, ...prev])
                }
            }
            setIsModalOpen(false)
        } catch (error) {
            console.error("Erro ao salvar condomínio:", error)
        }
    }

    const handleExportComplexes = async () => {
        setExportLoading(true)
        try {
            const response = await axios.post('/api/user/complexes/export', {
                search: filters.nameQuery,
            }, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `condominios_${new Date().toISOString().split('T')[0]}.xlsx`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast({ title: 'Exportação concluída!', description: 'Planilha baixada com sucesso.' })
        } catch (error: any) {
            toast({ title: 'Erro na exportação', description: error.response?.data?.error || error.message, variant: 'destructive' })
        } finally {
            setExportLoading(false)
        }
    }

    const handleImportComplexes = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImportLoading(true)
        try {
            const XLSX = (await import('xlsx')).default || (await import('xlsx'))
            const reader = new FileReader()
            reader.onload = async (ev) => {
                try {
                    const data = new Uint8Array(ev.target?.result as ArrayBuffer)
                    const workbook = XLSX.read(data, { type: 'array' })
                    const sheet = workbook.Sheets[workbook.SheetNames[0]]
                    const rows: any[] = XLSX.utils.sheet_to_json(sheet)
                    const importedComplexes: any[] = []
                    for (const row of rows) {
                        const complexData = {
                            socialName: row['Nome'] || row['socialName'] || row['name'] || '',
                            aliasName: row['Nome Fantasia'] || row['aliasName'] || '',
                            documentCompany: row['CNPJ'] || row['documentCompany'] || '',
                            city: row['Cidade'] || row['city'] || '',
                            state: row['Estado'] || row['state'] || '',
                            address: row['Endereço'] || row['address'] || '',
                            telephone: row['Telefone'] || row['telephone'] || '',
                            cell: row['Celular'] || row['cell'] || '',
                            status: row['Status'] || row['status'] || 'Ativo',
                        }
                        if (!complexData.socialName) continue
                        const created = await createComplex(complexData as any)
                        if (created?.id) importedComplexes.push(created)
                    }
                    setLocalComplexes((prev) => [...importedComplexes, ...prev])
                    toast({ title: `${importedComplexes.length} condomínio(s) importado(s)!`, description: 'Importação concluída com sucesso.' })
                } catch (err: any) {
                    toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' })
                } finally {
                    setImportLoading(false)
                }
            }
            reader.readAsArrayBuffer(file)
        } catch (err: any) {
            toast({ title: 'Erro', description: err.message, variant: 'destructive' })
            setImportLoading(false)
        }
        if (importInputRef.current) importInputRef.current.value = ''
    }

    const handleDownloadTemplate = async () => {
        const XLSX = (await import('xlsx')).default || (await import('xlsx'))
        const template = [
            {
                'Nome': 'Ex: Residencial Solar',
                'Nome Fantasia': 'Ex: Solar',
                'CNPJ': '00.000.000/0000-00',
                'Cidade': 'São Paulo',
                'Estado': 'SP',
                'Endereço': 'Rua das Flores, 123',
                'Telefone': '(11) 3000-0000',
                'Celular': '(11) 90000-0000',
                'Status': 'Ativo',
            },
            {
                'Nome': 'Ex: Condomínio Verde',
                'Nome Fantasia': 'Verde',
                'CNPJ': '',
                'Cidade': 'Campinas',
                'Estado': 'SP',
                'Endereço': 'Av. Central, 456',
                'Telefone': '',
                'Celular': '',
                'Status': 'Ativo',
            },
        ]
        const worksheet = XLSX.utils.json_to_sheet(template)
        worksheet['!cols'] = Object.keys(template[0]).map(k => ({ wch: Math.max(k.length, 25) }))
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Condomínios')
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'modelo_importacao_condominios.xlsx'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        toast({ title: 'Modelo baixado!', description: 'Preencha a planilha e importe de volta.' })
    }

    const handleDeleteComplex = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir este condomínio?")) {
            try {
                const deletedComplex = await deleteComplex(id)
                if (deletedComplex) {
                    setLocalComplexes((prev) => prev.filter((c) => c.id !== id))
                }
            } catch (error) {
                console.error("Erro ao excluir condomínio:", error)
            }
        }
    }

    useEffect(() => {
        if (mutationError) {
            toast({
                title: "Erro",
                description: mutationError,
                variant: "destructive",
            });
        }
        if (error) {
            toast({
                title: "Erro",
                description: error,
                variant: "destructive",
            })
        }
    }, [error, mutationError, toast])

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold">Condomínios</CardTitle>
                        <CardDescription>Gerencie condomínios e suas informações</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExportComplexes} disabled={exportLoading}>
                            {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Exportar
                        </Button>
                        <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importLoading}>
                            {importLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Importar Planilha
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} title="Baixar modelo de planilha">
                            <Download className="mr-1 h-3 w-3" /> Modelo
                        </Button>
                        <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportComplexes} />
                        <Button onClick={handleAddComplex}>
                            <Plus className="mr-2 h-4 w-4" /> Adicionar Condomínio
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    name="nameQuery"
                                    placeholder="Buscar por nome"
                                    value={filters.nameQuery}
                                    onChange={handleFilterChange}
                                    className="pl-8"
                                />
                            </div>
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    name="documentCompany"
                                    placeholder="Buscar por CNPJ"
                                    value={filters.documentCompany}
                                    onChange={handleFilterChange}
                                    className="pl-8"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 text-red-500">
                                Erro para carregar condomínios: { error }
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Localização</TableHead>
                                            <TableHead>CNPJ</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Contato</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {localComplexes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                    Nenhum condomínio encontrado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            localComplexes.map((complex) => (
                                                <TableRow key={complex.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                <div>{complex.socialName}</div>
                                                                {complex.aliasName && (
                                                                    <div className="text-xs text-muted-foreground">{complex.aliasName}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                                            <div>
                                                                {complex.city && complex.state ? (
                                                                    <div>
                                                                        {complex.city}, {complex.state}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">-</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{complex.documentCompany || "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={complex.status === "Ativo" ? "success" : "secondary"}>
                                                            {complex.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {complex.telephone || complex.cell ? (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                                <span>{complex.telephone || complex.cell}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground">Sem contato</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleEditComplex(complex)}>
                                                                Editar
                                                            </Button>
                                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteComplex(complex.id)}>
                                                                Deletar
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <ComplexModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveComplex}
                complex={currentComplex}
            />
        </div>
    )
}

