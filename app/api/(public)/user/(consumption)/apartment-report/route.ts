import { cleanEntityBody } from "@/lib/prisma"
import { createEntity, deleteEntity, getEntityListData, updateEntityData } from "@/lib/userData"
import { isSessionValid, validateUserSession } from "@/lib/users"
import { ApartmentConsumptionReport, ContextType, DealershipType } from "@prisma/client"
import prisma from '@/lib/prisma'
import { NextRequest, NextResponse } from "next/server"

function getQueryParams(req: NextRequest) {
    // query params - custom
    const id = req.nextUrl.searchParams.get('id') || undefined
    const companyId = req.nextUrl.searchParams.get('company_id') || undefined
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined
    const blockId = req.nextUrl.searchParams.get('block_id') || undefined
    const apartmentId = req.nextUrl.searchParams.get('apartment_id') || undefined
    const withApartment = req.nextUrl.searchParams.get('with_apartment') || undefined
    const withMetersCount = req.nextUrl.searchParams.get('with_meters_count') || undefined
    const withMeters = req.nextUrl.searchParams.get('with_meters') || undefined
    const dealershipReadingId = req.nextUrl.searchParams.get('dealership_reading_id') || undefined
    const withTotalDays = req.nextUrl.searchParams.get('with_total_days') || undefined
    const withReadingDate = req.nextUrl.searchParams.get('with_reading_date') || undefined
    const withLastReading = req.nextUrl.searchParams.get('include_last_reading') || undefined
    const startDate = req.nextUrl.searchParams.get('start_date') || undefined
    const endDate = req.nextUrl.searchParams.get('end_date') || undefined
    const utilityType = req.nextUrl.searchParams.get('utility_type') || undefined // 'water' | 'gas'

    // query params - default
    const search = req.nextUrl.searchParams.get('search') || undefined
    const take = parseInt(req.nextUrl.searchParams.get('take') || '10')
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0')
    const orderBy = req.nextUrl.searchParams.get('order_by') || 'apartment.name'
    const orderDirection = req.nextUrl.searchParams.get('order_by_direction') || 'asc'

    return { id, startDate, endDate, withTotalDays, withReadingDate, withMeters, withMetersCount, withApartment, withLastReading, dealershipReadingId, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection, utilityType }
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
    const { id, startDate, endDate, withTotalDays, withReadingDate, withLastReading, dealershipReadingId, withMeters, withMetersCount, withApartment, companyId, complexId, blockId, apartmentId, search, take, skip, orderBy, orderDirection, utilityType } = getQueryParams(req)

        // identify context
        const contextType: ContextType | undefined = apartmentId ? 'apartment' : blockId ? 'block' : complexId ? 'complex' : companyId ? 'company' : undefined
        const contextId = contextType === 'apartment' ? apartmentId : contextType === 'block' ? blockId : complexId ? complexId : companyId ? companyId : undefined

    const include: any = {
            apartment: withApartment || withMeters ? {
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
                                }
                            }
                        }
                    },
                    meters: withMeters ? {
                        select: {
                            id: true,
                            register: true,
                            status: true,
                            typeMeterId: true,
                        },
                        where: {
                            deletedAt: null,
                        }
                    } : undefined,
                    _count: withMetersCount ? {
                        select: {
                            meters: {
                                where: {
                                    deletedAt: null,
                                }
                            }
                        },
                    } : undefined
                }
            } : undefined,
            DealershipReading: withTotalDays || withReadingDate ? {
                select: {
                    totalDays: withTotalDays ? true : undefined,
                    readingDate: withReadingDate ? true : undefined,
                    type: true,
                },
                where: {
                    deletedAt: null,
                }
            } : undefined,
            lastReading: withLastReading ? {
                select: {
                    id: true,
                    reading: true,
                    readAtDate: true,
                    nextReadingDate: true,
                    isPreReading: true,
                    urlCover: true,
                    registerName: true,
                }
            } : undefined
        }

        const where: any = {
            id: id || undefined,
            dealershipReadingId: dealershipReadingId || undefined,
            DealershipReading: startDate || endDate ? {
                readingDate: {
                    gte: startDate ? startDate.slice(0, 10) : undefined,
                    lte: endDate ? endDate.slice(0, 10) : undefined
                }
            } : undefined,
            utilityType: utilityType && (utilityType === 'water' || utilityType === 'gas') ? utilityType as DealershipType : undefined,
        }

        console.warn("#WHERE - ", JSON.stringify(where, null, 2))
        // get apartment consumption report
        const { entity, totalCount, error, status } = await getEntityListData(userId, 'apartmentConsumptionReport', contextType, contextId, search, where, take, include, skip, orderBy, orderDirection as 'asc' | 'desc')
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

        // Define utility type: explicit param wins, else infer from dealershipReading
        let resolvedUtilityType: DealershipType | undefined = undefined;
        if (body.utilityType && (body.utilityType === 'water' || body.utilityType === 'gas')) {
            resolvedUtilityType = body.utilityType as DealershipType;
        } else if (body.dealershipReadingId) {
            const dr = await prisma.dealershipReading.findUnique({ where: { id: body.dealershipReadingId }, select: { type: true } });
            resolvedUtilityType = dr?.type as DealershipType | undefined;
        }

        const bodyData: any = {
            apartmentId: body.apartmentId,
            dealershipReadingId: body.dealershipReadingId,
            consumption: body.consumption,
            totalConsumption: body.totalConsumption,
            consumptionCost: body.consumptionCost,
            sewageCost: body.sewageCost,
            partial: body.partial,
            totalUnit: body.totalUnit,
            monthRef: body.monthRef,
            yearRef: body.yearRef,
            utilityType: resolvedUtilityType,
            // kiteCarConsumption: body.kiteCarConsumption,
            // kiteCarCost: body.kiteCarCost,
            // editor: body.editor,
            // consumptionGasValue: body.consumptionGasValue,
            // totalGasValue: body.totalGasValue,
            // coeficiente: body.coeficiente,
            // metodoCalculo: body.metodoCalculo,
        }


        // Attempt to create the entity
        const { entity, error: creationError, status: creationStatus } = await createEntity(userId, 'apartmentConsumptionReport', bodyData);
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