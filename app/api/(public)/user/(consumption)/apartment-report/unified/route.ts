import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';

// Request payload types (kept local to route to avoid broad type coupling)
interface UnifiedReadingPayload {
  enabled: boolean;
  readingId?: string; // When provided, update existing reading instead of creating new
  meterId?: string; // Optional – if not provided we'll try to auto-pick main meter
  reading?: number; // Leitura (m³)
  readAtDate?: string; // YYYY-MM-DD (data_leitura)
  urlCover?: string; // Optional image URL (foto)
  nextReadingDate?: string; // prox_leitura (YYYY-MM-DD)
  isPreReading?: boolean; // pre_leitura
  registerName?: string; // chassi (manual override)
}

interface UnifiedReportPayload {
  apartmentId: string;
  dealershipReadingId: string;
  monthRef: string; // Expected numeric for reports ("01".."12")
  yearRef: string;  // Ex: "2024"
  consumption?: number;
  totalConsumption?: number;
  consumptionCost?: number;
  sewageCost?: number;
  partial?: number;
  totalUnit?: number;
  kiteCarConsumption?: number;
  kiteCarCost?: number;
  consumptionGasValue?: number;
  totalGasValue?: number;
}

interface UnifiedItemPayload {
  report: UnifiedReportPayload;
  reading?: UnifiedReadingPayload;
}

interface UnifiedItemResult {
  apartmentId: string;
  reportId?: string;
  readingId?: string;
  createdReport?: boolean;
  updatedReport?: boolean;
  createdReading?: boolean;
  updatedReading?: boolean;
  errors?: string[];
  warnings?: string[];
}

