import { cleanEntityBody } from "@/lib/prisma";
import { deleteEntity, updateEntityData } from "@/lib/userData";
import { validateUserSession } from "@/lib/users";
import { Meter } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();
        console.log("######### Request body ANTES da limpeza:", reqBody);
        
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields
        console.log("######### Request body DEPOIS da limpeza:", body);

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed.' }, { status: 400 });

        // Garantir que o register seja salvo em uppercase se estiver sendo atualizado
        if (body.register && typeof body.register === 'string') {
            body.register = body.register.toUpperCase();
        }

        // if (body.location) delete body.location; // Remove location if present in the body
        // if (body.deviceId) delete body.deviceId; // Remove deviceId if present in the body

        // console.log("######### Request body!", body);

        // body.initialReading = body.initialReading ? parseFloat(body.initialReading) : undefined; // Parse initialReading to float if present

        // Attempt to update the entity
        const { entity, error: updateError, status: updateStatus } = await updateEntityData(userId, 'meter', entityId, body);

        // Error handling
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });

        // Return the updated entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error updating meter:", error);
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
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'meter', entityId);

        // Error handling
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        // Return the deleted entity data
        return NextResponse.json(entity);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error deleting meter:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}