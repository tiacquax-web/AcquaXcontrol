import { deleteEntity } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'ID não informado.' }, { status: 400 });
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'roleAssignment', entityId);
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Internal Server Error - Entity not deleted' }, { status: 500 });

        return NextResponse.json(entity);
    } catch (error: any) {
        console.error("Error deleting Role Assignment:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
