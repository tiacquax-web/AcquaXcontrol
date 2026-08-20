import { NextRequest, NextResponse } from 'next/server';
import { PermissionableEntity } from '@prisma/client';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_KEY = /^\d{4}-\d{2}$/;

function notDeleted() {
  return { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
}

function monthKeys(start: string, end: string) {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const limit = new Date(Date.UTC(endYear, endMonth - 1, 1));
  const result: string[] = [];

  while (cursor <= limit && result.length < 36) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function allowedComplexWhere(contexts: Awaited<ReturnType<typeof getUserContextsForActionOnEntity>>) {
  if (contexts.system) return {};
  const or: any[] = [];
  if (contexts.complexIds.length) or.push({ id: { in: contexts.complexIds } });
  if (contexts.companyIds.length) or.push({ companyId: { in: contexts.companyIds } });
  if (contexts.blockIds.length) or.push({ blocks: { some: { id: { in: contexts.blockIds } } } });
  if (contexts.apartmentIds.length) {
    or.push({ blocks: { some: { apartments: { some: { id: { in: contexts.apartmentIds } } } } } });
  }
  return or.length ? { OR: or } : { id: '__no_access__' };
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: sessionError || 'Não autorizado' }, { status: sessionStatus || 401 });
    }

    const complexId = req.nextUrl.searchParams.get('complex_id');
    const apartmentId = req.nextUrl.searchParams.get('apartment_id');
    const utilityType = req.nextUrl.searchParams.get('utility_type') || 'water';
    const start = req.nextUrl.searchParams.get('start') || `${new Date().getFullYear()}-01`;
    const end = req.nextUrl.searchParams.get('end') || `${new Date().getFullYear()}-12`;

    if (!complexId) return NextResponse.json({ error: 'complex_id é obrigatório' }, { status: 400 });
    if (!MONTH_KEY.test(start) || !MONTH_KEY.test(end)) {
      return NextResponse.json({ error: 'start e end devem estar no formato YYYY-MM' }, { status: 400 });
    }

    const keys = monthKeys(start, end);
    if (!keys.length || keys.length > 36) {
      return NextResponse.json({ error: 'O período deve conter entre 1 e 36 meses' }, { status: 400 });
    }
    if (start > end) return NextResponse.json({ error: 'O período inicial não pode ser maior que o final' }, { status: 400 });

    const contexts = await getUserContextsForActionOnEntity(userId, PermissionableEntity.apartment, 'read');
    const residentOnly = !contexts.system &&
      contexts.apartmentIds.length > 0 &&
      contexts.blockIds.length === 0 &&
      contexts.complexIds.length === 0 &&
      contexts.companyIds.length === 0;
    const effectiveApartmentId = apartmentId || (residentOnly && contexts.apartmentIds.length === 1 ? contexts.apartmentIds[0] : null);
    const complex = await prisma.complex.findFirst({
      where: { id: complexId, ...allowedComplexWhere(contexts) },
      select: { id: true, socialName: true, aliasName: true },
    });
    if (!complex) return NextResponse.json({ error: 'Sem permissão para este condomínio' }, { status: 403 });

    if (effectiveApartmentId) {
      const apartment = await prisma.apartment.findFirst({
        where: {
          id: effectiveApartmentId,
          block: { complexId },
          ...notDeleted(),
        },
        select: { id: true },
      });
      if (!apartment) return NextResponse.json({ error: 'Unidade não pertence ao condomínio selecionado' }, { status: 400 });
      if (!contexts.system && contexts.apartmentIds.length && !contexts.apartmentIds.includes(effectiveApartmentId) && !contexts.blockIds.length && !contexts.complexIds.length && !contexts.companyIds.length) {
        return NextResponse.json({ error: 'Sem permissão para esta unidade' }, { status: 403 });
      }
    }

    const apartmentScope = effectiveApartmentId
      ? { apartmentId: effectiveApartmentId }
      : residentOnly
        ? { apartmentId: { in: contexts.apartmentIds } }
        : {};

    const previousKeys = keys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 2, 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });

    const [reports, dealershipReadings, previousReports] = await Promise.all([
      prisma.apartmentConsumptionReport.findMany({
      where: {
        complexId,
        utilityType: utilityType as any,
        yearRef: { in: [...new Set(keys.map((key) => key.slice(0, 4)))] },
        monthRef: { in: [...new Set(keys.map((key) => key.slice(5)))] },
        ...apartmentScope,
        ...notDeleted(),
      },
      select: {
        apartmentId: true,
        monthRef: true,
        yearRef: true,
        consumption: true,
        totalConsumption: true,
        totalUnit: true,
        partial: true,
        lastReading: {
          select: {
            readAt: true,
            readAtDate: true,
            readingDate: true,
            nextReadingDate: true,
            readingDateNext: true,
          },
        },
        },
      }),
      prisma.dealershipReading.findMany({
        where: {
          complexId,
          type: utilityType as any,
          yearRef: { in: [...new Set(keys.map((key) => key.slice(0, 4)))] },
          monthRef: { in: [...new Set(keys.map((key) => key.slice(5)))] },
          ...notDeleted(),
        },
        select: {
          monthRef: true,
          yearRef: true,
          dealershipConsumption: true,
          monthlyConsumption: true,
          readingDate: true,
          readingDateNext: true,
          totalDays: true,
        },
      }),
      prisma.apartmentConsumptionReport.findMany({
        where: {
          complexId,
          utilityType: utilityType as any,
          yearRef: { in: [...new Set(previousKeys.map((key) => key.slice(0, 4)))] },
          monthRef: { in: [...new Set(previousKeys.map((key) => key.slice(5)))] },
          ...apartmentScope,
          ...notDeleted(),
        },
        select: {
          apartmentId: true,
          monthRef: true,
          yearRef: true,
          lastReading: {
            select: {
              readAt: true,
              readAtDate: true,
              readingDate: true,
            },
          },
        },
      }),
    ]);

    const grouped = new Map<string, typeof reports>();
    for (const report of reports) {
      const key = `${report.yearRef}-${String(report.monthRef).padStart(2, '0')}`;
      if (!keys.includes(key)) continue;
      const list = grouped.get(key) || [];
      list.push(report);
      grouped.set(key, list);
    }

    const dealershipByMonth = new Map<string, (typeof dealershipReadings)[number]>();
    const previousByApartmentMonth = new Map<string, (typeof previousReports)[number]>();
    for (const previous of previousReports) {
      previousByApartmentMonth.set(`${previous.apartmentId}|${previous.yearRef}-${String(previous.monthRef).padStart(2, '0')}`, previous);
    }
    for (const reading of dealershipReadings) {
      const key = `${reading.yearRef || ''}-${String(reading.monthRef).padStart(2, '0')}`;
      if (keys.includes(key)) dealershipByMonth.set(key, reading);
    }

    const series = keys.map((key) => {
      const [year, month] = key.split('-');
      const rows = grouped.get(key) || [];
      const byApartment = new Map<string, (typeof rows)[number]>();
      rows.forEach((row) => byApartment.set(row.apartmentId, row));
      const uniqueRows = [...byApartment.values()];
      const consumptionValues = uniqueRows.map((row) => Number(row.totalConsumption ?? row.consumption ?? 0));
      const costValues = uniqueRows.map((row) => Number(row.totalUnit ?? 0));
      // Mesma semântica do Levantamento: Água/Esgoto = totalUnit - partial; Área Comum = partial.
      const unitCostValues = uniqueRows.map((row) => Math.max(0, Number(row.totalUnit ?? 0) - Number(row.partial ?? 0)));
      const commonAreaValues = uniqueRows.map((row) => Math.max(0, Number(row.partial ?? 0)));
      const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
      const selected = effectiveApartmentId ? byApartment.get(effectiveApartmentId) : undefined;
      const dealership = dealershipByMonth.get(key);
      const condominiumConsumption = Number(dealership?.dealershipConsumption || dealership?.monthlyConsumption || 0);
      const commonAreaConsumption = residentOnly ? null : Math.max(0, condominiumConsumption - total(consumptionValues));
      const reference = selected || uniqueRows[0];
      const previousKey = previousKeys[keys.indexOf(key)];
      const previous = reference ? previousByApartmentMonth.get(`${reference.apartmentId}|${previousKey}`) : undefined;
      const reportReading = reference?.lastReading as any;
      const previousReading = previous?.lastReading as any;
      const periodEndValue = reportReading?.readAtDate || reportReading?.readingDate || reportReading?.readAt || dealership?.readingDate || null;
      const periodEndDate = periodEndValue ? new Date(periodEndValue) : new Date(Date.UTC(Number(year), Number(month), 0, 12, 0, 0));
      const totalDays = Number(dealership?.totalDays) || 30;
      const derivedStartDate = new Date(periodEndDate.getTime() - totalDays * 24 * 60 * 60 * 1000);
      const previousDateValue = previousReading?.readAtDate || previousReading?.readingDate || previousReading?.readAt || null;
      const periodStartDate = previousDateValue ? new Date(previousDateValue) : derivedStartDate;
      const nextReadingValue = reportReading?.nextReadingDate || reportReading?.readingDateNext || dealership?.readingDateNext || null;
      const nextReadingDate = nextReadingValue ? new Date(nextReadingValue) : new Date(periodEndDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isoOrNull = (value: Date) => Number.isNaN(value.getTime()) ? null : value.toISOString();

      return {
        key,
        year,
        month,
        label: `${MONTHS[Number(month) - 1]}/${year.slice(2)}`,
        unitCount: uniqueRows.length,
        averageConsumption: uniqueRows.length ? total(consumptionValues) / uniqueRows.length : 0,
        totalConsumption: total(consumptionValues),
        selectedConsumption: selected ? Number(selected.totalConsumption ?? selected.consumption ?? 0) : null,
        totalCost: total(costValues),
        averageCost: uniqueRows.length ? total(costValues) / uniqueRows.length : 0,
        unitCost: total(unitCostValues),
        averageUnitCost: uniqueRows.length ? total(unitCostValues) / uniqueRows.length : 0,
        selectedUnitCost: selected ? Math.max(0, Number(selected.totalUnit ?? 0) - Number(selected.partial ?? 0)) : null,
        commonAreaConsumption,
        commonAreaCost: total(commonAreaValues),
        averageCommonAreaCost: uniqueRows.length ? total(commonAreaValues) / uniqueRows.length : 0,
        selectedCommonAreaCost: selected ? Math.max(0, Number(selected.partial ?? 0)) : null,
        periodStart: isoOrNull(periodStartDate),
        periodEnd: isoOrNull(periodEndDate),
        nextReadingDate: isoOrNull(nextReadingDate),
      };
    });

    const sum = (field: keyof (typeof series)[number]) => series.reduce((acc, item) => acc + Number(item[field] ?? 0), 0);
    const monthsWithData = series.filter((item) => item.unitCount > 0).length;

    return NextResponse.json({
      complex,
      apartmentId: effectiveApartmentId,
      utilityType,
      start,
      end,
      series,
      summary: {
        monthsWithData,
        totalConsumption: sum('totalConsumption'),
        totalCost: sum('totalCost'),
        totalUnitCost: sum('unitCost'),
        totalCommonAreaConsumption: sum('commonAreaConsumption'),
        totalCommonAreaCost: sum('commonAreaCost'),
        averageMonthlyConsumption: monthsWithData ? sum('totalConsumption') / monthsWithData : 0,
        averageMonthlyCost: monthsWithData ? sum('totalCost') / monthsWithData : 0,
      },
    });
  } catch (error: any) {
    console.error('[dashboard/consumption-analysis]', error);
    return NextResponse.json({ error: 'Erro ao carregar análise de consumo' }, { status: 500 });
  }
}
