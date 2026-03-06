import { cleanEntityBody } from "@/lib/prisma";
import { deleteEntity, updateEntityData } from "@/lib/userData";
import { validateUserSession } from "@/lib/users";
import { NextRequest, NextResponse } from "next/server";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed.' }, { status: 400 });

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        // Attempt to update the entity
        const { entity, error: updateError, status: updateStatus } = await updateEntityData(userId, 'apartmentConsumptionReport', entityId, body);
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
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed.' }, { status: 400 });

        // Attempt to delete the entity
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'apartmentConsumptionReport', entityId);
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