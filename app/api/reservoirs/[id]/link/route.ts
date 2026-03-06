import { updateEntityData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const reservoirId = (await params).id;

        // Parse request body
        const body = await req.json();
        const { complexId } = body;

        if (!complexId) {
            return NextResponse.json({ 
                error: 'complexId é obrigatório para vinculação' 
            }, { status: 400 });
        }

        // Update reservoir with complexId
        const { entity: updatedReservoir, error, status } = await updateEntityData(
            userId,
            'reservoir',
            reservoirId,
            { complexId }
        );

        if (error) return NextResponse.json({ error }, { status });
        if (!updatedReservoir) return NextResponse.json({ error: 'Falha ao vincular reservatório' }, { status: 500 });

        return NextResponse.json({ 
            reservoir: updatedReservoir,
            message: 'Reservatório vinculado ao condomínio com sucesso' 
        });

    } catch (error: any) {
        console.error('Error in POST /api/reservoirs/[id]/link:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const reservoirId = (await params).id;

        // Update reservoir removing complexId
        const { entity: updatedReservoir, error, status } = await updateEntityData(
            userId,
            'reservoir',
            reservoirId,
            { complexId: null }
        );

        if (error) return NextResponse.json({ error }, { status });
        if (!updatedReservoir) return NextResponse.json({ error: 'Falha ao desvincular reservatório' }, { status: 500 });

        return NextResponse.json({ 
            reservoir: updatedReservoir,
            message: 'Reservatório desvinculado do condomínio com sucesso' 
        });

    } catch (error: any) {
        console.error('Error in DELETE /api/reservoirs/[id]/link:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
