import prisma, { cleanEntityBody } from "@/lib/prisma"
import { createEntity, bulkCreateEntity, deleteEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { getUserContextsForActionOnEntity } from "@/lib/userContexts"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType, Meter } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
// Aumenta o timeout para 60s (Vercel Hobby permite até 60s)
export const maxDuration = 60;

interface ValidationResult {
    errors: Array<{ row: number; message: string }>;
    toCreate: Array<{ rowIndex: number; data: any }>;
    toUpdate: Array<{ rowIndex: number; data: any; existingId: string }>;
    toSkip: Array<{ rowIndex: number; reason: string }>;
}

interface ExecutionResult {
    errors: Array<{ row: number; message: string }>;
    created: any[];
    updated: any[];
}

async function validateMetersBatch(reqBody: any[]): Promise<ValidationResult> {
    const errors: Array<{ row: number; message: string }> = [];
    const toCreate: Array<{ rowIndex: number; data: any }> = [];
    const toUpdate: Array<{ rowIndex: number; data: any; existingId: string }> = [];
    const toSkip: Array<{ rowIndex: number; reason: string }> = [];    // Coleta todos os nomes de condomínio, bloco e tipo únicos
    const allCondominios: string[] = Array.from(new Set(reqBody.map((row: any) => (row.condominio || '').toLowerCase().trim())));
    const allBlocosPorCondominio: Record<string, Set<string>> = {};
    const allTypeMeters: string[] = Array.from(new Set(reqBody.map((row: any) => (row.tipo || '').toLowerCase().trim())));
    
    reqBody.forEach((row: any) => {
        const cond = (row.condominio || '').toLowerCase().trim();
        if (!allBlocosPorCondominio[cond]) allBlocosPorCondominio[cond] = new Set();
        if (row.bloco !== undefined && row.bloco !== null) allBlocosPorCondominio[cond].add(String(row.bloco).toLowerCase().trim());
    });

    // Busca todos os complexos necessários
    const complexList = await prisma.complex.findMany({
        where: { socialName: { in: allCondominios, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, socialName: true }
    })

    // Busca todos os blocos necessários
    let blocks: { id: string, name: string, complexId: string }[] = []
    // for (const complex of complexList) {
    //     const blocos = Array.from(allBlocosPorCondominio[complex.socialName.toLowerCase().trim()] || [])
    //     if (blocos.length > 0) {
    //         const foundBlocks = await prisma.block.findMany({
    //             where: {
    //                 name: { in: blocos, mode: 'insensitive' },
    //                 complexId: complex.id,
    //                 deletedAt: null
    //             },
    //             select: { id: true, name: true, complexId: true }
    //         })
    //         blocks = blocks.concat(foundBlocks)
    //     }
    // }

    const foundBlocks = await prisma.block.findMany({
        where: {
            name: { in: Object.values(allBlocosPorCondominio).map(set => Array.from(set)).flat(), mode: 'insensitive' },
            complex: { socialName: { in: allCondominios, mode: 'insensitive' } },
            deletedAt: null
        },
        select: { id: true, name: true, complexId: true }
    });

    blocks = foundBlocks;

    // Busca todos os typeMeters necessários
    const typeMeterList = await prisma.typeMeter.findMany({
        where: { name: { in: allTypeMeters, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, name: true }
    });
    
    // Buscando todos os apartments necessários
    let apartments: { id: string, name: string, blockId: string }[] = [];

    // Primeiro, vamos buscar todos os apartamentos únicos que precisamos por bloco
    const apartmentNamesByBlockId = new Map<string, Set<string>>();

    // Agora vamos agrupar por blockId real (não por chave textual)
    for (const [idx, row] of reqBody.entries()) {
        const rowCondominio = row.condominio !== undefined && row.condominio !== null ? String(row.condominio) : '';
        const rowBloco = row.bloco !== undefined && row.bloco !== null ? String(row.bloco) : '';
        const rowApartamento = row.apartamento !== undefined && row.apartamento !== null ? String(row.apartamento) : '';
        
        if (rowCondominio && rowBloco && rowApartamento) {
            // Encontra o complex e block correspondentes
            const complex = complexList.find(c => c.socialName.toLowerCase().trim() === rowCondominio.toLowerCase().trim());
            if (complex) {
                const block = blocks.find(b => b.name.toLowerCase().trim() === rowBloco.toLowerCase().trim() && b.complexId === complex.id);
                if (block) {
                    if (!apartmentNamesByBlockId.has(block.id)) {
                        apartmentNamesByBlockId.set(block.id, new Set());
                    }
                    apartmentNamesByBlockId.get(block.id)!.add(rowApartamento.toLowerCase().trim());
                }
            }
        }
    }

    // Agora busca os apartamentos por blockId
    for (const [blockId, apartmentNames] of apartmentNamesByBlockId.entries()) {
        if (apartmentNames.size > 0) {
            const foundApartments = await prisma.apartment.findMany({
                where: {
                    name: { in: Array.from(apartmentNames), mode: 'insensitive' },
                    blockId: blockId,
                    deletedAt: null
                },
                select: { id: true, name: true, blockId: true }
            });
            apartments = apartments.concat(foundApartments);
        }
    }


    // Verificação de registers (chassi) duplicados no próprio lote
    const registersMap = new Map<string, number>();
    for (const [idx, row] of reqBody.entries()) {
        const rowChassi = row.chassi !== undefined && row.chassi !== null ? String(row.chassi).toUpperCase().trim() : '';
        if (rowChassi) {
            if (registersMap.has(rowChassi)) {
                const firstRowIndex = registersMap.get(rowChassi)!;
                errors.push({ 
                    row: idx + 2, 
                    message: `Chassi '${row.chassi}' duplicado. Primeira ocorrência na linha ${firstRowIndex + 2}.` 
                });
            } else {
                registersMap.set(rowChassi, idx);
            }
        }
    }

    // Se há registers duplicados, retorna os erros
    if (errors.length > 0) {
        return { errors, toCreate, toUpdate, toSkip };
    }

    // Coleta todos os apartmentIds válidos para buscar medidores existentes
    const validMeterData: Array<{ register: string; apartmentId: string; rowIndex: number; data: any }> = [];

    // Primeira passagem: validação básica e coleta de dados válidos
    for (const [idx, row] of reqBody.entries()) {
        const rowChassi = row.chassi !== undefined && row.chassi !== null ? String(row.chassi).trim() : '';
        const rowTipo = row.tipo !== undefined && row.tipo !== null ? String(row.tipo).trim() : '';
        const rowBloco = row.bloco !== undefined && row.bloco !== null ? String(row.bloco).trim() : '';
        const rowCondominio = row.condominio !== undefined && row.condominio !== null ? String(row.condominio).trim() : '';
        const rowApartamento = row.apartamento !== undefined && row.apartamento !== null ? String(row.apartamento).trim() : '';
        const rowLocalizacao = row.localizacao !== undefined && row.localizacao !== null ? String(row.localizacao).trim() : undefined;
        const rowLeituraInicial = row.leitura_inicial !== undefined && row.leitura_inicial !== null && row.leitura_inicial !== '' ? Number(row.leitura_inicial) : undefined;
        const rowAnoFabricacao = row.ano_fabricacao !== undefined && row.ano_fabricacao !== null && row.ano_fabricacao !== '' ? Number(row.ano_fabricacao) : undefined;
        const rowPrincipal = typeof row.principal === 'string' ? row.principal.trim().toLowerCase() === 'sim' : !!row.principal;
        const rowRotacao = row.rotacao === 'Crescente' || row.rotacao === 'Decrescente' ? row.rotacao : undefined;

        // Validação dos obrigatórios
        if (!rowChassi || rowChassi === '') {
            errors.push({ row: idx + 2, message: `Chassi não informado` });
            continue;
        }
        if (!rowTipo || rowTipo === '') {
            errors.push({ row: idx + 2, message: `Tipo não informado` });
            continue;
        }
        if (!rowCondominio || rowCondominio === '') {
            errors.push({ row: idx + 2, message: `Condomínio não informado` });
            continue;
        }
        if (rowBloco === '' || rowBloco === null || rowBloco === undefined) {
            errors.push({ row: idx + 2, message: `Bloco não informado` });
            continue;
        }
        if (!rowApartamento || rowApartamento === '') {
            errors.push({ row: idx + 2, message: `Apartamento não informado` });
            continue;
        }
        if (!rowRotacao) {
            errors.push({ row: idx + 2, message: `Rotação inválida. Use 'Crescente' ou 'Decrescente'.` });
            continue;
        }

        // Busca entidades relacionadas
        const complex = complexList.find(
            (c: { id: string, socialName: string }) => c.socialName.toLowerCase().trim() === rowCondominio.toLowerCase().trim()
        );
        if (!complex) {
            errors.push({ row: idx + 2, message: `Condomínio '${rowCondominio}' não encontrado` });
            continue;
        }

        const block = blocks.find(
            (b: { id: string, name: string, complexId: string }) => b.name.toLowerCase().trim() === rowBloco.toLowerCase().trim() && b.complexId === complex.id
        );
        if (!block) {
            errors.push({ row: idx + 2, message: `Bloco '${rowBloco}' não encontrado no condomínio '${rowCondominio}'` });
            continue;
        }

        const apartment = apartments.find(
            (a: { id: string, name: string, blockId: string }) => a.name.toLowerCase().trim() === rowApartamento.toLowerCase().trim() && a.blockId === block.id
        );
        if (!apartment) {
            errors.push({ row: idx + 2, message: `Apartamento '${rowApartamento}' não encontrado no bloco '${rowBloco}'` });
            continue;
        }

        const typeMeter = typeMeterList.find(
            (t: { id: string, name: string }) => t.name.toLowerCase().trim() === rowTipo.toLowerCase().trim()
        );
        if (!typeMeter) {
            const availableTypes = typeMeterList.map((t: { name: string }) => t.name).join(', ');
            const hint = availableTypes ? ` Tipos disponíveis: ${availableTypes}.` : ' Nenhum tipo de medidor cadastrado no sistema.';
            errors.push({ row: idx + 2, message: `Tipo de medidor '${rowTipo}' não encontrado.${hint}` });
            continue;
        }

        // Monta o objeto Meter
        const meterData: Partial<Meter> = {
            register: rowChassi.toUpperCase(), // Sempre salva em uppercase
            typeMeterId: typeMeter.id,
            apartmentId: apartment.id,
            location: rowLocalizacao,
            initialReading: rowLeituraInicial,
            yearManufacture: rowAnoFabricacao,
            main: rowPrincipal,
            rotation: rowRotacao,
            status: row.status || 'Ativo',
        };

        validMeterData.push({ register: rowChassi.toUpperCase(), apartmentId: apartment.id, rowIndex: idx, data: meterData });
    }

    // Se há erros na validação básica, retorna
    if (errors.length > 0) {
        return { errors, toCreate, toUpdate, toSkip };
    }

    // Busca todos os medidores existentes em lote - GLOBAL por register (otimizado)
    const allRegistersUpper = [...new Set(validMeterData.map(item => item.register))]; // Já estão em uppercase
    const existingMeters = await prisma.meter.findMany({
        where: {
            register: { in: allRegistersUpper },
            deletedAt: null
        },
        select: { id: true, register: true, apartmentId: true, status: true, location: true, initialReading: true, yearManufacture: true, main: true, rotation: true }
    });

    // Criar Map para busca O(1) otimizada - usando uppercase para chave
    const existingMetersMap = new Map(existingMeters.map(meter => [meter.register, meter]));

    // Segunda passagem: determina se criar, atualizar ou pular (otimizado com Map)
    for (const item of validMeterData) {
        const existing = existingMetersMap.get(item.register); // Busca usando uppercase

        if (!existing) {
            // Não existe no sistema, será criado
            toCreate.push({ rowIndex: item.rowIndex, data: item.data });
        } else if (existing.apartmentId === item.apartmentId) {
            // Existe no mesmo apartamento, verifica se precisa atualizar
            const needsUpdate = 
                existing.status !== item.data.status ||
                existing.location !== item.data.location ||
                existing.initialReading !== item.data.initialReading ||
                existing.yearManufacture !== item.data.yearManufacture ||
                existing.main !== item.data.main ||
                existing.rotation !== item.data.rotation;

            if (needsUpdate) {
                toUpdate.push({ 
                    rowIndex: item.rowIndex, 
                    data: {
                        status: item.data.status,
                        location: item.data.location,
                        initialReading: item.data.initialReading,
                        yearManufacture: item.data.yearManufacture,
                        main: item.data.main,
                        rotation: item.data.rotation
                    }, 
                    existingId: existing.id 
                });
            } else {
                toSkip.push({ 
                    rowIndex: item.rowIndex, 
                    reason: 'Medidor já existe com os mesmos dados' 
                });
            }
        } else {
            // Existe em outro apartamento - ERRO! Violação de constraint
            errors.push({ 
                row: item.rowIndex + 2, 
                message: `Chassi '${item.register}' já está cadastrado em outro apartamento. O número do chassi deve ser único no sistema.` 
            });
        }
    }
    
    // Se há erros de registros duplicados, retorna
    if (errors.length > 0) {
        return { errors, toCreate, toUpdate, toSkip };
    }
    
    return { errors, toCreate, toUpdate, toSkip };
}

async function executeMetersBatch(
    userId: string, 
    toCreate: Array<{ rowIndex: number; data: any }>, 
    toUpdate: Array<{ rowIndex: number; data: any; existingId: string }>
): Promise<ExecutionResult> {
    const errors: Array<{ row: number; message: string }> = [];
    const created: any[] = [];
    const updated: any[] = [];


    // Executa criações em lote
    if (toCreate.length > 0) {
        try {
            const bulkData = toCreate.map(item => cleanEntityBody(item.data));
            const { entity, error: creationError, status } = await bulkCreateEntity(userId, 'meter', bulkData);
            
            if (creationError || status !== 201) {
                // Se falhar completamente, verifica se é erro de constraint
                if (creationError && creationError.includes('unique_active_register')) {
                    toCreate.forEach(item => {
                        errors.push({ 
                            row: item.rowIndex + 2, 
                            message: `Chassi '${item.data.register}' já está cadastrado no sistema. Números de chassi devem ser únicos.` 
                        });
                    });
                } else {
                    toCreate.forEach(item => {
                        errors.push({ row: item.rowIndex + 2, message: creationError || 'Erro ao criar medidor.' });
                    });
                }
            } else if (entity && entity.count) {
                // Se sucesso, cria objetos mock para representar os medidores criados
                // (createMany retorna apenas o count, não os objetos criados)
                for (let i = 0; i < entity.count; i++) {
                    created.push({ id: `created_${i}`, register: toCreate[i]?.data?.register || `Medidor ${i + 1}` });
                }
            }
        } catch (err: any) {
            // Se erro inesperado, adiciona erro para todos os itens
            console.error('Erro inesperado ao criar medidores:', err);
            
            // Verifica se é erro de constraint de unicidade
            if (err.message && (err.message.includes('unique_active_register') || err.message.includes('Unique constraint'))) {
                toCreate.forEach(item => {
                    errors.push({ 
                        row: item.rowIndex + 2, 
                        message: `Chassi '${item.data.register}' já está cadastrado no sistema. Números de chassi devem ser únicos.` 
                    });
                });
            } else {
                toCreate.forEach(item => {
                    errors.push({ row: item.rowIndex + 2, message: err?.message || 'Erro inesperado ao criar medidores.' });
                });
            }
        }
    }

    // Executa atualizações em lote com Promise.all (paralelo, ~7s para 120 registros)
    if (toUpdate.length > 0) {
        try {
            const updatePromises = toUpdate.map(item => {
                const updateData = cleanEntityBody({ ...item.data });
                delete updateData.register;
                delete updateData.apartmentId;
                delete updateData.blockId;
                delete updateData.complexId;
                delete updateData.companyId;
                updateData.updatedByUserId = userId;
                updateData.updatedAt = new Date();
                return prisma.meter.update({
                    where: { id: item.existingId },
                    data: updateData,
                });
            });
            const results = await Promise.all(updatePromises);
            results.forEach(entity => updated.push(entity));
        } catch (err: any) {
            console.error('Erro ao atualizar medidores em lote:', err);
            toUpdate.forEach(item => {
                errors.push({ row: item.rowIndex + 2, message: err?.message || 'Erro inesperado ao atualizar.' });
            });
        }
    }

    return { errors, created, updated };
}

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const meterId = req.nextUrl.searchParams.get('id') || undefined

    // query params - includes
    const withApartment = req.nextUrl.searchParams.get('with_apartment') === 'true'
    const withBlock = req.nextUrl.searchParams.get('with_block') === 'true'
    const withComplex = req.nextUrl.searchParams.get('with_complex') === 'true'
    const withTypeMeter = req.nextUrl.searchParams.get('with_type_meter') === 'true'

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('order_by') || 'createdAt'
    const orderDirection : 'asc' | 'desc' = req.nextUrl.searchParams.get('order_direction') || req.nextUrl.searchParams.get('order_by') ? 'asc' : 'desc'

    return { meterId, companyId, complexId, blockId, apartmentId, withApartment, withBlock, withComplex, withTypeMeter, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // get userId from session
        const userId = validSession.userId
        
        // get query params
        const { meterId, companyId, complexId, blockId, apartmentId, withApartment, withBlock, withComplex, withTypeMeter, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType : ContextType | undefined = apartmentId ? 'apartment' : blockId ? 'block' : complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'apartment' ? apartmentId : contextType === 'block' ? blockId : contextType === 'complex' ? complexId : contextType === 'company' ? companyId : undefined

        // If no context is provided, check if the user has system-level permission
        if (!contextType || !contextId) {
            // Allow system users (admin/programmer) to search without context
            const contexts = await getUserContextsForActionOnEntity(userId, 'meter', 'read')
            if (!contexts.system) {
                return NextResponse.json({ error: 'Por favor, selecione um condomínio para visualizar os medidores.' }, { status: 400 })
            }
        }

        // Build include object
        const include: any = {}
        
        if (withTypeMeter) {
            include.typeMeter = {
                select: {
                    id: true,
                    name: true,
                    acronym: true
                }
            }
        }
        
        if (withApartment || withBlock || withComplex) {
            include.apartment = {
                select: {
                    id: true,
                    name: true,
                    block: withBlock || withComplex ? {
                        select: {
                            id: true,
                            name: true,
                            complex: withComplex ? {
                                select: {
                                    id: true,
                                    socialName: true
                                }
                            } : undefined
                        }
                    } : undefined
                }
            }
        }


        // get meters
        const {entity, totalCount, error, status} = await getEntityListData(userId, 'meter', contextType, contextId, search, undefined, take, include, skip, orderBy, orderDirection)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'Nenhum medidor encontrado.' }, { status: 404 })

        return NextResponse.json({list:entity, totalCount}, { status: 200 })

    } catch (error: any) {
        console.error("Erro ao buscar medidores:", error)
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();
        
        // Batch import logic
        if (Array.isArray(reqBody.rows)) {
            if (reqBody.rows.length === 0) return NextResponse.json({ error: 'Lista vazia.' }, { status: 400 });

            // Etapa 0: Verificar se o usuário tem permissão para importar medidores
            const contexts = await getUserContextsForActionOnEntity(userId, 'meter', 'create');
            const hasAnyPermission = contexts.system || 
                                   contexts.apartmentIds.length > 0 || 
                                   contexts.blockIds.length > 0 || 
                                   contexts.complexIds.length > 0 || 
                                   contexts.companyIds.length > 0;
            
            if (!hasAnyPermission) {
                return NextResponse.json({ 
                    error: 'Sem permissão para importar medidores', 
                    details: 'Usuário não possui permissão de criação de medidores em nenhum contexto (apartamento, bloco, condomínio ou empresa).' 
                }, { status: 403 });
            }

            // Etapa 1: Validação completa de todos os dados
            const validationResult = await validateMetersBatch(reqBody.rows);
            
            if (validationResult.errors.length > 0) {
                return NextResponse.json({ 
                    error: 'Erros na validação', 
                    details: validationResult.errors 
                }, { status: 400 });
            }

            // Etapa 2: Execução das operações (criar/atualizar)
            const executionResult = await executeMetersBatch(
                userId, 
                validationResult.toCreate, 
                validationResult.toUpdate
            );

            if (executionResult.errors.length > 0) {
                return NextResponse.json({ 
                    error: 'Erros na execução', 
                    details: executionResult.errors 
                }, { status: 400 });
            }

            return NextResponse.json({ 
                message: 'Importação concluída', 
                created: executionResult.created.length,
                updated: executionResult.updated.length,
                skipped: validationResult.toSkip.length,
                meters: [...executionResult.created, ...executionResult.updated] 
            });
        }

        // Single create logic
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        // Garantir que o register seja salvo em uppercase
        if (body.register && typeof body.register === 'string') {
            body.register = body.register.toUpperCase();
        }

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'meter', body);

        // Error handling
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Erro para criar medidor:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
