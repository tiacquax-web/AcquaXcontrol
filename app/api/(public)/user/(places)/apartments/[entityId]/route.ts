import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma"
import { deleteEntity, updateEntityData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function findActiveApartmentDuplicate(blockId: string, name: string, excludeId?: string) {
    const normalized = normalizeString(name);
    const activeInBlock = await prisma.apartment.findMany({
        where: {
            blockId,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, name: true },
    });

    return activeInBlock.find((apt) => normalizeString(apt.name) === normalized) || null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> } ): Promise<Response> {
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
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        const currentApartment = await prisma.apartment.findUnique({
            where: { id: entityId },
            select: { id: true, name: true, blockId: true },
        });
        if (!currentApartment) {
            return NextResponse.json({ error: 'Apartamento não encontrado.' }, { status: 404 });
        }

        const nextName = body.name !== undefined ? String(body.name).trim() : currentApartment.name;
        const nextBlockId = body.blockId !== undefined ? String(body.blockId).trim() : currentApartment.blockId;

        if (!nextName || !nextBlockId) {
            return NextResponse.json({ error: 'Nome e bloco são obrigatórios.' }, { status: 400 });
        }

        const duplicate = await findActiveApartmentDuplicate(nextBlockId, nextName, entityId);
        if (duplicate) {
            return NextResponse.json({ error: 'Já existe um apartamento com este nome no bloco selecionado.' }, { status: 409 });
        }

        // Attempt to update the entity
        const { entity, error: updateError, status: updateStatus } = await updateEntityData(userId, 'apartment', entityId, body);

        // Error handling
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });

        // Return the updated entity data
        return NextResponse.json(entity);

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error updating apartment:", error);
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
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        // Attempt to delete the entity
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'apartment', entityId);

        // Error handling
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        // Return the deleted entity data
        return NextResponse.json(entity);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error deleting apartment:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}