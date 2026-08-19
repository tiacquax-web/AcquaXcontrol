// app/api/meter-report/route.ts
// Retorna filipeta data agregada por mês/ano/condomínio (sem precisar do dealershipReadingId)
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

function getPreviousMonths(year: number, month: number, count: number) {
  const date = new Date(year, month - 1, 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    date.setMonth(date.getMonth() - 1);
    result.push({
      yearRef: String(date.getFullYear()),
      monthRef: String(date.getMonth() + 1).padStart(2, '0'),
    });
  }
  return result;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const monthRef = req.nextUrl.searchParams.get('month') || '';
    const yearRef = req.nextUrl.searchParams.get('year') || '';
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined;
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined;
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined;
    const utilityType = req.nextUrl.searchParams.get('utility_type') || undefined;

    if (!monthRef || !yearRef) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    // Determinar contexto do usuário (morador vs admin)
    const contexts = await getUserContextsForActionOnEntity(userId, 'apartmentConsumptionReport', 'read');
    
    // Admin se tiver permissão de sistema, empresa, condomínio ou bloco
    const isSystem = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0 || contexts.blockIds.length > 0;
    const userApartmentIds = contexts.apartmentIds;

    // Se for um teste de preview (IDs começando com preview-), simulamos sucesso se for admin
    const isPreviewApt = apartmentId?.startsWith('preview-');
    if (isPreviewApt && isSystem) {
        return NextResponse.json({
            list: [{
                id: 'preview-report',
                monthRef: monthRef.padStart(2, '0'),
                yearRef,
                consumption: 12.5,
                totalUnit: 150.0,
                partial: 1.0,
                apartmentId: 'preview-apt',
                complexId: 'preview-complex',
                utilityType: 'Agua',
                apartment: {
                    id: 'preview-apt',
                    name: '101',
                    block: {
                        id: 'preview-block',
                        name: 'Bloco A',
                        complex: {
                            id: 'preview-complex',
                            socialName: 'Condomínio Preview',
                            aliasName: 'Preview',
                            company: { id: 'preview-co', name: 'AcquaX', socialName: 'AcquaX' }
                        }
                    }
                },
                lastReading: {
                    id: 'preview-reading',
                    reading: 123.456,
                    readAtDate: new Date().toISOString().split('T')[0],
                    nextReadingDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
                },
                history: [],
                dealershipReading: null
            }],
            totalCount: 1,
            dealershipReadings: []
        });
    }

    // Build where clause for reports
    const where: any = {
      monthRef: monthRef.padStart(2, '0'),
      yearRef,
      utilityType: utilityType || undefined,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    };

    if (complexId) {
      where.complexId = complexId;
    }

    if (blockId) {
      where.blockId = blockId;
    }

    if (apartmentId) {
      where.apartmentId = apartmentId;
    } else if (!isSystem && userApartmentIds.length > 0) {
      // Morador: filtra apenas seus apartamentos
      where.apartmentId = { in: userApartmentIds };
    } else if (!isSystem && userApartmentIds.length === 0) {
      return NextResponse.json({ list: [], totalCount: 0, dealershipReadings: [] });
    }

    const currentReports = await prisma.apartmentConsumptionReport.findMany({
      where,
      select: {
        id: true,
        monthRef: true,
        yearRef: true,
        consumption: true,
        totalUnit: true,
        partial: true,
        apartmentId: true,
        complexId: true,
        dealershipReadingId: true,
        utilityType: true,
        apartment: {
          select: {
            id: true,
            name: true,
            block: {
              select: {
                id: true,
                name: true,
                complex: {
                  select: {
                    id: true,
                    socialName: true,
                    aliasName: true,
                    street: true,
                    number: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    zipcode: true,
                    company: { select: { id: true, socialName: true, name: true } },
                  },
                },
              },
            },
          },
        },
        lastReading: {
          select: {
            id: true,
            reading: true,
            readAt: true,
            readAtDate: true,
            nextReadingDate: true,
            readingDate: true,
            readingDateNext: true,
            urlCover: true,
            registerName: true,
          },
        },
      },
      orderBy: [{ complexId: 'asc' }],
    });

    if (currentReports.length === 0) {
      return NextResponse.json({ list: [], totalCount: 0, dealershipReadings: [] });
    }

    // Sort by block name then apartment name
    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    currentReports.sort((a, b) => {
      const blockA = (a.apartment as any)?.block?.name || '';
      const blockB = (b.apartment as any)?.block?.name || '';
      const apartA = (a.apartment as any)?.name || '';
      const apartB = (b.apartment as any)?.name || '';
      const bc = collator.compare(blockA, blockB);
      return bc !== 0 ? bc : collator.compare(apartA, apartB);
    });

    // Fetch dealership readings for this month/year/complex to get billing info
    const drWhere: any = {
      monthRef: monthRef.padStart(2, '0'),
      yearRef,
      type: utilityType || undefined,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    };
    if (complexId) drWhere.complexId = complexId;

    const dealershipReadings = await prisma.dealershipReading.findMany({
      where: drWhere,
      select: {
        id: true,
        type: true,
        complexId: true,
        monthRef: true,
        yearRef: true,
        readingDate: true,
        readingDateNext: true,
        totalDays: true,
        diffCost: true,
        totalValue: true,
        dealershipConsumption: true,
        monthlyConsumption: true,
        complex: { select: { id: true, socialName: true, aliasName: true, company: { select: { id: true, socialName: true, name: true } } } },
        dealership: { select: { id: true, name: true, service: true } },
      },
    });

    // Index dealership readings by id for quick lookup
    const drById: Record<string, any> = {};
    dealershipReadings.forEach(dr => { drById[dr.id] = dr; });

    // Relatórios antigos/importados podem não guardar dealershipReadingId,
    // mas ainda pertencem ao mesmo ciclo do condomínio. Nesses casos, use a
    // DealershipReading do mês/ano/complexo (e, quando disponível, do mesmo
    // tipo de utilitário) para manter as datas de leitura no payload.
    const dealershipReadingsByKey: Record<string, any[]> = {};
    dealershipReadings.forEach(dr => {
      const key = `${dr.complexId}|${dr.monthRef}|${dr.yearRef}`;
      if (!dealershipReadingsByKey[key]) dealershipReadingsByKey[key] = [];
      dealershipReadingsByKey[key].push(dr);
    });

    const resolveDealershipReading = (report: any) => {
      if (report.dealershipReadingId && drById[report.dealershipReadingId]) {
        return drById[report.dealershipReadingId];
      }
      const key = `${report.complexId || complexId || ''}|${report.monthRef}|${report.yearRef}`;
      const candidates = dealershipReadingsByKey[key] || [];
      return candidates.find(dr => !report.utilityType || dr.type === report.utilityType) || candidates[0] || null;
    };

    // Historical data
    const apartmentIds = [...new Set(currentReports.map(r => r.apartmentId))];
    const firstReport = currentReports[0];
    const previousMonthRefs = getPreviousMonths(Number(firstReport.yearRef), Number(firstReport.monthRef), 3);

    const historicalReports = await prisma.apartmentConsumptionReport.findMany({
      where: {
        apartmentId: { in: apartmentIds },
        OR: [
          ...previousMonthRefs.map(ref => ({ monthRef: ref.monthRef, yearRef: ref.yearRef })),
        ],
        AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
      },
      select: {
        id: true,
        apartmentId: true,
        monthRef: true,
        yearRef: true,
        consumption: true,
        lastReading: { select: { reading: true, readAtDate: true } },
      },
      orderBy: { yearRef: 'desc' },
    });

    const historicalByApartment: Record<string, any[]> = {};
    historicalReports.forEach(r => {
      if (!historicalByApartment[r.apartmentId]) historicalByApartment[r.apartmentId] = [];
      historicalByApartment[r.apartmentId].push(r);
    });

    // Sort historical descending
    Object.values(historicalByApartment).forEach(arr =>
      arr.sort((a, b) => {
        const da = new Date(Number(a.yearRef), Number(a.monthRef) - 1);
        const db = new Date(Number(b.yearRef), Number(b.monthRef) - 1);
        return db.getTime() - da.getTime();
      })
    );

    // Alguns relatórios importados não possuem lastReadingId, embora a leitura
    // do apartamento exista na coleção Readings. A Filipeta já usa este fallback;
    // o endpoint agregado precisa fazer o mesmo para não devolver datas pendentes.
    const reportsWithoutLastReading = currentReports.filter(r => {
      const reading: any = r.lastReading;
      return !reading || !(reading.readAtDate || reading.readingDate || reading.readAt);
    });
    const fallbackReadingsByApartment: Record<string, any> = {};

    if (reportsWithoutLastReading.length > 0) {
      const fallbackReadings = await prisma.reading.findMany({
        where: {
          apartmentId: { in: reportsWithoutLastReading.map(r => r.apartmentId) },
          monthRef: monthRef.padStart(2, '0'),
          yearRef,
          OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        orderBy: { readAt: 'desc' },
        select: {
          id: true,
          apartmentId: true,
          reading: true,
          readAt: true,
          readAtDate: true,
          monthRef: true,
          yearRef: true,
          meterId: true,
          isManualReading: true,
          isPreReading: true,
          registerName: true,
          nextReadingDate: true,
          readingDate: true,
          readingDateNext: true,
        },
      });

      // Como a consulta está ordenada pela leitura mais recente, manter apenas
      // a primeira por apartamento reproduz o comportamento da Filipeta.
      for (const reading of fallbackReadings) {
        if (!fallbackReadingsByApartment[reading.apartmentId!]) {
          fallbackReadingsByApartment[reading.apartmentId!] = reading;
        }
      }

      // Alguns legados não guardam o mês/ano na leitura vinculada. Se o
      // fallback do período não encontrou data, usa a leitura mais recente da
      // unidade para não deixar o Levantamento preso em "ref. pend.".
      const missingApartmentIds = reportsWithoutLastReading
        .map(r => r.apartmentId)
        .filter(apartmentId => !fallbackReadingsByApartment[apartmentId]);

      if (missingApartmentIds.length > 0) {
        const latestReadings = await prisma.reading.findMany({
          where: {
            apartmentId: { in: missingApartmentIds },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
          },
          orderBy: { readAt: 'desc' },
          select: {
            id: true,
            apartmentId: true,
            reading: true,
            readAt: true,
            readAtDate: true,
            nextReadingDate: true,
            readingDate: true,
            readingDateNext: true,
            urlCover: true,
            registerName: true,
          },
        });

        for (const reading of latestReadings) {
          if (reading.apartmentId && !fallbackReadingsByApartment[reading.apartmentId]) {
            fallbackReadingsByApartment[reading.apartmentId] = reading;
          }
        }
      }
    }

    const enrichedReports = currentReports.map(r => {
      // Usa a leitura vinculada ao relatório; quando o vínculo não existe,
      // usa a leitura mais recente do mesmo apartamento e período.
      const linkedReading: any = r.lastReading;
      const linkedHasDate = !!(linkedReading?.readAtDate || linkedReading?.readingDate || linkedReading?.readAt);
      let lastReading: any = linkedHasDate
        ? linkedReading
        : fallbackReadingsByApartment[r.apartmentId] ?? linkedReading ?? null;

      // Normaliza campos legados para que o frontend possa usar a mesma fonte
      // independentemente de a leitura ter vindo do vínculo ou do fallback.
      if (lastReading) {
        lastReading = {
          ...lastReading,
          readAtDate: lastReading.readAtDate || lastReading.readingDate || (lastReading.readAt ? new Date(lastReading.readAt).toISOString() : null),
          readingDate: lastReading.readingDate || lastReading.readAtDate || null,
          readingDateNext: lastReading.readingDateNext || lastReading.nextReadingDate || null,
          nextReadingDate: lastReading.nextReadingDate || lastReading.readingDateNext || null,
        };
      }

      // Converte coverBase64 (Buffer) para data URL se não houver urlCover
      if (lastReading) {
        if (!lastReading.urlCover && lastReading.coverBase64) {
          try {
            const b64 = Buffer.isBuffer(lastReading.coverBase64)
              ? lastReading.coverBase64.toString('base64')
              : Buffer.from(lastReading.coverBase64).toString('base64');
            lastReading = {
              ...lastReading,
              urlCover: `data:image/jpeg;base64,${b64}`,
              coverBase64: undefined, // não enviar bytes ao frontend
            };
          } catch (_) {
            // fallback: mantém sem foto
          }
        } else {
          // Remove coverBase64 da resposta para não pesar o JSON
          const { coverBase64, ...rest } = lastReading as any;
          lastReading = rest;
        }
      }
      return {
        ...r,
        lastReading,
        history: historicalByApartment[r.apartmentId] || [],
        dealershipReading: resolveDealershipReading(r),
      };
    });

    return NextResponse.json({
      list: enrichedReports,
      totalCount: enrichedReports.length,
      dealershipReadings,
    });
  } catch (e: any) {
    console.error('[API meter-report]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
