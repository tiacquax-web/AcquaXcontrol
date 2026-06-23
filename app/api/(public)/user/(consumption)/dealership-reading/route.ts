import { cleanEntityBody } from "@/lib/prisma"
import { createEntity, deleteEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ContextType, DealershipReading } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const withApartment = req.nextUrl.searchParams.get('with_apartment') || undefined
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') || undefined
    const withComplex = req.nextUrl.searchParams.get('with_complex') || undefined
    const withCompany = req.nextUrl.searchParams.get('with_company') || undefined
    const withDealership = req.nextUrl.searchParams.get('with_dealership') || undefined
    const dealershipReadingId = req.nextUrl.searchParams.get('id') || undefined
    const startDate = req.nextUrl.searchParams.get('start_date') || undefined
    const endDate = req.nextUrl.searchParams.get('end_date') || undefined
    const type = req.nextUrl.searchParams.get('type') || undefined // 'water' | 'gas'

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || undefined
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('orderBy') || 'createdAt'
    const orderDirection = req.nextUrl.searchParams.get('orderDirection') || 'desc'

    return { dealershipReadingId, startDate, endDate, type, withComplex, withCompany, withDealership, withMetersCount, withApartment, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection }
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
    const { dealershipReadingId, startDate, endDate, type, withComplex, withCompany, withDealership, withMetersCount, withApartment, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection } = getQueryParams(req)

        // identify context
        const contextType: ContextType | undefined = apartmentId ? 'apartment' : blockId ? 'block' : complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'apartment' ? apartmentId : contextType === 'block' ? blockId : complexId ? complexId : companyId ? companyId : undefined

        const include = {
            complex: withComplex || withCompany ? {
                select : {
                    id: withComplex ? true : undefined,
                    socialName: withComplex ? true : undefined,
                    company: withCompany ? {
                        select: {
                            id: withCompany ? true : undefined,
                            socialName: withCompany ? true : undefined,
                        },
                        where: {
                            deletedAt: null,
                        }
                    } : undefined,
                },
            } : undefined,
            dealership: withDealership ? {
                select: {
                    id: true,
                    name: true,
                },
            } : undefined,
        }

        const where: any = {
            id: dealershipReadingId ? dealershipReadingId : undefined,
            readingDate: startDate || endDate ? {
                gte: startDate ? startDate.slice(0, 10) : undefined,
                lte: endDate ? endDate.slice(0, 10) : undefined
            } : undefined,
            type: type && (type === 'water' || type === 'gas') ? type : undefined,
        }

        // get apartment consumption report
        const { entity, totalCount, error, status } = await getEntityListData(userId, 'dealershipReading', contextType, contextId, search, where, take, include, skip)
        if (error) return NextResponse.json({ error }, { status })
        if (!entity) return NextResponse.json({ error: 'No readings found.' }, { status: 404 })

        return NextResponse.json({ list: entity, totalCount })

    } catch (error: any) {
        console.error("Error fetching apartment reports:", error)
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
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        const bodyData: Partial<DealershipReading> = {
            average: body.average,
            billedConsumption: body.billedConsumption,
            complexId: body.complexId,
            consumptionValue: body.consumptionValue,
            dealershipConsumption: body.dealershipConsumption,
            dealershipCost: body.dealershipCost,
            dealershipId: body.dealershipId,
            diffCost: body.diffCost,
            kiteCar: body.kiteCar,
            kiteCarConsumedUnits: body.kiteCarConsumedUnits,
            kiteCarConsumption: body.kiteCarConsumption,
            kiteCarCostUnits: body.kiteCarCostUnits,
            kiteCarQtd: body.kiteCarQtd,
            kiteCarTax: body.kiteCarTax,
            kiteCarTotal: body.kiteCarTotal,
            monthRef: body.monthRef,
            monthlyConsumption: body.monthlyConsumption,
            readingDate: body.readingDate,
            readingDateNext: body.readingDateNext,
            sewageValue: body.sewageValue,
            totalDays: body.totalDays,
            totalValue: body.totalValue,
            type: body.type,
            valuePerKiteCar: body.valuePerKiteCar,
            yearRef: body.yearRef,
        }

        // ── Duplicate guard ──────────────────────────────────────────────────────
        // Block creation if a non-deleted record already exists for the same
        // complex + month + year + type combination.
        if (bodyData.complexId && bodyData.monthRef && bodyData.yearRef && bodyData.type) {
            const existing = await prisma.dealershipReading.findFirst({
                where: {
                    complexId: bodyData.complexId,
                    monthRef: bodyData.monthRef,
                    yearRef: bodyData.yearRef,
                    type: bodyData.type,
                    deletedAt: null,
                },
                select: { id: true },
            });
            if (existing) {
                const typeLabel = bodyData.type === 'gas' ? 'Gás' : 'Água';
                return NextResponse.json(
                    {
                        error: `Já existe um lançamento de ${typeLabel} para este condomínio em ${bodyData.monthRef}/${bodyData.yearRef}. Edite o lançamento existente em vez de criar um novo.`,
                        existingId: existing.id,
                        code: 'DUPLICATE_DEALERSHIP_READING',
                    },
                    { status: 409 }
                );
            }
        }
        // ────────────────────────────────────────────────────────────────────────

        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'dealershipReading', bodyData);
        if (creationError) return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not created' }, { status: 500 });

        // Return the created entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating apartment report:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}