interface UnifiedResponse {
  items: UnifiedItemResult[];
  errors: string[]; // route-level errors
  success: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const items: UnifiedItemPayload[] = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Payload inválido: items vazio.' }, { status: 400 });
    }

    const results: UnifiedItemResult[] = [];
    const routeErrors: string[] = [];

    for (const payload of items) {
      const r: UnifiedItemResult = { apartmentId: payload.report?.apartmentId }; // base result
      const errors: string[] = [];
      const warnings: string[] = [];
      try {
        if (!payload.report?.apartmentId || !payload.report.dealershipReadingId || !payload.report.monthRef || !payload.report.yearRef) {
          errors.push('Dados obrigatórios do relatório ausentes (apartmentId, dealershipReadingId, monthRef, yearRef).');
          r.errors = errors; r.warnings = warnings; results.push(r); continue;
        }

        // Validate dealership reading context (ensure exists & consistent)
        const dealershipReading = await prisma.dealershipReading.findFirst({
          where: { id: payload.report.dealershipReadingId, deletedAt: null },
          select: { id: true, monthRef: true, yearRef: true, complexId: true }
        });
        if (!dealershipReading) {
          errors.push('Leitura da concessionária não encontrada.');
          r.errors = errors; r.warnings = warnings; results.push(r); continue;
        }

        // Fetch apartment to obtain contextual denormalized fields
        const apartment = await prisma.apartment.findFirst({
          where: { id: payload.report.apartmentId, deletedAt: null },
          include: { block: { include: { complex: true } }, meters: { where: { deletedAt: null } } }
        });
        if (!apartment) {
          errors.push('Apartamento não encontrado.');
          r.errors = errors; r.warnings = warnings; results.push(r); continue;
        }

        // ===== Optional Reading Creation =====
        let readingId: string | undefined;
        if (payload.reading?.enabled) {
          // UPDATE path
          if (payload.reading.readingId) {
            const existingReading = await prisma.reading.findFirst({ where: { id: payload.reading.readingId, deletedAt: null }, select: { id: true } });
            if (!existingReading) {
              errors.push('Leitura para atualização não encontrada.');
            } else {
              if (payload.reading?.reading == null || isNaN(Number(payload.reading.reading))) {
                errors.push('Valor de leitura inválido.');
              }
              if (!payload.reading?.readAtDate) {
                errors.push('Data de leitura (readAtDate) é obrigatória.');
              }
              if (!errors.length) {
                const readAtDate = payload.reading.readAtDate!;
                let readAt: Date;
                try {
                  readAt = new Date(`${readAtDate}T00:00:00.000Z`);
                  if (isNaN(readAt.getTime())) throw new Error('Data inválida');
                } catch {
                  errors.push('Formato de data inválido para leitura.');
                  readAt = new Date();
                }
                if (!errors.length) {
                  const monthNum = (readAt.getUTCMonth() + 1).toString().padStart(2, '0');
                  const yearStr = readAt.getUTCFullYear().toString();
                  const updated = await prisma.reading.update({
                    where: { id: existingReading.id },
                    data: {
                      reading: payload.reading.reading!,
                      readAt,
                      readAtDate,
                      monthRef: monthNum,
                      yearRef: yearStr,
                      isPreReading: payload.reading.isPreReading ?? undefined,
                      nextReadingDate: payload.reading.nextReadingDate || undefined,
                      registerName: payload.reading.registerName || undefined,
                      urlCover: payload.reading.urlCover || undefined,
                      updatedByUserId: userId,
                      updatedAt: new Date(),
                    }
                  });
                  readingId = updated.id;
                  r.updatedReading = true;
                  r.readingId = readingId;
                }
              }
            }
          } else {
            // CREATE path
            let meterId = payload.reading.meterId;
            if (!meterId) {
              const mainMeter = apartment.meters.find(m => m.status === 'Ativo') || apartment.meters[0];
              if (!mainMeter) {
                errors.push('Nenhum medidor disponível para criar a leitura.');
              } else {
                meterId = mainMeter.id;
              }
            }
            if (!errors.length) {
              if (payload.reading?.reading == null || isNaN(Number(payload.reading.reading))) {
                errors.push('Valor de leitura inválido.');
              }
              if (!payload.reading?.readAtDate) {
                errors.push('Data de leitura (readAtDate) é obrigatória.');
              }
            }
            if (!errors.length && meterId) {
              const readAtDate = payload.reading.readAtDate!;
              let readAt: Date;
              try {
                readAt = new Date(`${readAtDate}T00:00:00.000Z`);
                if (isNaN(readAt.getTime())) throw new Error('Data inválida');
              } catch {
                errors.push('Formato de data inválido para leitura.');
                readAt = new Date();
              }
              if (!errors.length) {
                const monthNum = (readAt.getUTCMonth() + 1).toString().padStart(2, '0');
                const yearStr = readAt.getUTCFullYear().toString();
                const createdReading = await prisma.reading.create({
                  data: {
                    reading: payload.reading.reading!,
                    meterId,
                    readAt,
                    readAtDate,
                    monthRef: monthNum,
                    yearRef: yearStr,
                    apartmentId: apartment.id,
                    blockId: apartment.blockId,
                    complexId: apartment.block.complexId,
                    companyId: apartment.block.complex?.companyId,
                    isManualReading: true,
                    isPreReading: payload.reading.isPreReading ?? false,
                    nextReadingDate: payload.reading.nextReadingDate || undefined,
                    registerName: payload.reading.registerName || apartment.meters.find(m => m.id === meterId)?.register,
                    urlCover: payload.reading.urlCover || undefined,
                    createdByUserId: userId,
                    deletedAt: null,
                  }
                });
                readingId = createdReading.id;
                r.createdReading = true;
                r.readingId = readingId;
              }
            }
          }
        }

        if (errors.length) {
          r.errors = errors; r.warnings = warnings; results.push(r); continue;
        }

        // ===== Report create or update =====
        const { monthRef, yearRef } = payload.report; // expected numeric strings already
        const existingReport = await prisma.apartmentConsumptionReport.findFirst({
          where: {
            apartmentId: payload.report.apartmentId,
            monthRef: monthRef.toString(),
            yearRef: yearRef.toString(),
            deletedAt: null,
          },
          select: { id: true }
        });

        const reportData = {
          apartmentId: payload.report.apartmentId,
          dealershipReadingId: payload.report.dealershipReadingId,
          monthRef: monthRef.toString(),
          yearRef: yearRef.toString(),
          consumption: payload.report.consumption ?? 0,
          totalConsumption: payload.report.totalConsumption ?? 0,
            consumptionCost: payload.report.consumptionCost ?? 0,
          sewageCost: payload.report.sewageCost ?? 0,
          partial: payload.report.partial ?? 0,
          totalUnit: payload.report.totalUnit ?? 0,
          kiteCarConsumption: payload.report.kiteCarConsumption ?? 0,
          kiteCarCost: payload.report.kiteCarCost ?? 0,
          consumptionGasValue: payload.report.consumptionGasValue ?? 0,
          totalGasValue: payload.report.totalGasValue ?? 0,
          blockId: apartment.blockId,
          complexId: apartment.block.complexId,
          companyId: apartment.block.complex?.companyId,
          lastReadingId: readingId || undefined,
        };

        if (existingReport) {
          const updated = await prisma.apartmentConsumptionReport.update({
            where: { id: existingReport.id },
            data: {
              ...reportData,
              updatedByUserId: userId,
              updatedAt: new Date(),
            }
          });
          r.reportId = updated.id;
          r.updatedReport = true;
        } else {
          const created = await prisma.apartmentConsumptionReport.create({
            data: {
              ...reportData,
              createdByUserId: userId,
              deletedAt: null,
            }
          });
          r.reportId = created.id;
          r.createdReport = true;
        }
      } catch (err: any) {
        errors.push(err?.message || 'Erro desconhecido ao processar item.');
      }
      if (errors.length) r.errors = errors;
      if (warnings.length) r.warnings = warnings;
      results.push(r);
    }

    const response: UnifiedResponse = {
      items: results,
      errors: routeErrors,
      success: results.some(i => i.createdReport || i.updatedReport || i.createdReading),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Erro rota unified apartment-report:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
