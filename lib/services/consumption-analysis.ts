/**
 * lib/services/consumption-analysis.ts
 *
 * Busca o histórico de consumo de uma unidade e gera uma análise comparativa.
 * Compara apenas a unidade consigo mesma (mês anterior + média 6 meses).
 * Nenhum dado de outras unidades é acessado (LGPD).
 */

import prisma from '@/lib/prisma';

export interface ConsumptionAnalysis {
  currentConsumption: number;       // m³ do mês atual
  previousConsumption: number | null; // m³ do mês anterior
  avg6Months: number | null;        // média m³ dos últimos 6 meses
  vsPreviousPct: number | null;     // % diferença vs mês anterior (positivo = aumento)
  vsAvgPct: number | null;          // % diferença vs média 6 meses
  trend: 'increase' | 'decrease' | 'stable' | 'insufficient_data';
  trendLabel: string;               // texto pronto pra exibir
  trendEmoji: string;               // emoji do indicador
  monthsAnalyzed: number;           // quantos meses foram usados na média
}

/**
 * Busca os relatórios de consumo anteriores do apartamento e calcula a análise.
 * O `currentReportId` é o relatório atual (excluído da média histórica).
 */
export async function getConsumptionAnalysis(
  apartmentId: string,
  currentReportId: string,
  currentConsumption: number,
): Promise<ConsumptionAnalysis> {
  // Buscar os últimos 7 relatórios do apartamento (excluindo o atual),
  // ordenados do mais recente para o mais antigo
  const history = await prisma.apartmentConsumptionReport.findMany({
    where: {
      apartmentId,
      id: { not: currentReportId },
      deletedAt: null,
    },
    orderBy: [
      { yearRef: 'desc' },
      { monthRef: 'desc' },
    ],
    take: 7,
    select: {
      id: true,
      monthRef: true,
      yearRef: true,
      consumption: true,
      totalConsumption: true,
    },
  });

  if (history.length === 0) {
    return {
      currentConsumption,
      previousConsumption: null,
      avg6Months: null,
      vsPreviousPct: null,
      vsAvgPct: null,
      trend: 'insufficient_data',
      trendLabel: 'Este é seu primeiro registro de consumo no sistema.',
      trendEmoji: '📊',
      monthsAnalyzed: 0,
    };
  }

  // Mês anterior = primeiro da lista (mais recente depois do atual)
  const previous = history[0];
  const previousConsumption = previous.totalConsumption ?? previous.consumption;

  // Média dos últimos 6 meses (ou quantos tiver, até 6)
  const historyForAvg = history.slice(1, 7); // pula o mês anterior, pega até 6
  // Se temos poucos meses, usar o mês anterior também na média para ter pelo menos 1 ponto
  const monthsForAvg = historyForAvg.length > 0 ? historyForAvg : [previous];
  const avgConsumptions = monthsForAvg.map(h => h.totalConsumption ?? h.consumption);
  const avg6Months = avgConsumptions.length > 0
    ? avgConsumptions.reduce((a, b) => a + b, 0) / avgConsumptions.length
    : null;

  // Calcular variações percentuais
  const vsPreviousPct = previousConsumption > 0
    ? ((currentConsumption - previousConsumption) / previousConsumption) * 100
    : null;

  const vsAvgPct = avg6Months && avg6Months > 0
    ? ((currentConsumption - avg6Months) / avg6Months) * 100
    : null;

  // Determinar trend (usa a maior variação entre mês anterior e média)
  const maxVariation = Math.max(
    Math.abs(vsPreviousPct ?? 0),
    Math.abs(vsAvgPct ?? 0),
  );

  let trend: ConsumptionAnalysis['trend'];
  let trendLabel: string;
  let trendEmoji: string;

  if (maxVariation < 10) {
    trend = 'stable';
    trendLabel = 'Seu consumo está estável, sem variações significativas.';
    trendEmoji = '→';
  } else if (vsPreviousPct !== null && vsPreviousPct > 0) {
    trend = 'increase';
    const pct = Math.round(Math.abs(vsPreviousPct));
    trendLabel = `Seu consumo aumentou ${pct}% em relação ao mês anterior.`;
    trendEmoji = '📈';
  } else if (vsPreviousPct !== null && vsPreviousPct < 0) {
    trend = 'decrease';
    const pct = Math.round(Math.abs(vsPreviousPct));
    trendLabel = `Seu consumo diminuiu ${pct}% em relação ao mês anterior. Bom trabalho!`;
    trendEmoji = '📉';
  } else {
    trend = 'stable';
    trendLabel = 'Seu consumo está dentro do padrão normal.';
    trendEmoji = '→';
  }

  return {
    currentConsumption,
    previousConsumption,
    avg6Months: avg6Months ? Math.round(avg6Months * 100) / 100 : null,
    vsPreviousPct: vsPreviousPct !== null ? Math.round(vsPreviousPct * 10) / 10 : null,
    vsAvgPct: vsAvgPct !== null ? Math.round(vsAvgPct * 10) / 10 : null,
    trend,
    trendLabel,
    trendEmoji,
    monthsAnalyzed: monthsForAvg.length,
  };
}
