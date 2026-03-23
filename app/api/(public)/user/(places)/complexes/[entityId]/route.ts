import { cleanEntityBody } from "@/lib/prisma"
import { createEntity, deleteEntity, updateEntityData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validar sessão do usuário
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        console.log("######### User ID:", userId)

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Limpa o corpo para remover campos indesejados

        console.log("######### Body:", body)

        // Validar corpo da requisição
        if (!body) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });
        if (Object.keys(body).length === 0) return NextResponse.json({ error: 'Nenhum corpo foi informado.' }, { status: 400 });

        console.log("######### Body:", body)
        // Extrair ID da entidade dos parâmetros
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'Nenhum ID de entidade foi informado. Defina "entity_id" nos parâmetros da query.' }, { status: 400 });

        console.log("######### Entity ID:", entityId)
        // Tentar atualizar a entidade
        const { entity, error: updateError, status: updateStatus } = await updateEntityData(userId, 'complex', entityId, body);
        if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
        if (!entity) return NextResponse.json({ error: 'Erro interno do servidor - Entidade não atualizada' }, { status: 500 });

        // Retornar os dados da entidade atualizada
        return NextResponse.json(entity);

    } catch (error: any) {
        // Logar e tratar erros inesperados
        console.error("Erro ao atualizar complexo:", error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    try {
        // Validar sessão do usuário
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const deleteChildren = req.nextUrl.searchParams.get('deleteChildren') === 'true';

        // Extrair ID da entidade dos parâmetros
        const { entityId } = await params;
        if (!entityId) return NextResponse.json({ error: 'Nenhum ID de entidade foi informado. Defina "entity_id" nos parâmetros da query.' }, { status: 400 });

        // Tentar deletar a entidade
        const { entity, error: deletionError, status: deletionStatus } = await deleteEntity(userId, 'complex', entityId, { deleteChildren });
        if (deletionError) return NextResponse.json({ error: deletionError }, { status: deletionStatus });
        if (!entity) return NextResponse.json({ error: 'Erro interno do servidor - Entidade não deletada' }, { status: 500 });

        // Retornar os dados da entidade deletada
        return NextResponse.json(entity);
    } catch (error: any) {
        // Logar e tratar erros inesperados
        console.error("Erro ao deletar complexo:", error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}