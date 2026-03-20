import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { createEntity, bulkCreateEntity, getAvailableApartmentsForEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import prisma from '@/lib/prisma'

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

// Helper function to normalize strings for duplicate detection
function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '') // Remove all spaces
        .normalize('NFD') // Decompose accented characters
        .replace(/[\u0300-\u036f]/g, ''); // Remove diacritical marks
}

async function findActiveApartmentDuplicate(blockId: string, name: string, excludeId?: string) {
    const normalizedApartmentName = normalizeString(name);
    const currentBlock = await prisma.block.findUnique({
        where: { id: blockId },
        select: { id: true, name: true, complexId: true },
    });
    if (!currentBlock) return null;

    const normalizedBlockName = normalizeString(currentBlock.name);
    const siblingBlocks = await prisma.block.findMany({
        where: {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            complexId: currentBlock.complexId,
        },
        select: { id: true, name: true },
    });

    const candidateBlockIds = siblingBlocks
        .filter((block) => normalizeString(block.name) === normalizedBlockName)
        .map((block) => block.id);

    if (candidateBlockIds.length === 0) return null;

    const candidates = await prisma.apartment.findMany({
        where: {
            blockId: { in: candidateBlockIds },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true, blockId: true },
    });

    return candidates.find((apt) => normalizeString(apt.name) === normalizedApartmentName) || null;
}

