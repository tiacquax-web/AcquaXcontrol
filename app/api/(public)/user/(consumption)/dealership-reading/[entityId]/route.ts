import { cleanEntityBody } from "@/lib/prisma"
import { deleteEntity, updateEntityData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { DealershipReading } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
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

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed.' }, { status: 400 });

        
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

        // Attempt to update the entity
        const { entity, error: updateError, status: updateStatus } = await updateEntityData(userId, 'dealershipReading', entityId, bodyData);
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });

        // Return the updated entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error updating apartment report:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed.' }, { status: 400 });

        // Attempt to delete the entity
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'dealershipReading', entityId);
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        // Return the deleted entity data
        return NextResponse.json(entity);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error deleting apartment report:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}