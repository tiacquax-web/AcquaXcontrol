import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { toggleComplexSuspension } from '@/lib/services/suspension-service';
import prisma from '@/lib/prisma';

/**
 * PATCH /api/user/complexes/{id}/suspend
 * Suspende (suspend=true) ou reativa (suspend=false) um condomínio.
 * Apenas usuários com contexto 'system' (admin/programador) podem suspender.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Verificar se o usuário é admin/programador (contextType: 'system')
    const assignments = await prisma.roleAssignment.findMany({
        where: {
            userId,
            contextType: 'system',
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        select: { id: true },
    });

    if (assignments.length === 0) {
        return NextResponse.json({ error: 'Apenas administradores podem suspender condomínios.' }, { status: 403 });
    }

    const { entityId } = await params;
    if (!entityId) return NextResponse.json({ error: 'ID do condomínio não informado.' }, { status: 400 });

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
    }

    const suspend = body.suspend === true;

    try {
        const updated = await toggleComplexSuspension(entityId, suspend);
        return NextResponse.json({
            message: suspend ? 'Condomínio suspenso com sucesso.' : 'Condomínio reativado com sucesso.',
            complex: updated,
        });
    } catch (error: any) {
        console.error('[suspend] Erro:', error);
        return NextResponse.json({ error: error.message || 'Erro ao suspender condomínio.' }, { status: 500 });
    }
}
