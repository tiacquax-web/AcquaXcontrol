import { NextRequest, NextResponse } from "next/server"
import { isSessionValid } from "@/lib/users"
import prisma from "@/lib/prisma"

async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
    const results: R[] = []
    let nextIndex = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++
            results[currentIndex] = await task(items[currentIndex])
        }
    })
    await Promise.all(workers)
    return results
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const userId = validSession.userId
        const body = await req.json()
        
        const { 
            dealershipReadingId, 
            complexId, 
            monthRef, 
            yearRef, 
            calculationMethod 
        } = body

        if (!dealershipReadingId || !complexId || !monthRef || !yearRef) {
            return NextResponse.json({ 
                error: 'dealershipReadingId, complexId, monthRef e yearRef são obrigatórios' 
            }, { status: 400 })
        }

        // Get dealership reading data
        const dealershipReading = await prisma.dealershipReading.findUnique({
            where: { id: dealershipReadingId }
        })

        if (!dealershipReading) {
            return NextResponse.json({ 
                error: 'Leitura de concessionária não encontrada' 
            }, { status: 404 })
        }

        // Get all apartments in the complex
        const apartments = await prisma.apartment.findMany({
            where: {
                deletedAt: null,
                block: {
                    complexId: complexId,
                    deletedAt: null
                }
            },
            include: {
                block: true
            }
        })

        if (apartments.length === 0) {
            return NextResponse.json({ 
                error: 'Nenhum apartamento encontrado no condomínio' 
            }, { status: 404 })
        }

        // Generate reports based on calculation method
        const existingReports = await prisma.apartmentConsumptionReport.findMany({
            where: {
                apartmentId: { in: apartments.map(apartment => apartment.id) },
                monthRef,
                yearRef,
                dealershipReadingId
            },
            select: { id: true, apartmentId: true }
        })
        const existingReportByApartmentId = new Map(existingReports.map(report => [report.apartmentId, report.id]))
        
        const reports = await runWithConcurrency(apartments, 8, async (apartment) => {
            let calculatedValues
            
            switch (calculationMethod) {
                case 'proportional':
                    calculatedValues = calculateProportionalValues(apartment, dealershipReading)
                    break
                case 'equal':
                    calculatedValues = calculateEqualValues(apartment, dealershipReading, apartments.length)
                    break
                case 'consumption':
                    calculatedValues = calculateConsumptionBasedValues(apartment, dealershipReading)
                    break
                default:
                    calculatedValues = calculateProportionalValues(apartment, dealershipReading)
            }

            const existingReportId = existingReportByApartmentId.get(apartment.id)

            if (existingReportId) {
                // Update existing report
                return await prisma.apartmentConsumptionReport.update({
                    where: { id: existingReportId },
                    data: {
                        ...calculatedValues,
                        updatedByUserId: userId,
                        updatedAt: new Date()
                    }
                })
            }

            // Create new report
            return await prisma.apartmentConsumptionReport.create({
                data: {
                    ...calculatedValues,
                    apartmentId: apartment.id,
                    monthRef,
                    yearRef,
                    dealershipReadingId,
                    createdByUserId: userId,
                    createdAt: new Date()
                }
            })
        })

        return NextResponse.json({ 
            success: true, 
            message: `${reports.length} relatórios gerados com sucesso`,
            reports 
        })

    } catch (error) {
        console.error('Error generating apartment reports:', error)
        return NextResponse.json({ 
            error: 'Erro interno do servidor' 
        }, { status: 500 })
    }
}

// Helper functions for different calculation methods
function calculateProportionalValues(apartment: any, dealershipReading: any) {
    // Basic proportional calculation
    // This is a simplified version - you should implement your business logic here
    const baseConsumption = dealershipReading.monthlyConsumption || 0
    const baseCost = dealershipReading.consumptionValue || 0
    const sewageCost = dealershipReading.sewageValue || 0
    
    // For this example, we'll divide equally, but you should implement proper proportional logic
    return {
        consumption: baseConsumption * 0.1, // 10% as example
        totalConsumption: baseConsumption * 0.1,
        consumptionCost: baseCost * 0.1,
        sewageCost: sewageCost * 0.1,
        partial: baseCost * 0.05, // 5% as proportional share
        totalUnit: (baseCost + sewageCost) * 0.1,
        kiteCarConsumption: dealershipReading.kiteCarConsumption ? (dealershipReading.kiteCarConsumption * 0.1) : 0,
        kiteCarCost: dealershipReading.kiteCarTotal ? (dealershipReading.kiteCarTotal * 0.1) : 0,
        consumptionGasValue: 0, // Set gas values if applicable
        totalGasValue: 0
    }
}

function calculateEqualValues(apartment: any, dealershipReading: any, totalApartments: number) {
    const baseConsumption = dealershipReading.monthlyConsumption || 0
    const baseCost = dealershipReading.consumptionValue || 0
    const sewageCost = dealershipReading.sewageValue || 0
    
    return {
        consumption: baseConsumption / totalApartments,
        totalConsumption: baseConsumption / totalApartments,
        consumptionCost: baseCost / totalApartments,
        sewageCost: sewageCost / totalApartments,
        partial: baseCost / totalApartments,
        totalUnit: (baseCost + sewageCost) / totalApartments,
        kiteCarConsumption: dealershipReading.kiteCarConsumption ? (dealershipReading.kiteCarConsumption / totalApartments) : 0,
        kiteCarCost: dealershipReading.kiteCarTotal ? (dealershipReading.kiteCarTotal / totalApartments) : 0,
        consumptionGasValue: 0,
        totalGasValue: 0
    }
}

function calculateConsumptionBasedValues(apartment: any, dealershipReading: any) {
    // This would typically use individual meter readings
    // For now, we'll use a simplified version
    return calculateProportionalValues(apartment, dealershipReading)
}
