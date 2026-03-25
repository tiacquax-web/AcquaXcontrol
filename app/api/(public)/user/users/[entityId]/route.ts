import { cleanEntityBody } from "@/lib/prisma"
import prisma from "@/lib/prisma"
import { createEntity, deleteEntity, updateEntityData } from "@/lib/userData"
import { updateUser, validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        console.log("######### User ID:", userId)

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody({...reqBody}); // Clean the body to remove unwanted fields
        console.log("######### Request Body:", reqBody)

        console.log("######### Body:", body)

        // Validate request body
        if (!body) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No body was informed.' }, { status: 400 });

        console.log("######### Body:", body)
        // Extract entity ID from query parameters
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        console.log("######### Entity ID:", entityId)
        // Attempt to update the entity
        const { user, error: updateError, status: updateStatus } = await updateUser(entityId, body, userId);
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!user) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });

        if ('password' in user) {
            user.password = undefined; // Remove password from the response
        }

        // Return the updated entity data
        return NextResponse.json(user, {status: updateStatus});

    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error updating user:", error);
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
        if (!entityId) return NextResponse.json({ error: 'No entity id was informed. Set "entity_id" in the query params.' }, { status: 400 });

        // 🔒 PROTEÇÃO: impede deleção do usuário admin@acquax.com
        const targetUser = await prisma.user.findUnique({ where: { id: entityId } });
        if (targetUser?.email === 'admin@acquax.com') {
            return NextResponse.json({ error: 'Este usuário é protegido e não pode ser excluído.' }, { status: 403 });
        }

        // Attempt to delete the entity
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'user', entityId);
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        // Return the deleted entity data
        return NextResponse.json(entity);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error deleting user:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}