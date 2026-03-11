import { validateUserSession } from "@/lib/users"
import { ContextType } from "@prisma/client"
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

async function isSystemUser(userId: string): Promise<boolean> {
    const assignment = await prisma.roleAssignment.findFirst({
        where: {
            userId,
            contextType: ContextType.system,
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        select: { id: true },
    });
    return !!assignment;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'ID não informado.' }, { status: 400 });

        // Only system users can delete role assignments
        const isSystem = await isSystemUser(userId);
        if (!isSystem) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

        // Soft delete
        const roleAssignment = await prisma.roleAssignment.update({
            where: { id: entityId },
            data: { deletedAt: new Date() },
        });

        return NextResponse.json(roleAssignment);
    } catch (error: any) {
        console.error("Error deleting Role Assignment:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
