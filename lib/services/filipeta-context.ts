/**
 * lib/services/filipeta-context.ts
 *
 * Regras ÚNICAS de montagem do extrato individual (Filipeta). Antes cada rota
 * (cron da fila e disparo manual) repetia a conta, e as duas tinham o mesmo
 * defeito: o "mês anterior" era buscado por unidade + competência SEM a
 * utilidade — a filipeta de GÁS pegava a leitura da ÁGUA (ex.: Pop Art 10/2026,
 * unidade 82: índice inicial 2.045,23 da água em vez de 3.387,567 do gás).
 */

import type { FilipetaEmailData } from './filipeta-email-template';

export function previousMonthOf(monthRef: string, yearRef: string) {
  const date = new Date(Number(yearRef), Number(monthRef) - 2, 1);
  return { monthRef: String(date.getMonth() + 1).padStart(2, '0'), yearRef: String(date.getFullYear()) };
}

/** Chave do relatório: a utilidade faz parte da chave (água e gás no mesmo mês). */
export function filipetaReportKey(apartmentId: string, monthRef: string, yearRef: string, utilityType?: string | null) {
  return `${apartmentId}:${yearRef}:${String(monthRef).padStart(2, '0')}:${utilityType || 'null'}`;
}

/** Consumo que o morador vê: em gás o m³ fica em consumptionGasValue. */
export function currentConsumptionOf(report: any): number {
  const isGas = String(report?.utilityType || '').toLowerCase() === 'gas';
  const value = isGas
    ? report?.consumptionGasValue || report?.totalConsumption || report?.consumption
    : report?.totalConsumption || report?.consumption;
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Consumo da conta que é o total DAS UNIDADES (não o da concessionária). */
export function condominiumConsumptionOf(dealership: any): number | null {
  const monthly = Number(dealership?.monthlyConsumption ?? 0);
  if (Number.isFinite(monthly) && monthly > 0) return monthly;
  const concessionaria = Number(dealership?.dealershipConsumption ?? 0);
  return Number.isFinite(concessionaria) && concessionaria > 0 ? concessionaria : null;
}

/** Consumo por economia: média por unidade da competência. */
export function consumptionPerEconomyOf(dealership: any, unitsCount: number | null | undefined): number | null {
  const average = Number(dealership?.average ?? 0);
  if (Number.isFinite(average) && average > 0) return average;
  const monthly = Number(dealership?.monthlyConsumption ?? 0);
  const count = Number(unitsCount ?? 0);
  if (Number.isFinite(monthly) && monthly > 0 && count > 0) return Number((monthly / count).toFixed(4));
  return null;
}

/**
 * Índice inicial: SEMPRE a leitura anterior do MESMO medidor/utilidade.
 * Prioriza a aritmética da própria conta (final − consumo), que é coerente com
 * o que o morador vê no extrato e no app; se não houver índice final, usa a
 * leitura do relatório anterior da mesma utilidade.
 */
export function resolveInitialReading(args: {
  finalReading?: number | null;
  consumption?: number | null;
  previousReportReading?: number | null;
}): number | null {
  const { finalReading, consumption, previousReportReading } = args;
  const fin = finalReading == null ? null : Number(finalReading);
  const cons = consumption == null ? null : Number(consumption);
  if (fin != null && Number.isFinite(fin) && cons != null && Number.isFinite(cons)) {
    return Number((fin - cons).toFixed(3));
  }
  const prev = previousReportReading == null ? null : Number(previousReportReading);
  return prev != null && Number.isFinite(prev) ? prev : null;
}

export function derivePeriodStartOf(value: string | null | undefined, totalDays: number | null | undefined) {
  if (!value || totalDays == null || !Number.isFinite(Number(totalDays))) return undefined;
  const raw = String(value);
  const date = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() - Number(totalDays));
  return date.toISOString().slice(0, 10);
}

/** Dados do extrato a partir dos documentos (relatório, unidade, condomínio, conta). */
export function buildFilipetaData(args: {
  residentName?: string | null;
  apartmentName?: string | null;
  blockName?: string | null;
  complexName?: string | null;
  monthRef: string;
  yearRef: string;
  report: any;
  dealership?: any;
  previousReport?: any;
  unitsCount?: number | null;
  analysis?: any;
  alertCount?: number;
  alarmsMessage?: string;
}): FilipetaEmailData {
  const { report, dealership, previousReport } = args;
  const consumption = currentConsumptionOf(report);
  const finalReading = report?.lastReading?.reading ?? null;
  const initialReading = resolveInitialReading({
    finalReading,
    consumption,
    previousReportReading: previousReport?.lastReading?.reading ?? null,
  });
  const readingDate = report?.lastReading?.readAtDate || dealership?.readingDate || null;
  const periodEnd = readingDate ? String(readingDate).split(/[ T]/)[0] : undefined;
  const periodStart = previousReport?.lastReading?.readAtDate
    ? String(previousReport.lastReading.readAtDate).split(/[ T]/)[0]
    : derivePeriodStartOf(periodEnd, dealership?.totalDays);
  const alertCount = Number(args.alertCount ?? 0);

  return {
    residentName: args.residentName || 'Morador',
    apartmentName: args.apartmentName || '',
    blockName: args.blockName || '',
    complexName: args.complexName || '',
    monthRef: args.monthRef,
    yearRef: args.yearRef,
    consumption,
    totalConsumption: consumption,
    initialReading,
    finalReading,
    consumptionCost: Number(report?.consumptionCost ?? 0),
    sewageCost: Number(report?.sewageCost ?? 0),
    totalUnit: Number(report?.totalUnit ?? 0),
    rateioValue: report?.partial ?? null,
    kiteCarConsumption: report?.kiteCarConsumption ?? undefined,
    kiteCarCost: report?.kiteCarCost ?? undefined,
    utilityType: report?.utilityType || undefined,
    readingDate: readingDate ? String(readingDate) : undefined,
    nextReadingDate: report?.lastReading?.nextReadingDate || dealership?.readingDateNext || undefined,
    periodStart,
    periodEnd,
    condominiumConsumption: condominiumConsumptionOf(dealership),
    condominiumBillValue: dealership?.totalValue ?? null,
    consumptionPerEconomy: consumptionPerEconomyOf(dealership, args.unitsCount),
    hasAlerts: alertCount > 0,
    alertMessage: alertCount > 0
      ? args.alarmsMessage || `Sua unidade possui ${alertCount} alerta(s) recente(s) do sistema de monitoramento. Acesse o sistema para visualizar os detalhes.`
      : undefined,
    analysis: args.analysis,
  };
}
