import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Search, AlertTriangle, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DataPagination from '@/components/ui/data-pagination';

interface UnlinkedReading {
  id: string;
  deviceId: string;
  readAt: Date;
  readAtDate: string;
  reading: number | null;
  device: {
    id: string;
    deviceId: string;
    name: string | null;
  };
}

interface DeviceSummary {
  deviceId: string;
  deviceName: string | null;
  unlinkedCount: number;
}

interface UnlinkedReadingsTabProps {
  onDeviceEdit?: (deviceId: string) => void;
}

const UnlinkedReadingsTab: React.FC<UnlinkedReadingsTabProps> = ({ onDeviceEdit }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [readings, setReadings] = useState<UnlinkedReading[]>([]);
  const [devicesSummary, setDevicesSummary] = useState<DeviceSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  // Referência para scroll automático
  const readingsTableRef = React.useRef<HTMLDivElement>(null);

  const fetchUnlinkedReadings = async (page: number = 1, deviceId?: string) => {
    setIsLoading(true);
    try {
      const skip = (page - 1) * 20; // Para leituras, mantemos 20 por página
      const params = new URLSearchParams({
        take: '20',
        skip: skip.toString(),
      });
      
      if (deviceId) {
        params.append('deviceId', deviceId);
      }

      const response = await fetch(`/api/user/readings/unlinked?${params}`);
      
      if (!response.ok) {
        throw new Error('Erro ao buscar leituras desvinculadas');
      }

      const data = await response.json();
      setReadings(data.readings);
      setTotalCount(data.totalCount);
      setDevicesSummary(data.deviceGroups || []);
    } catch (error) {
      console.error('Erro ao buscar leituras desvinculadas:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar leituras desvinculadas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeviceFilter = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setCurrentPage(1);
    fetchUnlinkedReadings(1, deviceId || undefined);
    
    // Scroll para a tabela de leituras
    if (deviceId && readingsTableRef.current) {
      setTimeout(() => {
        readingsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleDeviceEdit = (deviceId: string) => {
    if (onDeviceEdit) {
      onDeviceEdit(deviceId);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchUnlinkedReadings(page, selectedDeviceId || undefined);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setCurrentPage(1);
    // A mudança do pageSize dos dispositivos não afeta a busca de leituras
    // Apenas redefine a página atual para 1 para reexibir os dispositivos
  };

  useEffect(() => {
    fetchUnlinkedReadings();
  }, [pageSize]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Resumo dos Dispositivos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Dispositivos com Leituras Desvinculadas
            </CardTitle>
            
            {/* Controle de itens por página para dispositivos */}
            <div className="flex items-center gap-2">
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">por página</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!devicesSummary || devicesSummary.length === 0 ? (
            <Alert>
              <AlertDescription>
                Nenhum dispositivo com leituras desvinculadas encontrado.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devicesSummary.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((device) => (
                  <Card key={device.deviceId} className="relative cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group" 
                        onClick={() => handleDeviceEdit(device.deviceId)}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100 pr-8">{device.deviceName || device.deviceId}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{device.deviceId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">{device.unlinkedCount}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeviceFilter(device.deviceId);
                            }}
                          >
                            <Filter className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Paginação para dispositivos */}
              {Math.ceil(devicesSummary.length / pageSize) > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {Math.min((currentPage - 1) * pageSize + 1, devicesSummary.length)} a {Math.min(currentPage * pageSize, devicesSummary.length)} de {devicesSummary.length} dispositivos
                  </span>
                  <DataPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(devicesSummary.length / pageSize)}
                    totalItems={devicesSummary.length}
                    itemsPerPage={pageSize}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="deviceFilter">Filtrar por Dispositivo</Label>
              <Input
                id="deviceFilter"
                placeholder="ID do dispositivo"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
              />
            </div>
            <Button onClick={() => handleDeviceFilter(selectedDeviceId)}>
              <Search className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
            <Button variant="outline" onClick={() => handleDeviceFilter('')}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Leituras */}
      <Card ref={readingsTableRef}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Leituras Desvinculadas ({totalCount})</span>
            <Button onClick={() => fetchUnlinkedReadings(currentPage, selectedDeviceId || undefined)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !readings || readings.length === 0 ? (
            <Alert>
              <AlertDescription>
                Nenhuma leitura desvinculada encontrada.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Dispositivo</th>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Leitura</th>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(readings || []).map((reading) => (
                      <tr key={reading.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-2">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{reading.device.name || reading.deviceId}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{reading.deviceId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{reading.reading ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{reading.readAtDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação para leituras */}
              {Math.ceil(totalCount / 20) > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {Math.min((currentPage - 1) * 20 + 1, totalCount)} a {Math.min(currentPage * 20, totalCount)} de {totalCount} leituras
                  </span>
                  <DataPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / 20)}
                    totalItems={totalCount}
                    itemsPerPage={20}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UnlinkedReadingsTab;