async function validateApartmentsBatch(reqBody: any[]): Promise<ValidationResult> {
    const errors: Array<{ row: number; message: string }> = [];
    const toCreate: Array<{ rowIndex: number; data: any }> = [];
    const toUpdate: Array<{ rowIndex: number; data: any; existingId: string }> = [];
    const toSkip: Array<{ rowIndex: number; reason: string }> = [];

    // Coleta todos os nomes de condomínio e bloco únicos
    const allCondominios = Array.from(new Set(reqBody.map((row: any) => (row.condominio || '').toLowerCase().trim())));
    const allBlocosPorCondominio: Record<string, Set<string>> = {};

    reqBody.forEach((row: any) => {
        const cond = (row.condominio || '').toLowerCase().trim();
        if (!allBlocosPorCondominio[cond]) allBlocosPorCondominio[cond] = new Set();
        if (row.bloco !== undefined && row.bloco !== null) allBlocosPorCondominio[cond].add(String(row.bloco).toLowerCase().trim());
    });

    // Busca todos os complexos necessários
    const complexList = await prisma.complex.findMany({
        where: { socialName: { in: allCondominios, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, socialName: true }
    });

    // Busca todos os blocos necessários
    let blocks: { id: string, name: string, complexId: string }[] = [];
    for (const complex of complexList) {
        const blocos = Array.from(allBlocosPorCondominio[complex.socialName.toLowerCase().trim()] || []);
        if (blocos.length > 0) {
            const foundBlocks = await prisma.block.findMany({
                where: {
                    name: { in: blocos, mode: 'insensitive' },
                    complexId: complex.id
                },
                select: { id: true, name: true, complexId: true }
            });
            blocks = blocks.concat(foundBlocks);
        }
    }

    // Coleta todos os blockIds válidos para buscar apartamentos existentes
    const validApartmentData: Array<{ name: string; blockId: string; rowIndex: number; data: any }> = [];
    
    // Primeira passagem: validação básica e coleta de dados válidos
    for (const [idx, row] of reqBody.entries()) {
        const rowName = row.nome !== undefined && row.nome !== null ? String(row.nome) : (row.name !== undefined ? String(row.name) : '');
        const rowBloco = row.bloco !== undefined && row.bloco !== null ? String(row.bloco) : '';
        const rowFracao = row.fracao !== undefined && row.fracao !== null ? row.fracao : (row.fraction !== undefined ? row.fraction : undefined);
        let blockId = row.blockId;

        // Resolve condominio e bloco se necessário
        if (!blockId && rowBloco && row.condominio) {
            const complex = complexList.find(
                (c: { id: string, socialName: string }) => c.socialName.toLowerCase().trim() === String(row.condominio).toLowerCase().trim()
            );
            if (!complex) {
                errors.push({ row: idx + 2, message: `Condomínio '${row.condominio}' não encontrado` });
                continue;
            }
            const block = blocks.find(
                (b: { id: string, name: string, complexId: string }) => b.name.toLowerCase().trim() === rowBloco.toLowerCase().trim() && b.complexId === complex.id
            );
            if (!block) {
                errors.push({ row: idx + 2, message: `Bloco '${rowBloco}' não encontrado no condomínio '${row.condominio}'` });
                continue;
            }
            blockId = block.id;
        }

        if (!blockId) {
            errors.push({ row: idx + 2, message: `Bloco não informado ou não encontrado` });
            continue;
        }

        if (!rowName || rowName.trim() === '') {
            errors.push({ row: idx + 2, message: `Nome do apartamento não informado` });
            continue;
        }

        // Monta o objeto Apartment
        const apartmentData: any = {
            name: rowName,
            blockId,
            status: row.status || 'Ativo',
        };
        if (rowFracao !== undefined && rowFracao !== null && rowFracao !== '') {
            apartmentData.fraction = Number(rowFracao);
        }

        // ✅ CORREÇÃO 1: Variáveis corrigidas (linhas 118-123)
        validApartmentData.push({
            name: rowName,
            blockId: blockId,
            rowIndex: idx,
            data: apartmentData
        });
    }

    // Se há erros na validação básica, retorna
    if (errors.length > 0) {
        return { errors, toCreate, toUpdate, toSkip };
    }

    // Validação de apartamentos duplicados no dataset
    const processedData = validApartmentData.map((item, index) => ({
        ...item,
        normalizedName: normalizeString(item.name),
        originalIndex: index
    }));

    const repeatingApartments = processedData.filter((apartment, index, self) =>
        self.findIndex(ap => 
            ap.normalizedName === apartment.normalizedName && 
            ap.blockId === apartment.blockId
        ) !== index
    );

    if (repeatingApartments.length > 0) {
        repeatingApartments.forEach(duplicate => {
            const originalIndex = processedData.findIndex(ap => 
                ap.normalizedName === duplicate.normalizedName && 
                ap.blockId === duplicate.blockId
            );
            const originalRow = originalIndex >= 0 ? originalIndex + 2 : 'desconhecida';
            
            errors.push({ 
                row: duplicate.rowIndex + 2, 
                message: `Apartamento duplicado detectado: '${duplicate.name}' (similar ao da linha ${originalRow})` 
            });
        });
        
        return { errors, toCreate, toUpdate, toSkip };
    }

    // Busca todos os apartamentos existentes em lote
    const blockIds = [...new Set(validApartmentData.map(item => item.blockId))];
    const existingApartments = await prisma.apartment.findMany({
        where: {
            blockId: { in: blockIds },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
        },
        select: { id: true, name: true, blockId: true, status: true, fraction: true }
    });

    // Segunda passagem: determina se criar, atualizar ou pular
    for (const item of validApartmentData) {
        const existing = existingApartments.find(
            apt => normalizeString(apt.name) === normalizeString(item.name) && apt.blockId === item.blockId
        );

        if (!existing) {
            // Não existe, será criado
            toCreate.push({ rowIndex: item.rowIndex, data: item.data });
        } else {
            // Existe, verifica se precisa atualizar
            const needsUpdate = 
                existing.status !== item.data.status ||
                (item.data.fraction !== undefined && existing.fraction !== item.data.fraction);

            if (needsUpdate) {
                toUpdate.push({ 
                    rowIndex: item.rowIndex, 
                    data: item.data, 
                    existingId: existing.id 
                });
            } else {
                toSkip.push({ 
                    rowIndex: item.rowIndex, 
                    reason: 'Apartamento já existe com os mesmos dados' 
                });
            }
        }
    }

    return { errors, toCreate, toUpdate, toSkip };
}

async function executeApartmentsBatch(
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
            const { entity, error: creationError, status } = await bulkCreateEntity(userId, 'apartment', bulkData);
            
            if (creationError || status !== 201) {
                // Se falhar completamente, adiciona erro para todos os itens
                toCreate.forEach(item => {
                    errors.push({ row: item.rowIndex + 2, message: creationError || 'Erro ao criar apartamento.' });
                });
            } else if (entity && entity.count) {
                // Se sucesso, cria objetos mock para representar os apartamentos criados
                // (createMany retorna apenas o count, não os objetos criados)
                for (let i = 0; i < entity.count; i++) {
                    created.push({ id: `created_${i}`, name: toCreate[i]?.data?.name || `Apartamento ${i + 1}` });
                }
            }
        } catch (err: any) {
            // Se erro inesperado, adiciona erro para todos os itens
            toCreate.forEach(item => {
                errors.push({ row: item.rowIndex + 2, message: err?.message || 'Erro inesperado ao criar apartamentos.' });
            });
        }
    }

    // Executa atualizações (mantém individual pois precisa do ID específico)
    for (const item of toUpdate) {
        try {
            const updateData = cleanEntityBody({
                status: item.data.status,
                ...(item.data.fraction !== undefined && { fraction: item.data.fraction })
            });
            
            const { entity, error: updateError } = await updateEntityData(userId, 'apartment', item.existingId, updateData);
            if (updateError || !entity) {
                errors.push({ row: item.rowIndex + 2, message: updateError || 'Erro ao atualizar apartamento.' });
            } else {
                updated.push(entity);
            }
        } catch (err: any) {
            errors.push({ row: item.rowIndex + 2, message: err?.message || 'Erro inesperado ao atualizar.' });
        }
    }

    return { errors, created, updated };
}

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('id') || undefined
    const withBlock = req.nextUrl.searchParams.get('with_block') === 'true' ? true : false
    const withComplex = req.nextUrl.searchParams.get('with_complex') === 'true' ? true : false
    const withCompany = req.nextUrl.searchParams.get('with_company') === 'true' ? true : false

    // option - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection: 'asc' | 'desc' = req.nextUrl.searchParams.get('orderDirection') == 'asc' ? 'asc' : 'desc'

    return { withCompany, withComplex, withBlock, getAvailableForEntity, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // get query params
        const { withCompany, withComplex, withBlock, getAvailableForEntity, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType: ContextType | undefined = blockId ? 'block' : complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'block' ? blockId : contextType === 'complex' ? complexId : contextType === 'company' ? companyId : undefined

        const include = withBlock || withComplex || withCompany ? {
            block: withBlock ? {
                include: withComplex || withCompany ? {
                    complex: withComplex ? {
                        select: {
                            id: true,
                            socialName: true,
                            company: withCompany ? {
                                select: {
                                    id: true,
                                    name: true
                                }
                            } : undefined
                        }
                    } : undefined
                } : undefined
            } : undefined
        } : undefined


        // return available apartments for entity if requested
        if (getAvailableForEntity) {
            // ✅ CORREÇÃO 2: Removido include[...] (linha 321)
            const { list, totalCount } = await getAvailableApartmentsForEntity(userId, getAvailableForEntity, search, complexId, blockId, apartmentId, take, skip, orderBy, orderDirection, include)
            return NextResponse.json({ list, totalCount })
        }

        console.log("Fetching apartments with context:", { contextType, contextId, search, take, skip, orderBy, orderDirection })

        // get apartments
        // ✅ CORREÇÃO 3: Adicionado orderDirection ao invés de 'asc' (linha 328)
        const { entity, error, status, totalCount } = await getEntityListData(userId, 'apartment', contextType, contextId, search, null, take, include, skip, 'name', orderDirection)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'No apartments found.' }, { status: 404 })

        return NextResponse.json({ list: entity, totalCount: totalCount })

    } catch (error: any) {
        console.error("Error fetching apartments:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();        // Batch import logic
        //TODO: Implementar interface para o body de importação, garantindo tipos corretos
        if (Array.isArray(reqBody)) {
            if (reqBody.length === 0) return NextResponse.json({ error: 'Lista vazia.' }, { status: 400 });

            // Etapa 1: Validação completa de todos os dados
            const validationResult = await validateApartmentsBatch(reqBody);
            
            if (validationResult.errors.length > 0) {
                return NextResponse.json({ 
                    error: 'Erros na validação', 
                    details: validationResult.errors 
                }, { status: 400 });
            }

            // Etapa 2: Execução das operações (criar/atualizar)
            const executionResult = await executeApartmentsBatch(
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
                apartments: [...executionResult.created, ...executionResult.updated] 
            });
        }

        // Single create logic
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        body.name = String(body.name || "").trim();
        body.blockId = String(body.blockId || "").trim();
        if (!body.name || !body.blockId) {
            return NextResponse.json({ error: 'Nome e bloco são obrigatórios.' }, { status: 400 });
        }

        const duplicate = await findActiveApartmentDuplicate(body.blockId, body.name);
        if (duplicate) {
            return NextResponse.json({ error: `Já existe um apartamento com este nome no mesmo condomínio e bloco.` }, { status: 409 });
        }

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'apartment', body);

        // Error handling
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating apartment:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
