import { cleanEntityBody } from "@/lib/prisma"
import { createEntity, deleteEntity, getEntityListData, updateEntityData, bulkCreateEntity } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType, Reading } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const readingId = req.nextUrl.searchParams.get('id') || undefined
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const meterId = req.nextUrl.searchParams.get('meter_id') || undefined
    const isPreReading = req.nextUrl.searchParams.get('is_pre_reading') || undefined
    const withDevice = req.nextUrl.searchParams.get('with_device') || undefined
    const withMeter = req.nextUrl.searchParams.get('with_meter') || undefined
    const withBlock = req.nextUrl.searchParams.get('with_block') || undefined
    const withApartment = req.nextUrl.searchParams.get('with_apartment') || undefined
    const withComplex = req.nextUrl.searchParams.get('with_complex') || undefined
    const fromDate = req.nextUrl.searchParams.get('from_date') || undefined
    const toDate = req.nextUrl.searchParams.get('to_date') || undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('order_by') || 'createdAt'
    const orderDirection: 'asc' | 'desc' = req.nextUrl.searchParams.get('order_direction') || req.nextUrl.searchParams.get('order_by') ? 'asc' : 'desc'

    return { withApartment, withBlock, withComplex, fromDate, toDate, withDevice, withMeter, isPreReading, readingId, meterId, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // get query params
        const { withApartment, withBlock, withComplex, fromDate, toDate, withDevice, withMeter, isPreReading, readingId, meterId, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType: ContextType | undefined = apartmentId ? 'apartment' : blockId ? 'block' : complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'apartment' ? apartmentId : contextType === 'block' ? blockId : contextType === 'complex' ? complexId : contextType === 'company' ? companyId : undefined

        console.log('Context Type:', contextType)
        console.log('Context ID:', contextId)

        const where = {
            isPreReading: isPreReading === 'true' ? true : isPreReading === 'false' ? false : undefined,
            id: readingId || undefined,
            meterId: meterId || undefined,
            companyId: companyId || undefined,
            complexId: complexId || undefined,
            blockId: blockId || undefined,
            apartmentId: apartmentId || undefined,
            readAt: {
                gte: fromDate ? new Date(fromDate) : undefined,
                lte: toDate ? new Date(toDate) : undefined,
            },
        }

        const include = {
            device: withDevice ? {
                select: {
                    id: true,
                    deviceId: true,
                    remoteId: true,
                    lastReading: true,
                    lastSeen: true,
                }
            } : undefined,
            meter: withMeter ? {
                select: {
                    id: true,
                    register: true,
                    typeMeterId: true,
                    apartment: withApartment ? {
                        select: {
                            id: true,
                            name: true,
                            block: withBlock ? {
                                select: {
                                    id: true,
                                    name: true,
                                    complex: withComplex ? {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    } : undefined,
                                }
                            } : undefined,
                        }
                    } : undefined,
                },
            } : undefined
        }

        // get readings
        const { entity, totalCount, error, status } = await getEntityListData(userId, 'reading', contextType, contextId, search, where, take, include, skip, orderBy, orderDirection)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'No readings found.' }, { status: 404 })

        return NextResponse.json({ list: entity, totalCount }, { status: 200 })

    } catch (error: any) {
        console.error("Error fetching readings:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

interface ImportContext {
    apartmentId?: string
    blockId?: string
    complexId?: string
    companyId?: string
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        console.log("1");
        // Detecta importação em lote (array de leituras)
        if (Array.isArray(body.rows) && body.rows.length > 0) {
            const allowUpdates = body.allowUpdates === true || body.allowUpdates === 'true';
            const context: ImportContext | undefined = (body.apartmentId || body.blockId || body.complexId || body.companyId) ? {
                apartmentId: body.apartmentId,
                blockId: body.blockId,
                complexId: body.complexId,
                companyId: body.companyId,
            } : undefined;
            const result = await importReadingsBulk(userId, body.rows, allowUpdates, context);
            console.log("2");
            if (result.errors.length > 0) {
                return NextResponse.json({ created: result.created, updated: result.updated, errors: result.errors }, { status: 400 });
            }
            if (result.generalError) {
                return NextResponse.json({ created: 0, updated: 0, errors: [], generalError: result.generalError }, { status: 500 });
            }
            console.log("3");
            return NextResponse.json({ created: result.created, updated: result.updated }, { status: 200 });
        } else if (Array.isArray(body.rows) && body.rows.length === 0) {
            // Se for um array vazio, retorna erro
            console.log("4");
            return NextResponse.json({ error: 'A planilha parece estar vazia.' }, { status: 400 });
        }

        console.log("Creating reading with body:");

        // Validando campos obrigatórios
        if (!body.meterId) return NextResponse.json({ error: 'O campo meterId é obrigatório.' }, { status: 400 });
        if (!body.coverBase64) return NextResponse.json({ error: 'O campo coverBase64 é obrigatório.' }, { status: 400 });
        if (!body.registerName) return NextResponse.json({ error: 'O campo registerName é obrigatório.' }, { status: 400 });

        // Valores padrões ao criar uma leitura

        const currentMonthPT = new Date().toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase());
        const currentYear = new Date().getFullYear();

        // validate coverBase64
        const coverBase64 = body.coverBase64;
        if (!coverBase64.match(/^data:?image\/(jpeg|jpg|png);?base64,?/)) {
            return NextResponse.json({ error: 'Invalid coverBase64' }, { status: 400 });
        }

        const base64Data = coverBase64.replace(/^.*(?=\/9j\/)/, ''); // Remove everything before "/9j/"
        const buffer = Buffer.from(base64Data, 'base64');

        const readingToSave: Partial<Reading> = {
            coverBase64: buffer,
            monthRef: currentMonthPT,
            yearRef: currentYear.toString(),
            meterId: body.meterId,
            isPreReading: true,
            isManualReading: body.isManualReading || false,
            deletedAt: null,
            registerName: body.registerName,
            readAt: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })),
            readAtDate: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toISOString().split('T')[0], // Format to YYYY-MM-DD
        }

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'reading', readingToSave);

        // Error handling
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating meter:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Função utilitária otimizada para validar e classificar linhas de leitura em lote
async function validateReadingsRows(readings: any[], allowUpdates: boolean = false, context?: ImportContext): Promise<{ validRows: any[], updateRows: any[], errors: any[] }> {
    const errors: any[] = [];
    const validRows: any[] = [];
    const updateRows: any[] = [];
    if (!readings || readings.length === 0) return { validRows, updateRows, errors };

    // Passo 1: pré-validação e coleta de registers
    const prelim: { row: any; rowNum: number; registerName: string }[] = [];
    const registers = new Set<string>();
    for (let i = 0; i < readings.length; i++) {
        const row = readings[i];
        const rowNum = i + 2; // 1 para header + 1 baseado em 1
        const required = ['chassi', 'leitura', 'mes_ref', 'ano_ref', 'data_leitura', 'pre_leitura'];
        const missing = required.filter(f => row[f] === null || row[f] === undefined || String(row[f]).trim() === '');
        if (missing.length) {
            errors.push({ row: rowNum, message: `Campos obrigatórios não informados: ${missing.join(', ')}` });
            continue;
        }
        const registerName = (row.chassi || row.registerName || '').toString().trim();
        if (!registerName) {
            errors.push({ row: rowNum, message: 'Chassi (register) não informado.' });
            continue;
        }
        registers.add(registerName);
        prelim.push({ row, rowNum, registerName });
    }
    if (prelim.length === 0) return { validRows, updateRows, errors };

    // Passo 2: buscar meters para os registers
    const meterWhere: any = { register: { in: Array.from(registers) }, deletedAt: null };
    if (context?.apartmentId) meterWhere.apartmentId = context.apartmentId;
    else if (context?.blockId) meterWhere.blockId = context.blockId;
    else if (context?.complexId) meterWhere.complexId = context.complexId;
    else if (context?.companyId) meterWhere.companyId = context.companyId;

    const meters = await prisma.meter.findMany({
        where: meterWhere,
        select: { id: true, register: true }
    });
    const meterMap = new Map(meters.map(m => [m.register, m.id]));

    // Passo 3: normalizar e preparar chaves (meterId + mês + ano)
    interface NormRow { key: string; meterId: string; monthRef: string; yearRef: string; registerName: string; rowNum: number; data: any }
    const normRows: NormRow[] = [];
    const monthSet = new Set<string>();
    const yearSet = new Set<string>();
    const comboSet = new Set<string>();

    function parseDateFlexible(input: string | number | undefined | null): Date | undefined {
        if (input === undefined || input === null || input === '') return undefined;

        // Detect Excel serial numeric date (e.g., 45875) possibly passed as number or numeric string.
        // Excel (Windows) date system base: 1899-12-30 (accounts for the 1900 leap year bug).
        const isNumericSerial = (val: any) => {
            if (typeof val === 'number' && Number.isFinite(val)) return true;
            if (typeof val === 'string' && /^\d+$/.test(val)) return true;
            return false;
        };
        if (isNumericSerial(input)) {
            const serial = typeof input === 'number' ? input : parseInt(String(input), 10);
            // Filter plausible date range (roughly between years ~1955 and ~2145)
            if (serial > 20000 && serial < 90000) {
                const excelEpoch = new Date(1899, 11, 30); // 1899-12-30 local time
                const d = new Date(excelEpoch.getTime() + serial * 86400000);
                d.setHours(12, 0, 0, 0); // Force 12:00 local to avoid TZ midnight shifts
                return isNaN(d.getTime()) ? undefined : d;
            }
        }

        let s = String(input).trim();
        const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/; // dd/MM/yyyy[ HH:mm]
        const m = br.exec(s);
        if (m) {
            const dd = m[1]; const mm = m[2]; const yy = m[3];
            const hh = m[4] || '12'; const min = m[5] || '00';
            s = `${yy}-${mm}-${dd}T${hh}:${min}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            s = s + 'T12:00';
        } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
            s = s.replace(' ', 'T');
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? undefined : d;
    }

    for (const p of prelim) {
        const meterId = meterMap.get(p.registerName);
        if (!meterId) {
            errors.push({ row: p.rowNum, message: `Medidor (chassi) não encontrado: ${p.registerName}` });
            continue;
        }
        const monthRef = (p.row.mes_ref || p.row.monthRef || '').toString().trim();
        const yearRef = (p.row.ano_ref || p.row.yearRef || '').toString().trim();
        if (!monthRef || !yearRef) {
            errors.push({ row: p.rowNum, message: 'Mês/Ano de referência inválidos.' });
            continue;
        }
        monthSet.add(monthRef); yearSet.add(yearRef);
        const key = `${meterId}::${monthRef}::${yearRef}`;
        const readAtDateRaw = p.row.data_leitura || p.row.readAtDate;
        // console.warn(`Raw readAtDate: "${p.row.data_leitura}"`);
        const readAt = parseDateFlexible(readAtDateRaw || '');
        // Se a data não pôde ser parseada, reportar como erro de linha e pular
        if (!readAt) {
            errors.push({ row: p.rowNum, message: `Data de leitura inválida ou não reconhecida: ${readAtDateRaw}` });
            continue;
        }
        // Normaliza readAtDate sempre a partir de readAt (YYYY-MM-DD)
        const readAtDateNormalized = readAt.toISOString().slice(0, 10);
        const nextReadingDateRaw = p.row.prox_leitura ?? p.row.nextReadingDate;
        let nextReadingDateNormalized: string | null | undefined = undefined;
        if (nextReadingDateRaw !== undefined && nextReadingDateRaw !== null) {
            const nextRawTrimmed = String(nextReadingDateRaw).trim();
            if (nextRawTrimmed === '') {
                nextReadingDateNormalized = null; // sinaliza limpeza
            } else {
                const nextReadingDateParsed = parseDateFlexible(nextReadingDateRaw);
                if (!nextReadingDateParsed) {
                    errors.push({ row: p.rowNum, message: `Data da próxima leitura inválida ou não reconhecida: ${nextReadingDateRaw}` });
                    continue;
                }
                nextReadingDateNormalized = nextReadingDateParsed.toISOString().slice(0, 10);
            }
        }
        const readingVal = p.row.leitura !== undefined && p.row.leitura !== '' ? parseFloat(p.row.leitura) : (p.row.reading !== undefined && p.row.reading !== '' ? parseFloat(p.row.reading) : undefined);
        normRows.push({
            key,
            meterId,
            monthRef,
            yearRef,
            registerName: p.registerName,
            rowNum: p.rowNum,
            data: {
                registerName: p.registerName,
                reading: readingVal,
                monthRef,
                yearRef,
                nextReadingDate: nextReadingDateNormalized,
                urlCover: (p.row.foto && String(p.row.foto).trim() !== '') ? p.row.foto : (p.row.urlCover && String(p.row.urlCover).trim() !== '' ? p.row.urlCover : undefined),
                readAt,
                readAtDate: readAtDateNormalized,
                isPreReading: p.row.pre_leitura === 'Sim' || p.row.isPreReading === true || p.row.isPreReading === 'true',
                isManualReading: true,
                meterId,
                deletedAt: null,
            }
        });
        comboSet.add(key);
    }
    if (normRows.length === 0) return { validRows, updateRows, errors };

    // Passo 4: buscar leituras existentes (apenas um query grande)
    const existing = await prisma.reading.findMany({
        where: {
            deletedAt: null,
            meterId: { in: Array.from(new Set(normRows.map(r => r.meterId))) },
            monthRef: { in: Array.from(monthSet) },
            yearRef: { in: Array.from(yearSet) }
        },
        select: { id: true, meterId: true, monthRef: true, yearRef: true }
    });
    // Mapear usando chave simples string para evitar inferência complexa de template literal
    const existingMap: Map<string, string> = new Map(existing.map(e => [`${e.meterId}::${e.monthRef}::${e.yearRef}`, e.id]));

    // Passo 5: classificar
    for (const r of normRows) {
        const existingId = existingMap.get(r.key);
        if (existingId) {
            if (allowUpdates) {
                updateRows.push({ ...r.data, existingReadingId: existingId });
            } else {
                errors.push({ row: r.rowNum, message: `Leitura duplicada para ${r.registerName} (${r.monthRef}/${r.yearRef}).` });
            }
        } else {
            validRows.push(r.data);
        }
    }
    return { validRows, updateRows, errors };
}

// Importa várias leituras em lote (otimizado)
async function importReadingsBulk(userId: string, readings: any[], allowUpdates: boolean = false, context?: ImportContext): Promise<{ created: number, updated: number, errors: any[], generalError?: string }> {
    const { validRows, updateRows, errors } = await validateReadingsRows(readings, allowUpdates, context);
    if (errors.length > 0) return { created: 0, updated: 0, errors };

    let createdCount = 0;
    let updatedCount = 0;
    const updateErrors: any[] = [];

    // Criação em lote
    if (validRows.length > 0) {
        const { entity, error: bulkError } = await bulkCreateEntity(userId, 'reading', validRows);
        if (bulkError || !entity) {
            updateErrors.push({ message: bulkError || 'Erro ao criar leituras em lote.' });
        } else {
            createdCount = validRows.length;
        }
    }

    // Atualizações: caminho otimizado (raw bulk) quando apenas updates e volume grande
    if (updateRows.length > 0) {
        const ONLY_UPDATES = validRows.length === 0;
        const RAW_THRESHOLD = 80; // a partir desse volume vale usar bulk raw
        if (ONLY_UPDATES && updateRows.length >= RAW_THRESHOLD) {
            try {
                // Montar payload para comando MongoDB "update" (coleção mapeada "Readings")
                const updates = updateRows.map((r) => {
                    const readAtIso = new Date(r.readAt).toISOString(); // sempre ISO string

                    // monta $set com conversões no servidor
                    const setStage: any = {
                        $set: {
                        monthRef: r.monthRef,
                        yearRef: r.yearRef,
                        isPreReading: r.isPreReading,
                        isManualReading: true,
                        registerName: r.registerName,

                        // força Date no servidor
                        readAt: { $toDate: readAtIso },

                        // string YYYY-MM-DD derivada do readAt (ajuste timezone se precisar)
                        readAtDate: {
                            $dateToString: {
                            date: { $toDate: readAtIso },
                            format: "%Y-%m-%d",
                            timezone: "America/Sao_Paulo"
                            }
                        },

                        // updatedAt correto, tipo Date, no servidor
                        updatedAt: "$$NOW",
                        }
                    };

                    if (r.reading !== undefined) setStage.$set.reading = r.reading;
                    if (r.nextReadingDate !== undefined) {
                        setStage.$set.nextReadingDate = r.nextReadingDate === null ? null : String(r.nextReadingDate);
                    }
                    if (r.urlCover) setStage.$set.urlCover = r.urlCover;

                    return {
                        q: { _id: r.existingReadingId }, // _id é UUID string
                        u: [ setStage ],                  // <<< pipeline update
                        upsert: false
                    };
                    });

                const bulkResult: any = await prisma.$runCommandRaw({
                    update: 'Readings',
                    ordered: false,
                    updates
                });

                // Mongo response fields variam. Tentamos inferir modificados.
                const modified = bulkResult?.nModified ?? bulkResult?.n ?? updateRows.length;
                updatedCount = modified;
                if (modified < updateRows.length) {
                    updateErrors.push({ message: `Nem todas as leituras foram atualizadas: esperadas ${updateRows.length}, modificadas ${modified}.` });
                }
            } catch (err: any) {
                updateErrors.push({ message: `Falha no bulk raw update: ${err.message || err}` });
                // Fallback: chunk transacional padrão
                const chunkSize = 50;
                for (let i = 0; i < updateRows.length; i += chunkSize) {
                    const slice = updateRows.slice(i, i + chunkSize);
                    try {
                        await prisma.$transaction(slice.map(r => {
                            const data: any = { ...r };
                            delete data.existingReadingId;
                            if (data.urlCover === undefined) delete data.urlCover;
                            let readAtVal = data.readAt;
                            if (readAtVal) readAtVal = (readAtVal instanceof Date) ? readAtVal : new Date(readAtVal);
                            let readAtDateStr = data.readAtDate;
                            if (readAtVal && (!readAtDateStr || typeof readAtDateStr !== 'string')) readAtDateStr = readAtVal.toISOString().slice(0,10);
                            if (readAtDateStr && readAtDateStr.length > 10) readAtDateStr = readAtDateStr.slice(0,10);
                            return prisma.reading.update({
                                where: { id: r.existingReadingId },
                                data: {
                                    reading: data.reading,
                                    monthRef: data.monthRef,
                                    yearRef: data.yearRef,
                                    nextReadingDate: data.nextReadingDate === undefined ? undefined : data.nextReadingDate,
                                    readAt: readAtVal || undefined,
                                    readAtDate: readAtDateStr || undefined,
                                    isPreReading: data.isPreReading,
                                    isManualReading: true,
                                    ...(data.urlCover ? { urlCover: data.urlCover } : {}),
                                    registerName: data.registerName,
                                }
                            });
                        }));
                        updatedCount += slice.length;
                    } catch (err2: any) {
                        updateErrors.push({ message: `Erro em lote de fallback (${i + 1}-${i + slice.length}): ${err2.message || err2}` });
                    }
                }
            }
        } else {
            // Caminho anterior (chunk transacional) para cenários mistos ou poucos updates
            const chunkSize = 50;
            for (let i = 0; i < updateRows.length; i += chunkSize) {
                const slice = updateRows.slice(i, i + chunkSize);
                try {
                    await prisma.$transaction(slice.map(r => {
                        const data: any = { ...r };
                        delete data.existingReadingId;
                        if (data.urlCover === undefined) delete data.urlCover;
                        let readAtVal = data.readAt;
                        if (readAtVal) readAtVal = (readAtVal instanceof Date) ? readAtVal : new Date(readAtVal);
                        let readAtDateStr = data.readAtDate;
                        if (readAtVal && (!readAtDateStr || typeof readAtDateStr !== 'string')) readAtDateStr = readAtVal.toISOString().slice(0,10);
                        if (readAtDateStr && readAtDateStr.length > 10) readAtDateStr = readAtDateStr.slice(0,10);
                        return prisma.reading.update({
                            where: { id: r.existingReadingId },
                            data: {
                                reading: data.reading,
                                monthRef: data.monthRef,
                                yearRef: data.yearRef,
                                    nextReadingDate: data.nextReadingDate === undefined ? undefined : data.nextReadingDate,
                                readAt: readAtVal || undefined,
                                readAtDate: readAtDateStr || undefined,
                                isPreReading: data.isPreReading,
                                isManualReading: true,
                                ...(data.urlCover ? { urlCover: data.urlCover } : {}),
                                registerName: data.registerName,
                            }
                        });
                    }));
                    updatedCount += slice.length;
                } catch (err: any) {
                    updateErrors.push({ message: `Erro em lote de atualização (${i + 1}-${i + slice.length}): ${err.message || err}` });
                }
            }
        }
    }

    if (updateErrors.length > 0) return { created: createdCount, updated: updatedCount, errors: updateErrors };
    return { created: createdCount, updated: updatedCount, errors: [] };
}