import { NextRequest, NextResponse } from "next/server"
import { isSessionValid } from "@/lib/users"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const session = req.cookies.get('session')?.value
        const validSession = session ? await isSessionValid(session) : false
        if (!validSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { apartmentId, dealershipReadingId, calculationMethod } = body

        if (!apartmentId || !dealershipReadingId) {
            return NextResponse.json({ 
                error: 'apartmentId e dealershipReadingId são obrigatórios' 
            }, { status: 400 })
        }

        // Get apartment data
        const apartment = await prisma.apartment.findUnique({
            where: { id: apartmentId },
            include: {
                block: {
                    include: {
                        complex: true
                    }
                }
            }
        })

        if (!apartment) {
            return NextResponse.json({ 
                error: 'Apartamento não encontrado' 
            }, { status: 404 })
        }
        if (!apartment.block) {
            return NextResponse.json({
                error: 'Apartamento sem bloco válido. Corrija o cadastro antes de calcular o relatório.'
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

        // Get total apartments in the complex for equal distribution
        const totalApartments = await prisma.apartment.count({
            where: {
                deletedAt: null,
                block: {
                    is: {
                        complexId: apartment.block.complexId,
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
                    }
                }
            }
        })

        // Calculate values based on method
        let calculatedValues
        
        switch (calculationMethod) {
            case 'proportional':
                calculatedValues = calculateProportionalValues(apartment, dealershipReading)
                break
            case 'equal':
                calculatedValues = calculateEqualValues(apartment, dealershipReading, totalApartments)
                break
            case 'consumption':
                calculatedValues = await calculateConsumptionBasedValues(apartment, dealershipReading)
                break
            default:
                calculatedValues = calculateProportionalValues(apartment, dealershipReading)
        }

        return NextResponse.json(calculatedValues)

    } catch (error) {
        console.error('Error calculating apartment values:', error)
        return NextResponse.json({ 
            error: 'Erro interno do servidor' 
        }, { status: 500 })
    }
}

// Helper functions for different calculation methods
function calculateProportionalValues(apartment: any, dealershipReading: any) {
    // Basic proportional calculation based on apartment characteristics
    // You can enhance this with apartment size, number of residents, etc.
    const baseConsumption = dealershipReading.monthlyConsumption || 0
    const baseCost = dealershipReading.consumptionValue || 0
    const sewageCost = dealershipReading.sewageValue || 0
    
    // Example: use a factor based on apartment characteristics
    const proportionalFactor = 0.1 // This should be calculated based on your business logic
    
    return {
        consumption: baseConsumption * proportionalFactor,
        totalConsumption: baseConsumption * proportionalFactor,
        consumptionCost: baseCost * proportionalFactor,
        sewageCost: sewageCost * proportionalFactor,
        partial: baseCost * proportionalFactor * 0.5, // Proportional share
        totalUnit: (baseCost + sewageCost) * proportionalFactor,
        kiteCarConsumption: dealershipReading.kiteCarConsumption ? (dealershipReading.kiteCarConsumption * proportionalFactor) : 0,
        kiteCarCost: dealershipReading.kiteCarTotal ? (dealershipReading.kiteCarTotal * proportionalFactor) : 0,
        consumptionGasValue: 0,
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

async function calculateConsumptionBasedValues(apartment: any, dealershipReading: any) {    // Get latest readings for the apartment's meters
    const apartmentMeters = await prisma.meter.findMany({
        where: { apartmentId: apartment.id },
        include: {
            Readings: {
                orderBy: { readingDate: 'desc' },
                take: 2 // Get last 2 readings to calculate consumption
            }
        }
    })

    let totalConsumption = 0
      // Calculate consumption from meter readings
    for (const meter of apartmentMeters) {
        if (meter.Readings.length >= 2) {
            const latestReading = meter.Readings[0]
            const previousReading = meter.Readings[1]
            const consumption = (latestReading.reading || 0) - (previousReading.reading || 0)
            totalConsumption += consumption
        }
    }

    // If no meter readings available, fall back to proportional
    if (totalConsumption === 0) {
        return calculateProportionalValues(apartment, dealershipReading)
    }

    // Calculate costs based on actual consumption
    const dealershipConsumption = dealershipReading.monthlyConsumption || 0
    const consumptionRatio = dealershipConsumption > 0 ? totalConsumption / dealershipConsumption : 0
    
    const baseCost = dealershipReading.consumptionValue || 0
    const sewageCost = dealershipReading.sewageValue || 0
    
    return {
        consumption: totalConsumption,
        totalConsumption: totalConsumption,
        consumptionCost: baseCost * consumptionRatio,
        sewageCost: sewageCost * consumptionRatio,
        partial: baseCost * consumptionRatio * 0.5,
        totalUnit: (baseCost + sewageCost) * consumptionRatio,
        kiteCarConsumption: dealershipReading.kiteCarConsumption ? (dealershipReading.kiteCarConsumption * consumptionRatio) : 0,
        kiteCarCost: dealershipReading.kiteCarTotal ? (dealershipReading.kiteCarTotal * consumptionRatio) : 0,
        consumptionGasValue: 0,
        totalGasValue: 0
    }
}
