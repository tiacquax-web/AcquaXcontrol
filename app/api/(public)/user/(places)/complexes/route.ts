import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import prisma from "@/lib/prisma"
import { createEntity, deleteEntity, getAvailableComplexesForEntity, updateEntityData } from "@/lib/userData"
import { getUserContextsForActionOnEntity } from "@/lib/userContexts"
import { cleanWhere } from "@/lib/utils"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { Complex, ContextType } from "@prisma/client"
import { MongoClient } from "mongodb"
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // parâmetros de consulta - customizados
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const documentCompany = req.nextUrl.searchParams.get('document_company') || req.nextUrl.searchParams.get('documentCompany') || undefined
    const withCompany = req.nextUrl.searchParams.get('with_company') || undefined
    const withBlocksCount = req.nextUrl.searchParams.get('with_blocks_count') || false
    const withApartmentsCount = req.nextUrl.searchParams.get('with_apartments_count') || false
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') || false
    const onlyWithReservoirs = req.nextUrl.searchParams.get('onlyWithReservoirs') === 'true'
    const socialNames = req.nextUrl.searchParams.get('socialNames') || '[]'

    // opção - getAvailable...
    const availableForEntity = req.nextUrl.searchParams.get('getAvailableForEntity')
    const getAvailableForEntity = isValidPermissionableEntity(availableForEntity) ? availableForEntity : undefined

    // parâmetros de consulta - padrão
    const search = req.nextUrl.searchParams.get('search') || ''
    const take = parseInt(req.nextUrl.searchParams.get('take') || '12')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { socialNames, withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, documentCompany, search, take, skip, orderBy, orderDirection }
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        console.log("######### Requisição GET de Complexos recebida")
        // valida sessão do usuário (aceita JWT mesmo sem sessão no banco)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // obtém parâmetros de consulta
        const { withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, getAvailableForEntity, withCompany, companyId, complexId, blockId, apartmentId, documentCompany, search, take, skip, orderBy, orderDirection, socialNames } = getQueryParams(req)

        // Novo: busca por múltiplos socialNames
        const socialNamesParam: string[] | undefined = socialNames ? JSON.parse(socialNames) : undefined;
        
        // identifica contexto
        const contextType: ContextType | undefined = companyId ? 'company' : undefined
        const contextId = companyId ? companyId : undefined

        const where = complexId ? { id: complexId } : (socialNamesParam && Array.isArray(socialNamesParam) && socialNamesParam.length > 0 ? { socialName: { in: socialNamesParam } } : undefined);

        const baseSelect = {
            id: true,
            companyId: true,
            socialName: true,
            aliasName: true,
            documentCompany: true,
            documentCompanySecondary: true,
            email: true,
            telephone: true,
            cell: true,
            zipcode: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            state: true,
            city: true,
            photo: true,
            facebook: true,
            instagram: true,
            twitter: true,
            apportionment: true,
            status: true,
            company: withCompany ? {
                select: {
                    id: true,
                    name: true,
                    socialName: true,
                },
            } : false,
        } as const

        // retorna complexos disponíveis para entidade se solicitado
        if (getAvailableForEntity) {
            console.log("######### Buscando complexos disponíveis para entidade:", getAvailableForEntity)
            const { list, totalCount } = await getAvailableComplexesForEntity(userId, getAvailableForEntity, search, companyId, where, !!withBlocksCount, !!withApartmentsCount, !!withMetersCount, false, onlyWithReservoirs, take, skip)
            return NextResponse.json({ list, totalCount })
        }

        const contexts = await getUserContextsForActionOnEntity(userId, 'complex', 'read')
        const hasSystemPermission = !!contexts.system

        // Sem contexto e sem permissão de sistema, não retorna nada.
        if (!hasSystemPermission && contexts.complexIds.length === 0 && contexts.companyIds.length === 0) {
            return NextResponse.json({ list: [], totalCount: 0 })
        }

        const notDeleted = {
            OR: [
                { deletedAt: null },
                { deletedAt: { isSet: false } },
            ],
        }

        const accessOr = hasSystemPermission ? [] : [
            ...(contexts.complexIds.length > 0 ? [{ id: { in: contexts.complexIds } }] : []),
            ...(contexts.companyIds.length > 0 ? [{ companyId: { in: contexts.companyIds } }] : []),
        ]

        const complexWhere = cleanWhere({
            AND: [
                notDeleted,
                search ? { socialName: { contains: search, mode: "insensitive" } } : {},
                documentCompany ? { documentCompany: { contains: documentCompany } } : {},
                companyId ? { companyId } : {},
                complexId ? { id: complexId } : {},
                socialNamesParam && socialNamesParam.length > 0 ? { socialName: { in: socialNamesParam } } : {},
                !hasSystemPermission && accessOr.length > 0 ? { OR: accessOr } : {},
            ],
        })

        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
            throw new Error("DATABASE_URL não configurada.")
        }

        const client = new MongoClient(databaseUrl)
        await client.connect()

        try {
            const db = client.db()
            const complexesCollection = db.collection("Complexes")

            const mongoQuery: any = {
                $and: [
                    { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
                ],
            }

            if (search) {
                mongoQuery.$and.push({
                    socialName: { $regex: search, $options: "i" },
                })
            }

            if (documentCompany) {
                mongoQuery.$and.push({
                    documentCompany: { $regex: documentCompany },
                })
            }

            if (companyId) {
                mongoQuery.$and.push({ companyId })
            }

            if (complexId) {
                mongoQuery.$and.push({ _id: complexId })
            }

            if (socialNamesParam && socialNamesParam.length > 0) {
                mongoQuery.$and.push({ socialName: { $in: socialNamesParam } })
            }

            if (!hasSystemPermission && accessOr.length > 0) {
                mongoQuery.$and.push({
                    $or: accessOr.map((condition: any) => {
                        if (condition.id?.in) {
                            return { _id: { $in: condition.id.in } }
                        }
                        if (condition.companyId?.in) {
                            return { companyId: { $in: condition.companyId.in } }
                        }
                        return condition
                    }),
                })
            }

            const sortField = orderBy === "id" ? "_id" : orderBy
            const projection: any = {
                _id: 1,
                companyId: 1,
                socialName: 1,
                aliasName: 1,
                documentCompany: 1,
                documentCompanySecondary: 1,
                email: 1,
                telephone: 1,
                cell: 1,
                zipcode: 1,
                street: 1,
                number: 1,
                complement: 1,
                neighborhood: 1,
                state: 1,
                city: 1,
                photo: 1,
                facebook: 1,
                instagram: 1,
                twitter: 1,
                apportionment: 1,
                status: 1,
            }

            const complexesRaw = await complexesCollection
                .find(mongoQuery, { projection })
                .sort({ [sortField]: orderDirection === "asc" ? 1 : -1 })
                .skip(skip)
                .limit(take)
                .toArray()

            let companyMap = new Map<string, { id: string; name?: string; socialName?: string }>()
            if (withCompany) {
                const companyIds = [...new Set(complexesRaw.map((complex: any) => complex.companyId).filter(Boolean))]
                if (companyIds.length > 0) {
                    const companies = await db.collection("Companies")
                        .find(
                            {
                                _id: { $in: companyIds },
                                $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
                            },
                            { projection: { _id: 1, name: 1, socialName: 1 } }
                        )
                        .toArray()
                    companyMap = new Map(companies.map((company: any) => [
                        String(company._id),
                        {
                            id: String(company._id),
                            name: company.name,
                            socialName: company.socialName,
                        },
                    ]))
                }
            }

            const entity = complexesRaw.map((complex: any) => ({
                id: String(complex._id),
                companyId: complex.companyId ?? null,
                socialName: complex.socialName ?? "",
                aliasName: complex.aliasName ?? null,
                documentCompany: complex.documentCompany ?? null,
                documentCompanySecondary: complex.documentCompanySecondary ?? null,
                email: complex.email ?? null,
                telephone: complex.telephone ?? null,
                cell: complex.cell ?? null,
                zipcode: complex.zipcode ?? null,
                street: complex.street ?? null,
                number: complex.number ?? null,
                complement: complex.complement ?? null,
                neighborhood: complex.neighborhood ?? null,
                state: complex.state ?? null,
                city: complex.city ?? null,
                photo: complex.photo ?? null,
                facebook: complex.facebook ?? null,
                instagram: complex.instagram ?? null,
                twitter: complex.twitter ?? null,
                apportionment: complex.apportionment ?? "Simples",
                status: complex.status ?? "Ativo",
                company: withCompany && complex.companyId ? companyMap.get(String(complex.companyId)) ?? null : undefined,
            }))

            console.log("######### Complexos encontrados:", entity.length)

            return NextResponse.json({ list: entity, totalCount: entity.length })
        } finally {
            await client.close()
        }

    } catch (error: any) {
        console.error("Erro ao buscar complexos:", error)
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Valida sessão do usuário
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Faz o parse do corpo da requisição
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Limpa o corpo para remover campos indesejados

        // Valida corpo da requisição
        if (!body) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });

        console.warn("######### Criando complexo com corpo:", body);

        // Tenta criar a entidade
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'complex', body);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Erro interno do servidor - Entidade não criada' }, { status: 500 });

        // Retorna os dados da entidade criada
        return NextResponse.json(entity);

    } catch (error: any) {
        // Loga e trata erros inesperados
        console.error("Erro ao criar complexo:", error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
