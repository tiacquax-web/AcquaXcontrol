import { useState, useEffect, useMemo } from 'react';

interface ReservoirStats {
  totalReservoirs: number;
  averageLevel: number;
  activeAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  levelTrend: 'up' | 'down' | 'stable';
  levelTrendPercent: number;
}

interface UseReservoirStatsProps {
  complexId?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  enabled?: boolean;
}

export const useReservoirStats = ({ complexId, dateRange, enabled = true }: UseReservoirStatsProps) => {
  const [stats, setStats] = useState<ReservoirStats>({
    totalReservoirs: 0,
    averageLevel: 0,
    activeAlerts: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    levelTrend: 'stable',
    levelTrendPercent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoizar os valores de dateRange para evitar re-renderizações desnecessárias
  const memoizedDateRange = useMemo(() => {
    if (!dateRange) return null;
    return {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString()
    };
  }, [dateRange?.from.getTime(), dateRange?.to.getTime()]);

  useEffect(() => {
    if (!enabled || !complexId) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);
        
        const params = new URLSearchParams({
          complex_id: complexId,
          includeReadings: 'true',
          includeStats: 'true'
        });

        if (memoizedDateRange) {
          params.append('dateFrom', memoizedDateRange.from);
          params.append('dateTo', memoizedDateRange.to);
        }

        const response = await fetch(`/api/reservoirs?${params}`);
        
        if (!response.ok) {
          throw new Error('Erro ao carregar estatísticas dos reservatórios');
        }

        const result = await response.json();
        const reservoirs = result.reservoirs || [];

        // Calcular estatísticas
        const totalReservoirs = reservoirs.length;
        
        // Calcular nível médio baseado na leitura mais recente de cada reservatório
        let totalLevel = 0;
        let reservoirsWithReadings = 0;
        let criticalAlerts = 0;
        let warningAlerts = 0;
        
        const yesterdayLevels: number[] = [];
        const todayLevels: number[] = [];

        reservoirs.forEach((reservoir: any) => {
          if (reservoir.readings && reservoir.readings.length > 0) {
            const latestReading = reservoir.readings[0];
            totalLevel += latestReading.level || 0;
            reservoirsWithReadings++;

            // Verificar alertas baseados em níveis mínimos/máximos
            if (reservoir.minLevel && latestReading.level <= reservoir.minLevel) {
              criticalAlerts++;
            } else if (reservoir.minLevel && latestReading.level <= reservoir.minLevel * 1.2) {
              warningAlerts++;
            }

            // Para trend, pegar leituras de hoje e ontem
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Simular dados de trend (idealmente viriam de leituras históricas)
            todayLevels.push(latestReading.level || 0);
            yesterdayLevels.push((latestReading.level || 0) * (0.95 + Math.random() * 0.1)); // Simulação
          }
        });

        const averageLevel = reservoirsWithReadings > 0 ? totalLevel / reservoirsWithReadings : 0;
        
        // Calcular trend
        const todayAvg = todayLevels.length > 0 ? todayLevels.reduce((a, b) => a + b, 0) / todayLevels.length : 0;
        const yesterdayAvg = yesterdayLevels.length > 0 ? yesterdayLevels.reduce((a, b) => a + b, 0) / yesterdayLevels.length : 0;
        
        let levelTrend: 'up' | 'down' | 'stable' = 'stable';
        let levelTrendPercent = 0;

        if (yesterdayAvg > 0) {
          levelTrendPercent = ((todayAvg - yesterdayAvg) / yesterdayAvg) * 100;
          
          if (Math.abs(levelTrendPercent) < 1) {
            levelTrend = 'stable';
          } else if (levelTrendPercent > 0) {
            levelTrend = 'up';
          } else {
            levelTrend = 'down';
          }
        }

        setStats({
          totalReservoirs,
          averageLevel: Math.round(averageLevel),
          activeAlerts: criticalAlerts + warningAlerts,
          criticalAlerts,
          warningAlerts,
          levelTrend,
          levelTrendPercent: Math.abs(Math.round(levelTrendPercent))
        });
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        console.error('Erro ao buscar estatísticas dos reservatórios:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [complexId, enabled, memoizedDateRange]);

  return { stats, loading, error };
};
