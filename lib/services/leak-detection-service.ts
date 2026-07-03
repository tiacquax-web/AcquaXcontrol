/**
 * lib/services/leak-detection-service.ts
 *
 * Detecta possíveis vazamentos analisando padrões de consumo diário.
 * Critérios: consumo noturno consistente (madrugada) por vários dias seguidos,
 * ou consumo diário médio anormalmente alto sem variação (característica de vazamento contínuo).
 */

import prisma from '@/lib/prisma';

export interface LeakDetectionResult {
  apartmentId: string;
  apartmentName: string;
  blockName: string;
  complexName: string;
  meterId: string;
  avgDailyConsumption: number;
  nightConsumptionRatio: number; // % do consumo que acontece de madrugada
  consecutiveDays: number;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

/**
 * Analisa consumo dos últimos 14 dias para um condomínio.
 * Retorna unidades com possível vazamento.
 */
export async function detectLeaksForComplex(complexId: string): Promise<LeakDetectionResult[]> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Buscar medidores do condomínio com leituras IoT (diárias) no período
  const meters = await prisma.meter.findMany({
    where: {
      deletedAt: null,
      complexId,
      readings: {
        some: {
          readAt: { gte: fromDate, lte: toDate },
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      register: true,
      rotation: true,
      apartment: {
        select: {
          id: true,
          name: true,
          block: {
            select: {
              name: true,
              complex: { select: { socialName: true } },
            },
          },
        },
      },
    },
  });

  const results: LeakDetectionResult[] = [];

  for (const meter of meters) {
    if (!meter.apartment) continue;

    // Buscar leituras diárias do período
    const readings = await prisma.reading.findMany({
      where: {
        meterId: meter.id,
        readAt: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
      select: { reading: true, readAt: true },
      orderBy: { readAt: 'asc' },
    });

    if (readings.length < 4) continue; // precisa de pelo menos 4 leituras

    // Calcular deltas diários
    const rotation = meter.rotation || 'Crescente';
    const deltas: { date: Date; value: number; hour: number }[] = [];

    for (let i = 1; i < readings.length; i++) {
      const prev = Number(readings[i - 1].reading ?? 0);
      const curr = Number(readings[i].reading ?? 0);
      const delta = rotation === 'Decrescente' ? prev - curr : curr - prev;
      deltas.push({
        date: readings[i].readAt,
        value: delta,
        hour: readings[i].readAt.getHours(),
      });
    }

    if (deltas.length === 0) continue;

    const avgDaily = deltas.reduce((s, d) => s + d.value, 0) / deltas.length;

    // Consumo noturno: leituras entre 0h e 5h
    const nightDeltas = deltas.filter(d => d.hour >= 0 && d.hour <= 5);
    const nightConsumption = nightDeltas.reduce((s, d) => s + d.value, 0);
    const totalConsumption = deltas.reduce((s, d) => s + d.value, 0);
    const nightRatio = totalConsumption > 0 ? (nightConsumption / totalConsumption) * 100 : 0;

    // Consumo muito estável (baixa variação = vazamento contínuo)
    const values = deltas.map(d => d.value).filter(v => v > 0);
    if (values.length < 3) continue;

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const cv = Math.sqrt(variance) / mean; // coeficiente de variação

    // Critérios de vazamento:
    // 1. Consumo noturno > 30% do total (madrugada não deveria ter consumo alto)
    // 2. CV baixo (< 0.3) = consumo muito estável, típico de vazamento
    // 3. Média diária > 0.5 m³ (valor mínimo para considerar)
    const isLeakSuspect =
      avgDaily > 0.5 &&
      (nightRatio > 30 || (cv < 0.3 && avgDaily > 1));

    if (!isLeakSuspect) continue;

    let severity: LeakDetectionResult['severity'] = 'low';
    let reason = '';

    if (nightRatio > 50 && avgDaily > 1) {
      severity = 'high';
      reason = `Consumo noturno elevado (${Math.round(nightRatio)}% do total) com média diária de ${avgDaily.toFixed(2)} m³. Forte indicativo de vazamento.`;
    } else if (nightRatio > 30 || (cv < 0.2 && avgDaily > 0.8)) {
      severity = 'medium';
      reason = `Consumo anormalmente estável (variação baixa) com média diária de ${avgDaily.toFixed(2)} m³. Possível vazamento contínuo.`;
    } else {
      severity = 'low';
      reason = `Padrão de consumo atípico detectado. Média diária de ${avgDaily.toFixed(2)} m³ nos últimos ${deltas.length} dias.`;
    }

    results.push({
      apartmentId: meter.apartment.id,
      apartmentName: meter.apartment.name,
      blockName: meter.apartment.block?.name ?? '-',
      complexName: meter.apartment.block?.complex?.socialName ?? '-',
      meterId: meter.id,
      avgDailyConsumption: Math.round(avgDaily * 100) / 100,
      nightConsumptionRatio: Math.round(nightRatio * 10) / 10,
      consecutiveDays: deltas.length,
      severity,
      reason,
    });
  }

  return results.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}
