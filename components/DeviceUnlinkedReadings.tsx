import React, { useState, useEffect, useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

interface DeviceUnlinkedReadingsRef {
  refresh: () => void;
}

interface DeviceUnlinkedReadingsProps {
  deviceId: string;
  deviceName?: string;
}

const DeviceUnlinkedReadings = React.forwardRef<DeviceUnlinkedReadingsRef, DeviceUnlinkedReadingsProps>(({ 
  deviceId, 
  deviceName 
}, ref) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [readings, setReadings] = useState<UnlinkedReading[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  
  const pageSize = 10;

  const fetchUnlinkedReadings = async (page: number = 1) => {
    setIsLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = new URLSearchParams({
        take: pageSize.toString(),
        skip: skip.toString(),
      });

      const response = await fetch(`/api/user/devices/${deviceId}/unlinked-readings?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao buscar leituras desvinculadas');
      }

      const data = await response.json();
      setReadings(data.readings);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error('Erro ao buscar leituras desvinculadas:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao carregar leituras desvinculadas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchUnlinkedReadings(page);
  };

  const handleReprocessReadings = async () => {
    if (!deviceId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "ID do dispositivo não encontrado"
      });
      return;
    }

    setReprocessing(true);

    try {
      const response = await fetch(`/api/user/devices/${deviceId}/reprocess-readings`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Erro ao reprocessar leituras');
      }

      toast({
        title: "Reprocessamento concluído",
        description: data.message || "Leituras reprocessadas com sucesso."
      });
      await fetchUnlinkedReadings(currentPage);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no reprocessamento",
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setReprocessing(false);
    }
  };



  useEffect(() => {
    fetchUnlinkedReadings();
  }, [deviceId]);

  // Expor método refresh para componentes pai
  useImperativeHandle(ref, () => ({
    refresh: () => {
      fetchUnlinkedReadings(currentPage);
    }
  }));

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* Header com informações e ações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span>Leituras Desvinculadas</span>
              {totalCount > 0 && <Badge variant="destructive">{totalCount}</Badge>}
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm"
                variant="outline"
                onClick={handleReprocessReadings}
                disabled={reprocessing || isLoading}
                className="flex items-center gap-2"
              >
                <RotateCcw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
                {reprocessing ? 'Reprocessando...' : 'Reprocessar Leituras'}
              </Button>
              <Button 
                size="sm"
                onClick={() => fetchUnlinkedReadings(currentPage)}
                disabled={isLoading || reprocessing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600">
            <p><strong>Dispositivo:</strong> {deviceName || deviceId}</p>
            <p><strong>ID:</strong> {deviceId}</p>
            {totalCount > 0 && (
              <Alert className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Este dispositivo possui {totalCount} leituras que não estão vinculadas a nenhum medidor. 
                  Verifique os períodos de vinculação do dispositivo.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Leituras */}
      <Card>
        <CardHeader>
          <CardTitle>Leituras Sem Vínculo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <Alert>
              <AlertDescription>
                Nenhuma leitura desvinculada encontrada para este dispositivo.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Leitura</th>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Data</th>
                      <th className="px-4 py-2 text-left text-gray-900 dark:text-gray-100">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {readings.map((reading) => {
                        console.log(reading);
                        return (
                      <tr key={reading.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{reading.reading ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                          {new Date(reading.readAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                          {new Date(reading.readAt).toLocaleTimeString('pt-BR')}
                        </td>
                      </tr>)
})}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Página {currentPage} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(currentPage - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(currentPage + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

DeviceUnlinkedReadings.displayName = 'DeviceUnlinkedReadings';

export default DeviceUnlinkedReadings;
