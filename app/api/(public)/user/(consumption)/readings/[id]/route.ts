import { cleanEntityBody } from "@/lib/prisma";
import { updateEntityData } from "@/lib/userData";
import { validateUserSession } from "@/lib/users";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    // Valida sessão do usuário
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    // Obtém o id da leitura
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID da leitura não identificado" }, { status: 400 });

    // Lê e limpa o body
    const reqBody = await req.json();
    const body = cleanEntityBody(reqBody);
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Body não identificado." }, { status: 400 });
    }

    // Atualiza a leitura
    const { entity, error, status } = await updateEntityData(userId, 'reading', id, body);
    if (error) return NextResponse.json({ error }, { status });
    if (!entity) return NextResponse.json({ error: "Erro interno - Entidade não pôde ser atualizada. Se permanecer, contate o suporte" }, { status: 500 });

    return NextResponse.json(entity);
  } catch (error: any) {
    console.error("Error updating reading:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
