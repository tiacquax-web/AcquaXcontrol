import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUserSession } from "@/lib/users";
import { CombinedImportService } from "@/lib/services/combined-import-service";
import {
  CombinedReadingAndReportImport,
  CombinedImportResult,
  ProcessedReading,
  ApartmentConsumptionReport,
  MONTH_NAMES_MAP
} from "@/types/combined-import";
import { randomUUID } from 'crypto';
import { createEmailJobsForDealershipReading } from "@/lib/services/filipeta-email-dispatcher";

// Otimização (Alta prioridade implementada):
// 1. Prefetch de leituras e relatórios existentes.
// 2. Acúmulo de documentos para criação em lote (createMany) ao invés de criar um a um.
// 3. Remoção de logs síncronos dentro do loop principal.
// 4. Mantida a lógica original de warnings / errors por linha.
// 5. NÃO implementado chunking / processamento em lotes concorrentes (pedido do usuário).

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Verificar autenticação
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    }
    if (!userId) {
      return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      rows, 
      dealershipReadingId, 
      monthRef, 
      yearRef,
      conflictPolicy
    }: {
      rows: CombinedReadingAndReportImport[];
      dealershipReadingId: string;
      monthRef: string;
      yearRef: string;
      conflictPolicy?: 'skip' | 'link' | 'replace';
    } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { message: "Dados de importação inválidos" },
        { status: 400 }
      );
    }

    if (!dealershipReadingId) {
      return NextResponse.json(
        { message: "ID da leitura da concessionária é obrigatório" },
        { status: 400 }
      );
    }

    try {
      assertValidMonthYearOrThrow(monthRef, yearRef, 'payload');
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Mês/ano de referência inválidos" },
        { status: 400 }
      );
    }

    // Verificar se a leitura da concessionária existe
    console.time("⏱️ Fetch dealership reading");
    const dealershipReading = await prisma.dealershipReading.findFirst({
      where: {
        id: dealershipReadingId,
        deletedAt: null
      },
      include: {
        complex: true
      }
    });
    console.timeEnd("⏱️ Fetch dealership reading");

    if (!dealershipReading) {
      return NextResponse.json(
        { message: "Leitura da concessionária não encontrada" },
        { status: 404 }
      );
    }

    // Buscar apartamentos + meters do complexo (já era feito – mantém include para evitar nova query por meter)
    console.time("⏱️ Fetch apartments and meters");
    const apartments = await prisma.apartment.findMany({
      where: { complexId: dealershipReading.complexId, deletedAt: null },
      include: {
        block: { include: { complex: true } },
        meters: { where: { deletedAt: null }, include: { typeMeter: true } as any }
      }
    });
    console.timeEnd("⏱️ Fetch apartments and meters");

    const apartmentById = new Map(apartments.map(apt => [apt.id, apt]));

    // Map para lookup mais rápido de apartamento (bloco+apartamento) evitando busca linear O(n) * linhas
    const apartmentLookup = new Map<string, typeof apartments[number]>();
    for (const apt of apartments) {
      const key = `${apt.block?.name?.toString() || ''}::${apt.name?.toString()}`.toLowerCase();
      apartmentLookup.set(key, apt);
    }

    const result: CombinedImportResult = {
      success: false,
      readingsCreated: 0,
      reportsCreated: 0,
      reportsUpdated: 0,
      linkedReports: 0,
      errors: [],
      warnings: []
    };

    function sanitizeUpdateData(data: Record<string, any>) {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    function normalizeMonthRefValue(value: string | number | null | undefined) {
      const raw = (value ?? '').toString().trim();
      if (!raw) return '';
      const lower = raw.toLowerCase();
      const mapped = MONTH_NAMES_MAP[lower];
      if (mapped) return mapped;
      if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, '0');
      return '';
    };

    function normalizeYearRefValue(value: string | number | null | undefined) {
      const raw = (value ?? '').toString().trim();
      if (!raw) return '';
      return /^\d{4}$/.test(raw) ? raw : '';
    };

    function assertValidMonthYearOrThrow(month: string | number | null | undefined, year: string | number | null | undefined, contextLabel: string) {
      const normalizedMonth = normalizeMonthRefValue(month);
      const normalizedYear = normalizeYearRefValue(year);
      if (!normalizedMonth) {
        throw new Error(`Mês de referência inválido (${contextLabel}). Use 1-12 ou o nome do mês em português.`);
      }
      if (!normalizedYear) {
        throw new Error(`Ano de referência inválido (${contextLabel}). Use ano com 4 dígitos (ex: 2025).`);
      }
      return { normalizedMonth, normalizedYear };
    };

    // ===== NOVA ABORDAGEM: PRIMEIRO PASSO – COLETAR E NORMALIZAR =====
    interface RowContext {
      lineNumber: number;
      apartmentId: string;
      hasReportData: boolean;
      reportBase?: Partial<ApartmentConsumptionReport>;
      lastReadingKey?: string; // chave da leitura "final" da linha (para eventual link)
    }

    const rowContexts: RowContext[] = [];

    type ReadingCandidate = {
      id: string;
      key: string; // meterId::readAtDate
      meterId: string;
      readAtDate: string;
      data: any; // objeto final para createMany
      lineNumber: number;
    };
    const readingCandidates: ReadingCandidate[] = [];
    const readingKeySetInFile = new Set<string>(); // detectar duplicadas dentro do próprio arquivo

    // Helper para checar se o medidor é do mesmo utilitário
    const isMeterOfUtility = (meter: any, util: 'water' | 'gas') => {
      const tm = meter?.typeMeter;
      if (!tm) return true; // fallback: se não tiver typemeter, não bloquear
      const name = (tm.name || '').toString().toLowerCase();
      const acr = (tm.acronym || '').toString().toLowerCase();
      if (util === 'gas') {
        return name.includes('gas') || name.includes('gás') || acr.includes('gas') || acr.includes('gás') || acr === 'g';
      } else {
        return name.includes('agua') || name.includes('água') || name.includes('water') || acr.includes('agua') || acr.includes('água') || acr === 'h2o' || acr === 'w';
      }
    };

    // Percorrer linhas apenas para montar estruturas em memória
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = i + 2; // Excel line number
      try {
        const normalizedRowMonth = normalizeMonthRefValue(row.mes_ref as any);
        if (!normalizedRowMonth) {
          result.errors.push({
            row: lineNumber,
            type: 'validation',
            message: `Linha ${lineNumber}: mes_ref inválido. Use 1-12 ou o nome do mês em português.`
          });
          continue;
        }
        const normalizedRowYear = normalizeYearRefValue(row.ano_ref as any);
        if (!normalizedRowYear) {
          result.errors.push({
            row: lineNumber,
            type: 'validation',
            message: `Linha ${lineNumber}: ano_ref inválido. Use ano com 4 dígitos (ex: 2025).`
          });
          continue;
        }

        // Lookup rápido de apartamento
        const aptKey = `${row.bloco?.toString() || ''}::${row.apartamento?.toString()}`.toLowerCase();
        const apartment = apartmentLookup.get(aptKey);
        if (!apartment) {
          result.errors.push({
            row: lineNumber,
            type: 'validation',
            message: `Apartamento ${row.bloco}/${row.apartamento} não encontrado`
          });
          continue;
        }

        const processed = CombinedImportService.processImportRow(
          row,
          apartment.id,
             dealershipReadingId
        );

        // Resolver readings (se houver)
        let lastReadingKey: string | undefined;
        if (processed.hasReadingData && processed.readings.length > 0) {
          for (const r of processed.readings) {
            // Encontrar meter (chassi/register)
            const meter = apartment.meters.find(m => isMeterOfUtility(m, dealershipReading.type as any) && m.register?.toLowerCase() === r.registerName?.toLowerCase());
            if (!meter) {
              result.warnings.push({
                row: lineNumber,
                type: 'reading',
                message: `Medidor com chassi "${r.registerName}" não encontrado para apartamento ${row.bloco}/${row.apartamento}`
              });
              continue;
            }
            const key = `${meter.id}::${r.readAtDate}`;
            if (readingKeySetInFile.has(key)) {
              result.warnings.push({
                row: lineNumber,
                type: 'reading',
                message: `Leitura duplicada no arquivo para medidor ${r.registerName} na data ${r.readAtDate}`
              });
              continue;
            }
            readingKeySetInFile.add(key);
            const id = randomUUID();
            const data = {
              id,
              reading: r.reading,
              readAt: r.readAt,
              readAtDate: r.readAtDate,
              monthRef: r.monthRef,
              yearRef: r.yearRef,
              meterId: meter.id,
              apartmentId: apartment.id,
              blockId: apartment.blockId,
              complexId: apartment.block.complexId,
              companyId: apartment.block.complex?.companyId,
              isManualReading: r.isManualReading,
              isPreReading: r.isPreReading,
              registerName: r.registerName,
              nextReadingDate: r.nextReadingDate,
              urlCover: r.urlCover,
              createdByUserId: userId,
              deletedAt: null
            };
            readingCandidates.push({ id, key, meterId: meter.id, readAtDate: r.readAtDate, data, lineNumber });
            // Segue a semântica anterior: última leitura criada no loop vira lastReadingId – aqui será a última válida
            lastReadingKey = key;
          }
        }

        // Guardar contexto de relatório (será resolvido depois de saber quais leituras REALMENTE serão inseridas)
        let reportBase: Partial<ApartmentConsumptionReport> | undefined;
        if (processed.hasReportData && processed.apartmentReport) {
          reportBase = { ...processed.apartmentReport };
        }
        rowContexts.push({
          lineNumber,
            apartmentId: apartment.id,
          hasReportData: !!reportBase,
          reportBase,
          lastReadingKey
        });
      } catch (error) {
        result.errors.push({
          row: lineNumber,
          type: 'validation',
          message: `Erro ao processar linha: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        });
      }
    }

    const hasInvalidDateRefs = result.errors.some(err => err.type === 'validation' && (err.message.includes('mes_ref') || err.message.includes('ano_ref')));
    if (hasInvalidDateRefs) {
      return NextResponse.json(
        { message: "Planilha contém mes_ref/ano_ref inválidos. Corrija e tente novamente.", errors: result.errors },
        { status: 400 }
      );
    }

    const reportYearSet = new Set<string>();
    const reportMonthVariantSet = new Set<string>();
    for (const ctx of rowContexts) {
      if (!ctx.hasReportData || !ctx.reportBase) continue;
      const rawMonthCandidate = ctx.reportBase.monthRef ?? monthRef ?? '';
      const normalized = normalizeMonthRefValue(rawMonthCandidate);
      if (normalized) reportMonthVariantSet.add(normalized);

      const yearCandidate = ctx.reportBase.yearRef ?? yearRef;
      const normalizedYear = normalizeYearRefValue(yearCandidate);
      if (normalizedYear) reportYearSet.add(normalizedYear);
    }
    if (monthRef) {
      const normalized = normalizeMonthRefValue(monthRef);
      if (normalized) reportMonthVariantSet.add(normalized);
    }
    if (yearRef) {
      const normalizedYear = normalizeYearRefValue(yearRef);
      if (normalizedYear) reportYearSet.add(normalizedYear);
    }

    // ===== PREFETCH EXISTENTES NO BANCO =====
    // Leituras existentes (meterId + readAtDate)
    const meterToDates = new Map<string, Set<string>>();
    for (const candidate of readingCandidates) {
      if (!meterToDates.has(candidate.meterId)) {
        meterToDates.set(candidate.meterId, new Set());
      }
      meterToDates.get(candidate.meterId)!.add(candidate.readAtDate);
    }

    let existingReadingsKeySet = new Set<string>();
    const existingReadingsIdMap = new Map<string, string>(); // key -> existing reading id
    if (meterToDates.size > 0) {
      const orFilters = Array.from(meterToDates.entries()).map(([meterId, dateSet]) => ({
        meterId,
        readAtDate: { in: Array.from(dateSet) },
        deletedAt: null
      }));

      console.time("⏱️ Fetch existing readings");
      const existingReadings = await prisma.reading.findMany({
        where: {
          OR: orFilters
        },
        select: { id: true, meterId: true, readAtDate: true }
      });
      console.timeEnd("⏱️ Fetch existing readings");
      existingReadingsKeySet = new Set(existingReadings.map(er => `${er.meterId}::${er.readAtDate}`));
      existingReadings.forEach(er => existingReadingsIdMap.set(`${er.meterId}::${er.readAtDate}`, er.id));
    }

    const policy: 'skip' | 'link' | 'replace' = (conflictPolicy === 'skip' || conflictPolicy === 'link') ? conflictPolicy : 'replace';
    const toSoftDeleteReadingIds: string[] = [];
    const readingKeyToId = new Map<string, string>();

    // Filtrar apenas leituras que não existem ainda, respeitando a política de conflito
    const newReadingCandidates = readingCandidates.filter(rc => {
      const exists = existingReadingsKeySet.has(rc.key);
      if (!exists) return true;
      // exists == true
      if (policy === 'link') {
        const exId = existingReadingsIdMap.get(rc.key);
        if (exId) {
          // Mapear para poder vincular no relatório mesmo sem criar nova leitura
          readingKeyToId.set(rc.key, exId);
        }
        result.warnings.push({ row: rc.lineNumber, type: 'reading', message: `Leitura existente será vinculada (${rc.readAtDate}).` });
        return false; // não criar nova
      }
      if (policy === 'replace') {
        const exId = existingReadingsIdMap.get(rc.key);
        if (exId) toSoftDeleteReadingIds.push(exId);
        result.warnings.push({ row: rc.lineNumber, type: 'reading', message: `Leitura existente será substituída (${rc.readAtDate}).` });
        return true; // cria nova após soft-delete
      }
      // skip (padrão) — leitura não é recriada, mas mapeamos o id existente
      // para que o lastReadingId do relatório seja vinculado corretamente.
      const exId = existingReadingsIdMap.get(rc.key);
      if (exId) {
        readingKeyToId.set(rc.key, exId);
      }
      result.warnings.push({
        row: rc.lineNumber,
        type: 'reading',
        message: `Leitura já existe para medidor na data ${rc.readAtDate}`
      });
      return false;
    });

  const utilityType = dealershipReading.type;

    // Relatórios existentes (apenas para apartamentos tocados)
    const apartmentsTouched = Array.from(new Set(rowContexts.map(rc => rc.apartmentId)));
    const monthFilters = Array.from(reportMonthVariantSet).filter(Boolean);
    const yearFilters = Array.from(reportYearSet).filter(Boolean);
    const hasAnyReportData = rowContexts.some(rc => rc.hasReportData);
    if (hasAnyReportData && (monthFilters.length === 0 || yearFilters.length === 0)) {
      return NextResponse.json(
        { message: "Mês/ano de referência inválidos. Verifique os campos mes_ref e ano_ref na planilha." },
        { status: 400 }
      );
    }
    if (apartmentsTouched.length > 0 && monthFilters.length > 0 && yearFilters.length > 0) {
      console.time("⏱️ Fetch existing reports");
    }
    const existingReports = (apartmentsTouched.length > 0 && monthFilters.length > 0 && yearFilters.length > 0)
      ? await prisma.apartmentConsumptionReport.findMany({
          where: ({
            apartmentId: { in: apartmentsTouched },
            monthRef: { in: monthFilters },
            yearRef: { in: yearFilters },
            deletedAt: null
          } as any),
          select: { id: true, apartmentId: true, monthRef: true, yearRef: true, utilityType: true }
        })
      : [];
    if (apartmentsTouched.length > 0 && monthFilters.length > 0 && yearFilters.length > 0) {
      console.timeEnd("⏱️ Fetch existing reports");
    }

    const makeReportBaseKey = (apartmentId: string, monthValue: string, yearValue: string) =>
      `${apartmentId}::${normalizeMonthRefValue(monthValue)}::${yearValue}`;

    const existingReportIndex = new Map<string, Map<string | null, string>>();
    for (const report of existingReports) {
      const baseKey = makeReportBaseKey(report.apartmentId, report.monthRef, report.yearRef);
      if (!existingReportIndex.has(baseKey)) {
        existingReportIndex.set(baseKey, new Map());
      }
      existingReportIndex.get(baseKey)!.set(report.utilityType ?? null, report.id);
    }

    // Map para pegar id de leitura futura pela key (inclui vinculadas existentes também)
    newReadingCandidates.forEach(rc => readingKeyToId.set(rc.key, rc.id));

    // Preparar arrays para criação/atualização de relatórios
    const reportCreates: any[] = [];
    const reportUpdates: { id: string; data: any; lineNumber: number }[] = [];

    for (const ctx of rowContexts) {
      if (!ctx.hasReportData || !ctx.reportBase) continue;
      const reportData = { ...ctx.reportBase } as Partial<ApartmentConsumptionReport> & { lastReadingId?: string };
      // Link somente se a key da última leitura desta linha está entre as novas leituras a serem criadas
      if (ctx.lastReadingKey && readingKeyToId.has(ctx.lastReadingKey)) {
        reportData.lastReadingId = readingKeyToId.get(ctx.lastReadingKey);
      }
      // Normalização: para REPORTS usar sempre mês numérico (01..12); leituras permanecem com mês por extenso
      const rawMonthValue = reportData.monthRef ?? monthRef ?? '';
      const rawYearValue = reportData.yearRef ?? yearRef ?? '';
      let monthForStorage = '';
      let yearForStorage = '';
      try {
        const normalized = assertValidMonthYearOrThrow(rawMonthValue, rawYearValue, `linha ${ctx.lineNumber}`);
        monthForStorage = normalized.normalizedMonth;
        yearForStorage = normalized.normalizedYear;
      } catch (error) {
        result.errors.push({
          row: ctx.lineNumber,
          type: 'report',
          message: error instanceof Error ? error.message : 'Mês/ano de referência inválidos'
        });
        continue;
      }
      const baseKey = makeReportBaseKey(ctx.apartmentId, monthForStorage, yearForStorage);
      const utilitySpecificKey = utilityType ?? null;
      const perUtilityMap = existingReportIndex.get(baseKey);
      let existingId = perUtilityMap?.get(utilitySpecificKey ?? null);
      if (!existingId && perUtilityMap?.has(null)) {
        existingId = perUtilityMap.get(null) ?? undefined;
        if (existingId) {
          perUtilityMap.set(utilitySpecificKey ?? null, existingId);
        }
      }
      reportData.apartmentId = ctx.apartmentId;
      if (existingId) {
        reportUpdates.push({
          id: existingId,
          lineNumber: ctx.lineNumber,
          data: {
            monthRef: monthForStorage,
            yearRef: yearForStorage,
            consumption: reportData.consumption!,
            totalConsumption: reportData.totalConsumption,
            consumptionCost: reportData.consumptionCost!,
            sewageCost: reportData.sewageCost!,
            partial: reportData.partial!,
            totalUnit: reportData.totalUnit!,
            kiteCarConsumption: reportData.kiteCarConsumption,
            kiteCarCost: reportData.kiteCarCost,
            consumptionGasValue: reportData.consumptionGasValue,
            totalGasValue: reportData.totalGasValue,
            dealershipReadingId: reportData.dealershipReadingId!,
            lastReadingId: reportData.lastReadingId,
            utilityType: utilityType,
            updatedByUserId: userId,
            updatedAt: new Date()
          }
        });
      } else {
        const apartmentMeta = apartmentById.get(reportData.apartmentId!);
        if (!apartmentMeta) {
          result.errors.push({
            row: ctx.lineNumber,
            type: 'report',
            message: `Apartamento ${ctx.apartmentId} não encontrado para preencher relatório`
          });
          continue;
        }
        const newId = randomUUID();
        reportCreates.push({
          id: newId, // opcional, mas garante consistência se necessário em futuro link
          monthRef: monthForStorage,
          yearRef: yearForStorage,
          consumption: reportData.consumption!,
          totalConsumption: reportData.totalConsumption,
          consumptionCost: reportData.consumptionCost!,
          sewageCost: reportData.sewageCost!,
          partial: reportData.partial!,
          totalUnit: reportData.totalUnit!,
          kiteCarConsumption: reportData.kiteCarConsumption,
          kiteCarCost: reportData.kiteCarCost,
          consumptionGasValue: reportData.consumptionGasValue,
          totalGasValue: reportData.totalGasValue,
          dealershipReadingId: reportData.dealershipReadingId!,
          apartmentId: reportData.apartmentId!,
          lastReadingId: reportData.lastReadingId,
          utilityType: utilityType,
          // desnormalizados (coletar do apartamento):
          blockId: apartmentMeta.blockId,
          complexId: apartmentMeta.block?.complexId,
          companyId: apartmentMeta.block?.complex?.companyId,
          createdByUserId: userId,
          deletedAt: null
        });
        if (!existingReportIndex.has(baseKey)) {
          existingReportIndex.set(baseKey, new Map());
        }
        existingReportIndex.get(baseKey)!.set(utilitySpecificKey ?? null, newId);
      }
    }

    // ===== EXECUTAR ESCRITAS =====
    // Soft-delete existentes quando policy = replace
    if (toSoftDeleteReadingIds.length > 0) {
      try {
        console.time("⏱️ Soft delete existing readings");
        await prisma.reading.updateMany({
          where: { id: { in: toSoftDeleteReadingIds } },
          data: { deletedAt: new Date(), updatedByUserId: userId, updatedAt: new Date() }
        });
        console.timeEnd("⏱️ Soft delete existing readings");
      } catch (error) {
        result.errors.push({ row: 0, type: 'reading', message: `Falha ao substituir leituras existentes: ${error instanceof Error ? error.message : 'Erro desconhecido'}` });
      }
    }
    // Leituras
    if (newReadingCandidates.length > 0) {
      try {
        console.time("⏱️ Create new readings");
        await prisma.reading.createMany({ data: newReadingCandidates.map(rc => rc.data) });
        result.readingsCreated = newReadingCandidates.length;
        console.timeEnd("⏱️ Create new readings");
      } catch (error) {
        result.errors.push({
          row: 0,
          type: 'reading',
          message: `Falha em createMany de leituras: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        });
      }
    }

    // Relatórios - creates
    if (reportCreates.length > 0) {
      try {
        console.time("⏱️ Create new reports");
        await prisma.apartmentConsumptionReport.createMany({ data: reportCreates });
        result.reportsCreated = reportCreates.length;
        console.timeEnd("⏱️ Create new reports");
      } catch (error) {
        result.errors.push({
          row: 0,
          type: 'report',
          message: `Falha em createMany de relatórios: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        });
      }
    }

    if (reportUpdates.length > 0) {
      console.time("⏱️ Update reports (bulk)");
      const bulkUpdates = reportUpdates.map(upd => {
        const sanitized = sanitizeUpdateData(upd.data);
        const sanitizedWithoutUpdatedAt = { ...sanitized };
        delete sanitizedWithoutUpdatedAt.updatedAt;

        const stages: Record<string, any>[] = [];
        if (Object.keys(sanitizedWithoutUpdatedAt).length > 0) {
          stages.push({ $set: sanitizedWithoutUpdatedAt });
        }
        stages.push({ $set: { updatedAt: "$$NOW" } });

        return {
          q: { _id: upd.id },
          u: stages,
          upsert: false
        };
      });

      try {
        const bulkRes: any = await prisma.$runCommandRaw({
          update: 'ApartmentConsumptionReports',
          ordered: false,
          updates: bulkUpdates
        });
        console.timeEnd("⏱️ Update reports (bulk)");

        const writeErrors: any[] = Array.isArray(bulkRes?.writeErrors) ? bulkRes.writeErrors : [];
        const failedIndexes = new Set<number>();
        let successCount = reportUpdates.length;

        if (writeErrors.length > 0) {
          successCount -= writeErrors.length;
          for (const err of writeErrors) {
            const idx = typeof err?.index === 'number' ? err.index : -1;
            if (idx < 0 || idx >= reportUpdates.length) {
              result.errors.push({
                row: 0,
                type: 'report',
                message: `Erro em bulk update de relatório: ${err?.errmsg || err?.code || 'desconhecido'}`
              });
              continue;
            }
            failedIndexes.add(idx);
            const upd = reportUpdates[idx];
            try {
              await prisma.apartmentConsumptionReport.update({ where: { id: upd.id }, data: upd.data });
              successCount += 1;
            } catch (fallbackError) {
              result.errors.push({
                row: upd.lineNumber,
                type: 'report',
                message: `Erro update relatório: ${fallbackError instanceof Error ? fallbackError.message : 'desconhecido'}`
              });
            }
          }
        }

        result.reportsUpdated = successCount;
      } catch (error) {
        console.timeEnd("⏱️ Update reports (bulk)");
        let updatesOk = 0;
        for (const upd of reportUpdates) {
          try {
            await prisma.apartmentConsumptionReport.update({ where: { id: upd.id }, data: upd.data });
            updatesOk++;
          } catch (fallbackError) {
            result.errors.push({
              row: upd.lineNumber,
              type: 'report',
              message: `Erro update relatório: ${fallbackError instanceof Error ? fallbackError.message : 'desconhecido'}`
            });
          }
        }
        result.reportsUpdated = updatesOk;
      }
    }

    // Contar linkedReports (reports criados + atualizados com lastReadingId)
    const linkedFromCreates = reportCreates.filter(r => r.lastReadingId).length;
    const linkedFromUpdates = reportUpdates.filter(r => (r.data as any).lastReadingId).length;
    result.linkedReports = linkedFromCreates + linkedFromUpdates;

    // Sucesso se algo foi criado ou atualizado
    result.success = (result.readingsCreated + result.reportsCreated + result.reportsUpdated) > 0;

    // ── Trigger: criar EmailJobs para envio automático de filipetas ────────────
    if (dealershipReadingId && result.success && process.env.ZOHO_SMTP_USER) {
      try {
        await createEmailJobsForDealershipReading(dealershipReadingId, userId);
        console.log(`[Combined Import] EmailJobs criados para dealershipReading: ${dealershipReadingId}`);
      } catch (emailErr: any) {
        console.error('[Combined Import] Erro ao criar EmailJobs:', emailErr?.message);
      }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Erro na importação combinada:", error);
    return NextResponse.json(
      { 
        message: "Erro interno do servidor",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      },
      { status: 500 }
    );
  }
}
