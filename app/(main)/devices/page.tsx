"use client"

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Upload, FileSpreadsheet, CheckCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DeviceIotModal from "./devices-modal";
import { useDeviceIot } from "@/hooks/useDeviceIot";
import { useDeviceIotMutations } from "@/hooks/useDeviceIotMutations";
import { IotDevice } from "@prisma/client";
import { DeviceFull } from "@/types/fullTypes";
import { ReadingReportImport, DailyReadingImport } from "@/types/reading";
import UnlinkedReadingsTab from "@/components/UnlinkedReadingsTab";
import { ImportLinksTab } from "@/components/devices/ImportLinksTab";
import { ImportDeviceChassiTab } from "@/components/devices/ImportDeviceChassiTab";
import DataPagination from "@/components/ui/data-pagination";

export default function DevicesPage() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<DeviceFull | null>(null);
    const [modalDefaultTab, setModalDefaultTab] = useState<string>("basic");

    // Estados para importação
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importResult, setImportResult] = useState<{
        success: boolean;
        message: string;
        data?: any;
        error?: string;
    } | null>(null);
    const [importRows, setImportRows] = useState<ReadingReportImport[]>([]);
    const [dailyImportRows, setDailyImportRows] = useState<DailyReadingImport[]>([]);
    const [importType, setImportType] = useState<'period' | 'daily'>('period');

    const [filters, setFilters] = useState<{
        semLink: boolean;
        vinculados: boolean;
        comLeiturasDesvinculadas: boolean;
        semLeitura: boolean;
        piloto: boolean;
    }>({
        semLink: false,
        vinculados: false,
        comLeiturasDesvinculadas: false,
        semLeitura: false,
        piloto: false,
    });
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const { devices, isLoading, pagination, fetchDevices } = useDeviceIot(filters, currentPage, pageSize);
    const { createDevice, updateDevice, deleteDevice, bulkAction, importByChassi } = useDeviceIotMutations(fetchDevices);

    // Reset da página quando filtros mudarem
    useEffect(() => {
        setCurrentPage(1);
    }, [filters.semLink, filters.vinculados, filters.comLeiturasDesvinculadas, filters.semLeitura, filters.piloto]);

    useEffect(() => {
        setSelectedDeviceIds([]);
    }, [currentPage, pageSize, filters, devices.length]);

    // Função para mudança de tamanho de página
    const handlePageSizeChange = (size: string) => {
        setPageSize(Number(size));
        setCurrentPage(1);
    };

    const handleOpenModal = (device: DeviceFull | null = null) => {
        setSelectedDevice(device);
        setModalDefaultTab("basic");
        setModalOpen(true);
    };

    const handleOpenModalForDevice = async (deviceId: string) => {
        try {
            // Buscar o dispositivo pelo deviceId
            const foundDevice = devices.find(d => d.deviceId === deviceId);
            if (foundDevice) {
                setSelectedDevice(foundDevice);
                setModalDefaultTab("unlinked-readings");
                setModalOpen(true);
            } else {
                // Se não encontrou na lista atual, buscar via API
                const response = await fetch(`/api/user/devices?device_id=${deviceId}&take=1`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.devices && data.devices.length > 0) {
                        setSelectedDevice(data.devices[0]);
                        setModalDefaultTab("unlinked-readings");
                        setModalOpen(true);
                    } else {
                        toast({
                            variant: "destructive",
                            title: "Dispositivo não encontrado",
                            description: `Não foi possível encontrar o dispositivo ${deviceId}`
                        });
                    }
                } else {
                    throw new Error('Erro ao buscar dispositivo');
                }
            }
        } catch (error) {
            console.error('Erro ao buscar dispositivo:', error);
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Erro ao carregar dados do dispositivo"
            });
        }
    };

    const handleCloseModal = () => {
        setSelectedDevice(null);
        setModalOpen(false);
    };

    const handleSave = async (device: Partial<IotDevice> & { id: string }) => {
        if (device.id) {
            await updateDevice(device);
        } else {
            await createDevice(device);
        }
        handleCloseModal();
    };

    const toggleDeviceSelection = (deviceId: string, checked: boolean) => {
        setSelectedDeviceIds((prev) =>
            checked ? Array.from(new Set([...prev, deviceId])) : prev.filter((id) => id !== deviceId),
        );
    };

    const toggleSelectAllVisible = (checked: boolean) => {
        if (checked) {
            setSelectedDeviceIds(Array.from(new Set([...selectedDeviceIds, ...devices.map((d) => d.id)])));
        } else {
            const visibleIds = new Set(devices.map((d) => d.id));
            setSelectedDeviceIds((prev) => prev.filter((id) => !visibleIds.has(id)));
        }
    };

    const runBulk = async (
        action: 'delete_selected' | 'set_pilot_mode' | 'unlink_selected' | 'reprocess_selected' | 'cleanup_unlinked',
        options?: Record<string, any>,
    ) => {
        try {
            const result = await bulkAction({
                action,
                ids: selectedDeviceIds,
                ...options,
            } as any);

            toast({
                title: "Ação executada",
                description: result?.message || "Operação concluída com sucesso.",
            });

            if (action !== 'set_pilot_mode') {
                setSelectedDeviceIds([]);
            }
            await fetchDevices();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Erro na ação em lote",
                description: error?.response?.data?.error || error?.message || "Erro desconhecido",
            });
        }
    };

    // Funções para importação
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setImportFile(selectedFile);
        setImportResult(null);
        setImportRows([]);
        setDailyImportRows([]);

        if (selectedFile) {
            try {
                const data = await selectedFile.arrayBuffer();

                // Configurações para evitar conversão automática de datas
                const workbook = XLSX.read(data, {
                    type: "array",
                    cellDates: false,      // Não converter para Date automaticamente
                    cellNF: false,         // Não aplicar formatação numérica
                    cellText: false,       // Não converter para texto automaticamente
                    raw: true              // Manter dados brutos quando possível
                });

                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Converte para JSON mantendo os valores originais como string
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, {
                    defval: "",
                    raw: false,            // Força conversão para string
                    dateNF: 'dd/mm/yyyy'   // Formato de data brasileiro se necessário
                });

                console.log('Raw data from Excel:', json.slice(0, 2));

                // Detectar formato baseado nas colunas
                const firstRow = json[0] || {};
                const columns = Object.keys(firstRow);

                const hasPeriodColumns = columns.some(col => col.includes('data/hora 1')) ||
                    columns.some(col => col.includes('leitura (m3) 1'));

                const hasDailyColumns = columns.includes('device_id') &&
                    columns.includes('device_name') &&
                    columns.includes('multiplier') &&
                    columns.length > 3; // Tem colunas além das 3 fixas

                if (hasDailyColumns && !hasPeriodColumns) {
                    // Formato de leituras diárias (múltiplas datas por linha)
                    setImportType('daily');
                    setDailyImportRows(json as DailyReadingImport[]);
                    setImportRows([]);

                    // Calcular número total de leituras que serão criadas
                    const totalReadings = json.reduce((total, row) => {
                        const dateColumns = Object.keys(row).filter(col =>
                            !['device_id', 'device_name', 'multiplier'].includes(col) &&
                            row[col] !== undefined && row[col] !== null && row[col] !== ''
                        );
                        return total + dateColumns.length;
                    }, 0);

                    toast({
                        title: "Arquivo carregado (Formato Diário)",
                        description: `${json.length} dispositivos, ${totalReadings} leituras serão criadas`
                    });
                    console.log("Daily Import Rows:", json);
                } else if (hasPeriodColumns) {
                    // Formato de leituras por período (original)
                    setImportType('period');
                    setImportRows(json as ReadingReportImport[]);
                    toast({
                        title: "Arquivo carregado (Leituras por Período)",
                        description: `${json.length} linhas encontradas no arquivo`
                    });
                    console.log("Import Rows:", json);
                } else {
                    throw new Error('Formato de arquivo não reconhecido. Verifique se as colunas estão corretas.');
                }

            } catch (error) {
                console.error('Erro ao processar arquivo:', error);
                toast({
                    variant: "destructive",
                    title: "Erro ao processar arquivo",
                    description: "Verifique se o arquivo está no formato correto"
                });
            }
        }
    };

    const handleImport = async () => {
        const hasData = importType === 'period' ? importRows.length : dailyImportRows.length;

        if (!hasData) {
            toast({
                variant: "destructive",
                title: "Nenhum dado para importar",
                description: "Selecione um arquivo primeiro"
            });
            return;
        }

        setIsImporting(true);
        setImportProgress(0);
        setImportResult(null);

        try {
            // Simular progresso
            const progressInterval = setInterval(() => {
                setImportProgress(prev => Math.min(prev + 10, 90));
            }, 200);

            const apiEndpoint = importType === 'period' ? '/api/user/readings/import-iot' : '/api/user/readings/import-daily';
            const requestData = importType === 'period' ? { readings: importRows } : { readings: dailyImportRows };
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });
            const result = await response.json();
            if (!response.ok) {
                clearInterval(progressInterval);
                setImportProgress(100);
                setImportResult({ success: false, message: 'Erro na importação', error: result.error || 'Erro desconhecido' });
                toast({ variant: 'destructive', title: 'Erro na importação', description: result.error || 'Erro desconhecido' });
                return;
            }
            clearInterval(progressInterval);
            setImportProgress(100);
            setImportResult({ success: true, message: result.message, data: result.data });
            toast({ title: 'Importação concluída', description: result.data?.summary || result.message });
        } catch (error) {
            setImportResult({
                success: false,
                message: 'Erro de conexão',
                error: error instanceof Error ? error.message : 'Erro desconhecido'
            });
            toast({
                variant: "destructive",
                title: "Erro de conexão",
                description: "Não foi possível conectar com o servidor"
            });
        } finally {
            setIsImporting(false);
        }
    };

    const clearImport = () => {
        setImportFile(null);
        setImportRows([]);
        setDailyImportRows([]);
        setImportResult(null);
        setImportProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gerenciamento de Dispositivos IoT</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="unlinked-readings" className="w-full">
                        <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="unlinked-readings">Leituras Desvinculadas</TabsTrigger>
                            <TabsTrigger value="devices">Dispositivos</TabsTrigger>
                            <TabsTrigger value="import">Importar Leituras IoT</TabsTrigger>
                            <TabsTrigger value="import-links">Importar Vínculos</TabsTrigger>
                            <TabsTrigger value="import-device-chassi">Importar Device x Chassi</TabsTrigger>
                        </TabsList>

                        <TabsContent value="unlinked-readings" className="mt-4">
                            <UnlinkedReadingsTab onDeviceEdit={handleOpenModalForDevice} />
                        </TabsContent>

                        <TabsContent value="devices" className="mt-4">
                            <div className="space-y-3 mb-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant={filters.vinculados ? "default" : "outline"} onClick={() => setFilters(f => ({ ...f, vinculados: !f.vinculados, semLink: false }))}>
                                        Vinculados
                                    </Button>
                                    <Button size="sm" variant={filters.semLink ? "default" : "outline"} onClick={() => setFilters(f => ({ ...f, semLink: !f.semLink, vinculados: false }))}>
                                        Desvinculados
                                    </Button>
                                    <Button size="sm" variant={filters.piloto ? "default" : "outline"} onClick={() => setFilters(f => ({ ...f, piloto: !f.piloto }))}>
                                        Piloto
                                    </Button>
                                    <Button size="sm" variant={filters.semLeitura ? "default" : "outline"} onClick={() => setFilters(f => ({ ...f, semLeitura: !f.semLeitura }))}>
                                        Sem leitura
                                    </Button>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="comLeiturasDesvinculadas">Leituras desvinculadas</Label>
                                        <Switch id="comLeiturasDesvinculadas" checked={filters.comLeiturasDesvinculadas} onCheckedChange={comLeiturasDesvinculadas => setFilters(f => ({ ...f, comLeiturasDesvinculadas }))} />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant="destructive" disabled={selectedDeviceIds.length === 0} onClick={() => {
                                        if (!window.confirm(`Excluir ${selectedDeviceIds.length} dispositivos selecionados?`)) return;
                                        const typed = window.prompt('Confirmação dupla: digite "EXCLUIR" para continuar.');
                                        if (typed !== 'EXCLUIR') {
                                            toast({
                                                variant: "destructive",
                                                title: "Confirmação inválida",
                                                description: 'A exclusão em massa foi cancelada.',
                                            });
                                            return;
                                        }
                                        runBulk('delete_selected', { confirmationText: typed });
                                    }}>
                                        Excluir selecionados
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={selectedDeviceIds.length === 0} onClick={() => runBulk('unlink_selected')}>
                                        Desvincular selecionados
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={selectedDeviceIds.length === 0} onClick={() => runBulk('reprocess_selected')}>
                                        Reprocessar leituras
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={selectedDeviceIds.length === 0} onClick={() => runBulk('set_pilot_mode', { pilotMode: true })}>
                                        Marcar piloto
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={selectedDeviceIds.length === 0} onClick={() => runBulk('set_pilot_mode', { pilotMode: false })}>
                                        Remover piloto
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => runBulk('cleanup_unlinked', { onlyPilot: true, onlyWithoutReadings: true, olderThanDays: 30 })}>
                                        Limpar antigos do piloto
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between">
                                    {pagination.total > 0 && (
                                        <div className="flex items-center gap-2">
                                            {isLoading && (
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                            )}
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                {pagination.total} dispositivo{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
                                                {selectedDeviceIds.length > 0 ? ` | ${selectedDeviceIds.length} selecionado(s)` : ''}
                                            </span>
                                        </div>
                                    )}
                                    <Button onClick={() => handleOpenModal()} className="w-auto">
                                        Novo Dispositivo
                                    </Button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th className="px-2 py-2 text-gray-900 dark:text-gray-100">
                                                <input
                                                    type="checkbox"
                                                    checked={devices.length > 0 && devices.every((d) => selectedDeviceIds.includes(d.id))}
                                                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                                                />
                                            </th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">ID do Device</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Medidor</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Chassi</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Apartamento</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Bloco</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Condomínio</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Status vínculo</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Última Leitura</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Última Comunicação</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Origem</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Piloto</th>
                                            <th className="px-4 py-2 text-gray-900 dark:text-gray-100">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={13} className="text-center py-8">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                                        <span className="text-gray-600 dark:text-gray-400">Carregando dispositivos...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : devices.length === 0 ? (
                                            <tr>
                                                <td colSpan={13} className="text-center py-8">
                                                    <div className="text-gray-600 dark:text-gray-400">
                                                        {Object.values(filters).some(Boolean) ?
                                                            "Nenhum dispositivo encontrado com os filtros aplicados." :
                                                            "Nenhum dispositivo encontrado."
                                                        }
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : devices.map(device => {
                                            const meter = device.currentMeter || device.meter;
                                            return (
                                                <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-2 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedDeviceIds.includes(device.id)}
                                                            onChange={(e) => toggleDeviceSelection(device.id, e.target.checked)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{device.deviceId}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                                        <Badge variant={meter ? "success" : "secondary"}>{meter ? 'Vinculado' : 'Desvinculado'}</Badge>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{meter?.register || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{meter?.apartment?.name || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{meter?.apartment?.block?.name || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{meter?.apartment?.block?.complex?.socialName || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                                        <div className="flex gap-1 flex-wrap">
                                                            <Badge variant={device.hasActiveLink ? "success" : "secondary"}>
                                                                {device.hasActiveLink ? 'vinculado' : 'desvinculado'}
                                                            </Badge>
                                                            {(device.unlinkedReadingsCount || 0) > 0 && (
                                                                <Badge variant="destructive">erro</Badge>
                                                            )}
                                                            {(device.readingsCount || 0) === 0 && (
                                                                <Badge variant="secondary">sem leitura</Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{device.lastReading ?? '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{device.lastSeenDate || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{device.lastReadingSource || '-'}</td>
                                                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                                        <Badge variant={device.pilotMode ? "outline" : "secondary"}>
                                                            {device.pilotMode ? 'piloto' : 'normal'}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-2 flex flex-wrap gap-2">
                                                        <Button size="sm" variant="outline" onClick={() => handleOpenModal(device)}>Vincular</Button>
                                                        <Button size="sm" variant="outline" onClick={() => runBulk('unlink_selected', { ids: [device.id] })}>Desvincular</Button>
                                                        <Button size="sm" variant="outline" onClick={() => runBulk('reprocess_selected', { ids: [device.id] })}>Reprocessar</Button>
                                                        <Button size="sm" variant="outline" onClick={() => window.open('/meters', '_blank')}>Abrir medidor</Button>
                                                        <Button size="sm" variant="destructive" onClick={() => deleteDevice(device.id)}>Excluir</Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Controles de Paginação */}
                            <div className="flex items-center justify-between mt-4">
                                {/* Controle de itens por página à esquerda */}
                                <div className="flex items-center gap-2">
                                    <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                                        <SelectTrigger className="w-20">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="20">20</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                            <SelectItem value="250">250</SelectItem>
                                            <SelectItem value="500">500</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-sm text-muted-foreground">
                                        {Math.min((currentPage - 1) * pageSize + 1, pagination.total)} a {Math.min(currentPage * pageSize, pagination.total)} de {pagination.total}
                                    </span>
                                </div>

                                {/* Navegação de páginas à direita */}
                                <div className="flex items-center">
                                    <DataPagination
                                        currentPage={currentPage}
                                        totalPages={pagination.totalPages}
                                        totalItems={pagination.total}
                                        itemsPerPage={pageSize}
                                        onPageChange={setCurrentPage}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="import" className="mt-4">
                            <div className="space-y-6">
                                {/* Upload de Arquivo */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <FileSpreadsheet className="h-5 w-5" />
                                            Upload de Arquivo
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="file-upload">Selecione um arquivo Excel/CSV</Label>
                                            <Input
                                                ref={fileInputRef}
                                                id="file-upload"
                                                type="file"
                                                accept=".xlsx,.xls,.csv"
                                                onChange={handleFileChange}
                                                disabled={isImporting}
                                            />
                                            <div className="text-sm text-gray-500 space-y-1">
                                                <p>Formatos aceitos: .xlsx, .xls, .csv</p>
                                                <p className="font-medium">Dois formatos de planilha são suportados:</p>
                                                <div className="ml-2 space-y-1">
                                                    <p>• <strong>Leituras por Período:</strong> Colunas: device_id, device_name, remote_id, "data/hora 1", "leitura (m3) 1", "data/hora 2", "leitura (m3) 2"</p>
                                                    <p>• <strong>Leituras Diárias:</strong> Colunas: device_id, device_name, multiplier, [datas como colunas: 01/01/2024, 02/01/2024, ...]</p>
                                                </div>
                                                <p>
                                                    <a
                                                        href="/exemplo-leituras-iot.csv"
                                                        download="exemplo-leituras-iot.csv"
                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline transition-colors"
                                                    >
                                                        📄 Baixar arquivo de exemplo (Período)
                                                    </a>
                                                    {" • "}
                                                    <a
                                                        href="/exemplo-leituras-diarias.csv"
                                                        download="exemplo-leituras-diarias.csv"
                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline transition-colors"
                                                    >
                                                        📊 Baixar arquivo de exemplo (Diárias)
                                                    </a>
                                                </p>
                                            </div>
                                        </div>
                                        {importFile && (
                                            <Alert>
                                                <FileSpreadsheet className="h-4 w-4" />
                                                <AlertTitle>Arquivo Selecionado</AlertTitle>
                                                <AlertDescription>
                                                    <div className="space-y-1">
                                                        <p><strong>{importFile.name}</strong></p>
                                                        {importType === 'period' ? (
                                                            <>
                                                                <p>📊 {importRows.length} linhas encontradas</p>
                                                                <p>📈 {importRows.length * 2} leituras serão criadas (2 por linha)</p>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <p>📊 {dailyImportRows.length} linhas encontradas</p>
                                                                <p>📈 {dailyImportRows.reduce((total, row) => {
                                                                    const dateColumns = Object.keys(row).filter(col =>
                                                                        !['device_id', 'device_name', 'multiplier'].includes(col) &&
                                                                        row[col] !== undefined && row[col] !== null && row[col] !== ''
                                                                    );
                                                                    return total + dateColumns.length;
                                                                }, 0)} leituras diárias serão criadas (1 por linha)</p>
                                                            </>
                                                        )}
                                                        <p>💾 {Math.round(importFile.size / 1024)} KB</p>
                                                        <p className="font-medium text-blue-600 dark:text-blue-400">
                                                            Formato: {importType === 'period' ? 'Leituras por Período' : 'Leituras Diárias'}
                                                        </p>
                                                    </div>
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleImport}
                                                disabled={!importFile || isImporting || (importType === 'period' ? importRows.length === 0 : dailyImportRows.length === 0)}
                                                className="flex items-center gap-2"
                                            >
                                                <Upload className="h-4 w-4" />
                                                {isImporting ? 'Importando...' : `Importar Leituras${importType === 'period' ? '' : ' Diárias'}`}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={clearImport}
                                                disabled={isImporting}
                                                className="flex items-center gap-2"
                                            >
                                                <X className="h-4 w-4" />
                                                Limpar
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    toast({
                                                        title: "Teste de Conexão",
                                                        description: "Verificando conectividade com a API..."
                                                    });
                                                    fetch('/api/user/devices')
                                                        .then(res => res.json())
                                                        .then(data => {
                                                            toast({
                                                                title: "✅ Conexão OK",
                                                                description: `API respondeu com ${data.devices?.length || 0} dispositivos`
                                                            });
                                                        })
                                                        .catch(err => {
                                                            toast({
                                                                variant: "destructive",
                                                                title: "❌ Erro de Conexão",
                                                                description: err.message
                                                            });
                                                        });
                                                }}
                                                disabled={isImporting}
                                                className="flex items-center gap-2"
                                            >
                                                🔗 Testar API
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Progresso da Importação */}
                                {isImporting && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Upload className="h-5 w-5 animate-bounce" />
                                                Importando Leituras IoT
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <Progress value={importProgress} className="w-full" />
                                            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                                <span>{importProgress}% concluído</span>
                                                <span>
                                                    {importProgress < 30 && "📖 Processando arquivo..."}
                                                    {importProgress >= 30 && importProgress < 60 && "🔍 Validando dados..."}
                                                    {importProgress >= 60 && importProgress < 90 && "💾 Salvando leituras..."}
                                                    {importProgress >= 90 && "✨ Finalizando..."}
                                                </span>
                                            </div>                            <Alert>
                                                <AlertDescription>
                                                    📊 Processando {importType === 'period' ? `${importRows.length} linhas (${importRows.length * 2} leituras)` : `${dailyImportRows.length} dispositivos (${dailyImportRows.reduce((total, row) => {
                                                        const dateColumns = Object.keys(row).filter(col =>
                                                            !['device_id', 'device_name', 'multiplier'].includes(col) &&
                                                            row[col] !== undefined && row[col] !== null && row[col] !== ''
                                                        );
                                                        return total + dateColumns.length;
                                                    }, 0)} leituras)`}
                                                </AlertDescription>
                                            </Alert>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Resultado da Importação */}
                                {importResult && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                {importResult.success ? (
                                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                                ) : (
                                                    <AlertCircle className="h-5 w-5 text-red-500" />
                                                )}
                                                Resultado da Importação
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <Alert className={importResult.success ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"}>
                                                <AlertTitle className={importResult.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}>{importResult.message}</AlertTitle>
                                                <AlertDescription>
                                                    {importResult.success ? (
                                                        <div className="space-y-2">
                                                            {importResult.data && (
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-1">
                                                                        <p className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                                                            <span className="text-lg">✅</span>
                                                                            <span><strong>{importResult.data.readingsCreated}</strong> leituras criadas</span>
                                                                        </p>
                                                                        <p className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                                                            <span className="text-lg">🔗</span>
                                                                            <span><strong>{importResult.data.readingsWithMeter}</strong> leituras vinculadas a medidores</span>
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <p className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                                                            <span className="text-lg">⚠️</span>
                                                                            <span><strong>{importResult.data.readingsWithoutMeter}</strong> leituras não vinculadas</span>
                                                                        </p>
                                                                        <p className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                                                            <span className="text-lg">📱</span>
                                                                            <span><strong>{importResult.data.devicesCreated}</strong> dispositivos criados</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {importResult.data?.summary && (
                                                                <div className="mt-3 p-3 bg-green-100 dark:bg-green-900 rounded-md">
                                                                    <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                                                        📋 Resumo: {importResult.data.summary}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <p className="text-red-700 dark:text-red-300 font-medium">{importResult.error}</p>
                                                            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900 rounded-md border border-red-200 dark:border-red-800">
                                                                <p className="text-sm text-red-600 dark:text-red-400">
                                                                    💡 <strong>Dicas para resolver:</strong>
                                                                </p>
                                                                <ul className="text-sm text-red-600 dark:text-red-400 mt-1 space-y-1">
                                                                    <li>• Verifique se o formato das datas está correto (dd/mm/aaaa HH:mm:ss)</li>
                                                                    <li>• Confirme que device_id e remote_id estão preenchidos</li>
                                                                    <li>• Certifique-se de que você está logado no sistema</li>
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    )}
                                                </AlertDescription>
                                            </Alert>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Preview dos Dados */}
                                {(importRows.length > 0 || dailyImportRows.length > 0) && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>
                                                Preview dos Dados ({importType === 'period' ? `${importRows.length} linhas` : `${dailyImportRows.length} dispositivos`})
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {importType === 'period' ? (
                                                <>
                                                    {/* Alertas sobre formatos detectados para período */}
                                                    <div className="mb-4 space-y-2">
                                                        {importRows.some(row => typeof row['data/hora 1'] === 'number' || typeof row['data/hora 2'] === 'number') && (
                                                            <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                                                                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                                                <AlertTitle className="text-orange-800 dark:text-orange-200">Datas em Formato Excel Detectadas</AlertTitle>
                                                                <AlertDescription className="text-orange-700 dark:text-orange-300">
                                                                    Algumas datas estão em formato numérico (Excel Serial). O sistema irá convertê-las automaticamente para o formato brasileiro.
                                                                </AlertDescription>
                                                            </Alert>
                                                        )}
                                                        {importRows.some(row =>
                                                            (typeof row['leitura (m3) 1'] === 'string' && String(row['leitura (m3) 1']).includes(',')) ||
                                                            (typeof row['leitura (m3) 2'] === 'string' && String(row['leitura (m3) 2']).includes(','))
                                                        ) && (
                                                                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                                                                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                                    <AlertTitle className="text-blue-800 dark:text-blue-200">Valores com Vírgula Detectados</AlertTitle>
                                                                    <AlertDescription className="text-blue-700 dark:text-blue-300">
                                                                        Números com vírgula (formato brasileiro) serão convertidos automaticamente para ponto decimal.
                                                                    </AlertDescription>
                                                                </Alert>
                                                            )}
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                                            <thead>
                                                                <tr>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Device ID</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Device Name</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Remote ID</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Data/Hora 1</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Leitura 1</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Data/Hora 2</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Leitura 2</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {importRows.slice(0, 5).map((row, index) => (
                                                                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                                        <td className="px-2 py-1 text-xs text-gray-900 dark:text-gray-100">{row.device_id || '-'}</td>
                                                                        <td className="px-2 py-1 text-xs text-gray-900 dark:text-gray-100">{row.device_name || '-'}</td>
                                                                        <td className="px-2 py-1 text-xs text-gray-900 dark:text-gray-100">{row.remote_id || '-'}</td>
                                                                        <td className="px-2 py-1 text-xs">
                                                                            <span className={typeof row['data/hora 1'] === 'number' ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-green-600 dark:text-green-400'}>
                                                                                {typeof row['data/hora 1'] === 'number' ?
                                                                                    `⚠️ ${row['data/hora 1']} (Excel Serial)` :
                                                                                    row['data/hora 1'] || '-'
                                                                                }
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-2 py-1 text-xs">
                                                                            <span className={typeof row['leitura (m3) 1'] === 'string' && String(row['leitura (m3) 1']).includes(',') ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                                                                                {row['leitura (m3) 1'] || '-'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-2 py-1 text-xs">
                                                                            <span className={typeof row['data/hora 2'] === 'number' ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-green-600 dark:text-green-400'}>
                                                                                {typeof row['data/hora 2'] === 'number' ?
                                                                                    `⚠️ ${row['data/hora 2']} (Excel Serial)` :
                                                                                    row['data/hora 2'] || '-'
                                                                                }
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-2 py-1 text-xs">
                                                                            <span className={typeof row['leitura (m3) 2'] === 'string' && String(row['leitura (m3) 2']).includes(',') ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                                                                                {row['leitura (m3) 2'] || '-'}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {importRows.length > 5 && (
                                                                    <tr>
                                                                        <td colSpan={7} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">
                                                                            ... e mais {importRows.length - 5} linhas
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Preview para leituras diárias */}
                                                    <div className="mb-4">
                                                        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                                                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                            <AlertTitle className="text-green-800 dark:text-green-200">Formato de Leituras Diárias Detectado</AlertTitle>
                                                            <AlertDescription className="text-green-700 dark:text-green-300">
                                                                Este arquivo contém múltiplas leituras por dispositivo. Cada coluna de data será convertida em uma leitura separada.
                                                                {dailyImportRows.some(row => row.multiplier && row.multiplier !== 1) &&
                                                                    " Multiplicadores serão aplicados automaticamente."
                                                                }
                                                            </AlertDescription>
                                                        </Alert>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                                            <thead>
                                                                <tr>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Device ID</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Device Name</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Última leitura</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Colunas de Data</th>
                                                                    <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100">Total Leituras</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {dailyImportRows.slice(0, 5).map((row, index) => {
                                                                    // const multiplier = row.multiplier || 1;
                                                                    const dateColumns = Object.keys(row).filter(col =>
                                                                        !['device_id', 'device_name', 'multiplier'].includes(col) &&
                                                                        row[col] !== undefined && row[col] !== null && row[col] !== ''
                                                                    );
                                                                    const lastReading = dateColumns.length > 0 ? dateColumns[dateColumns.length - 1] : '-';
                                                                    const lastReadingValue = dateColumns.length > 0 ? row[dateColumns[dateColumns.length - 1]] : '-';

                                                                    return (
                                                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                                            <td className="px-2 py-1 text-xs text-gray-900 dark:text-gray-100">{row.device_id || '-'}</td>
                                                                            <td className="px-2 py-1 text-xs text-gray-900 dark:text-gray-100">{row.device_name || '-'}</td>
                                                                            <td className="px-2 py-1 text-xs">
                                                                                {/* <span className={multiplier !== 1 ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-gray-500'}>
                                                                                    {multiplier}
                                                                                </span> */}
                                                                                <span className="text-gray-900 dark:text-gray-100"
                                                                                    title={lastReading}
                                                                                >
                                                                                    {lastReadingValue}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-2 py-1 text-xs">
                                                                                <div className="max-w-xs overflow-hidden">
                                                                                    <span className="text-blue-600 dark:text-blue-400"
                                                                                        title={dateColumns.join(', ')}
                                                                                    >
                                                                                        {dateColumns.slice(0, 3).map(date => {
                                                                                            // Check if it's an Excel Serial Number
                                                                                            const num = Number(date);
                                                                                            if (!isNaN(num) && num > 1 && num < 200000) {
                                                                                                // Convert Excel Serial to readable date using same logic as backend
                                                                                                let days = num - 1; // Serial 1 = 1 de janeiro de 1900

                                                                                                // Corrigir o bug do ano 1900
                                                                                                if (num >= 60) {
                                                                                                    days = days - 1;
                                                                                                }

                                                                                                // Criar a data base: 1 de janeiro de 1900
                                                                                                const baseDate = new Date(1900, 0, 1);

                                                                                                // Adicionar os dias
                                                                                                const resultDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

                                                                                                // Garantir que seja meio-dia para evitar problemas de timezone
                                                                                                const convertedDate = new Date(resultDate.getFullYear(), resultDate.getMonth(), resultDate.getDate(), 12, 0, 0, 0);
                                                                                                return convertedDate.toLocaleDateString('pt-BR');
                                                                                            }
                                                                                            return date;
                                                                                        }).join(', ')}
                                                                                        {dateColumns.length > 3 && `, +${dateColumns.length - 3} mais`}
                                                                                    </span>
                                                                                    {dateColumns.some(date => {
                                                                                        const num = Number(date);
                                                                                        return !isNaN(num) && num > 1 && num < 200000;
                                                                                    }) && (
                                                                                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                                                                Excel Serial Numbers detectados
                                                                                            </div>
                                                                                        )}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-2 py-1 text-xs">
                                                                                <span className="text-green-600 dark:text-green-400 font-bold">
                                                                                    {dateColumns.length}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                                {dailyImportRows.length > 5 && (
                                                                    <tr>
                                                                        <td colSpan={5} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">
                                                                            ... e mais {dailyImportRows.length - 5} dispositivos
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="import-links" className="mt-4">
                            <ImportLinksTab onImportComplete={() => {
                                // Atualizar dados quando importação for concluída
                                fetchDevices();
                            }} />
                        </TabsContent>

                        <TabsContent value="import-device-chassi" className="mt-4">
                            <ImportDeviceChassiTab
                                onImport={importByChassi}
                                onImported={() => {
                                    setSelectedDeviceIds([]);
                                    fetchDevices();
                                }}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
            <DeviceIotModal isOpen={modalOpen} onClose={handleCloseModal} onSave={handleSave} device={selectedDevice} defaultTab={modalDefaultTab} />
        </div>
    );
}
