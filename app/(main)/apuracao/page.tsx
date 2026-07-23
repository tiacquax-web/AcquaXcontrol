"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, Download, Printer, ChevronLeft, ChevronRight, Building2, Layers, DoorClosed, Gauge, Activity, CalendarCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useDebounce } from "@/hooks/use-debounce"
import ComplexesCombobox from "@/components/ComboboxComplex"
import type { Complex } from "@prisma/client"
import axios from "axios"

interface ApuracaoItem {
    id: string
    socialName: string
    aliasName: string | null
    city: string | null
    state: string | null
    status: string
    totalBlocks: number
    totalApartments: number
    totalMeters: number
    lastReading: string | null
    loginsLast30Days: number
    topApartment: { name: string; logins: number } | null
}

export default function ApuracaoPage() {
    const [search, setSearch] = useState("")
    const [selectedComplex, setSelectedComplex] = useState<Complex | undefined>(undefined)
    const [data, setData] = useState<ApuracaoItem[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [exportLoading, setExportLoading] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const take = 50
    const { toast } = useToast()

    const debouncedSearch = useDebounce(search, 350)

    const fetchData = useCallback(async (page = 1) => {
        setLoading(true)
        try {
            const skip = (page - 1) * take
            const res = await axios.get('/api/apuracao', {
                params: { search: debouncedSearch, take, skip, complexId: selectedComplex?.id }
            })
            setData(res.data.list || [])
            setTotalCount(res.data.totalCount || 0)
        } catch (err: any) {
            toast({ title: "Erro ao carregar", description: err.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }, [debouncedSearch, toast, selectedComplex])

    useEffect(() => {
        setCurrentPage(1)
        fetchData(1)
    }, [debouncedSearch, selectedComplex])

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
        fetchData(page)
    }

    const totalPages = Math.ceil(totalCount / take)

    const handleExport = async () => {
        setExportLoading(true)
        try {
            // Fetch all data for export
            const allPages: ApuracaoItem[] = []
            let page = 1
            let hasMore = true
            while (hasMore) {
                const res = await axios.get('/api/apuracao', { params: { search: debouncedSearch, take: 200, skip: (page - 1) * 200, complexId: selectedComplex?.id } })
                allPages.push(...(res.data.list || []))
                if (allPages.length >= (res.data.totalCount || 0)) hasMore = false
                else page++
            }

            const exportData = allPages.map(item => ({
                'Condomínio': item.socialName || '',
                'Nome Fantasia': item.aliasName || '',
                'Cidade': item.city || '',
                'Estado': item.state || '',
                'Status': item.status || '',
                'Blocos': item.totalBlocks,
                'Apartamentos': item.totalApartments,
                'Medidores': item.totalMeters,
                'Última Leitura': item.lastReading || 'Sem leitura',
                'Logins (30 dias)': item.loginsLast30Days,
                'Apt. mais ativo': item.topApartment ? `${item.topApartment.name} (${item.topApartment.logins} logins)` : '-',
            }))

            const XLSX = await import('xlsx')
            const worksheet = XLSX.utils.json_to_sheet(exportData)
            const colWidths = Object.keys(exportData[0] || {}).map(k => ({
                wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
            }))
            worksheet['!cols'] = colWidths
            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Apuração')
            const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `apuracao_${new Date().toISOString().split('T')[0]}.xlsx`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast({ title: 'Exportação concluída!', description: `${allPages.length} condomínios exportados.` })
        } catch (err: any) {
            toast({ title: 'Erro na exportação', description: err.message, variant: 'destructive' })
        } finally {
            setExportLoading(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="space-y-6 w-full p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-2xl font-bold">Apuração</CardTitle>
                        <CardDescription>
                            Visão geral de cadastros por condomínio — blocos, apartamentos, medidores, leituras e acessos
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExport} disabled={exportLoading}>
                            {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Exportar
                        </Button>
                        <Button variant="outline" onClick={handlePrint}>
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Summary KPIs */}
                        {!loading && data.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                                    <Building2 className="h-8 w-8 text-blue-500 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Condomínios</p>
                                        <p className="text-xl font-bold">{totalCount.toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                                    <DoorClosed className="h-8 w-8 text-green-500 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Aptos (pág.)</p>
                                        <p className="text-xl font-bold">{data.reduce((a, b) => a + b.totalApartments, 0).toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                                    <Gauge className="h-8 w-8 text-orange-500 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Medidores (pág.)</p>
                                        <p className="text-xl font-bold">{data.reduce((a, b) => a + b.totalMeters, 0).toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                                    <Activity className="h-8 w-8 text-purple-500 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Acessos (30d/pág.)</p>
                                        <p className="text-xl font-bold">{data.reduce((a, b) => a + b.loginsLast30Days, 0).toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Filtros */}
                        <div className="flex flex-col sm:flex-row gap-3 mb-2">
                            <div className="flex-1 min-w-[200px]">
                                <ComplexesCombobox
                                    complex={selectedComplex}
                                    setSelectedComplex={(c) => {
                                        setSelectedComplex(c)
                                    }}
                                />
                            </div>
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nome do condomínio..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                        </div>

                        {/* Table */}
                        {loading ? (
                            <div className="flex justify-center items-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Condomínio</TableHead>
                                            <TableHead className="text-center"><Layers className="h-4 w-4 inline mr-1" />Blocos</TableHead>
                                            <TableHead className="text-center"><DoorClosed className="h-4 w-4 inline mr-1" />Aptos</TableHead>
                                            <TableHead className="text-center"><Gauge className="h-4 w-4 inline mr-1" />Medidores</TableHead>
                                            <TableHead className="text-center"><CalendarCheck className="h-4 w-4 inline mr-1" />Última Leitura</TableHead>
                                            <TableHead className="text-center"><Activity className="h-4 w-4 inline mr-1" />Logins 30d</TableHead>
                                            <TableHead>Apt. mais ativo</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                                                    Nenhum condomínio encontrado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">
                                                        <div>
                                                            <div className="font-medium">{item.socialName}</div>
                                                            {item.aliasName && <div className="text-xs text-muted-foreground">{item.aliasName}</div>}
                                                            {item.city && <div className="text-xs text-muted-foreground">{item.city}{item.state ? `, ${item.state}` : ''}</div>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">
                                                        {item.totalBlocks}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">
                                                        {item.totalApartments.toLocaleString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">
                                                        {item.totalMeters.toLocaleString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {item.lastReading ? (
                                                            <Badge variant="outline" className="text-xs">{item.lastReading}</Badge>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className={`font-mono text-sm ${item.loginsLast30Days > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}`}>
                                                            {item.loginsLast30Days}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {item.topApartment ? (
                                                            <span>{item.topApartment.name} <span className="text-muted-foreground text-xs">({item.topApartment.logins})</span></span>
                                                        ) : '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={item.status === 'Ativo' ? 'success' : 'secondary'} className="text-xs">
                                                            {item.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {/* Pagination */}
                        {totalCount > take && (
                            <div className="flex items-center justify-between mt-4">
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                                    <ChevronLeft className="h-4 w-4" /> Anterior
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Página {currentPage} de {totalPages} — {totalCount.toLocaleString('pt-BR')} condomínios
                                </span>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
                                    Próxima <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
