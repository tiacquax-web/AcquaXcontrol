import { NextRequest, NextResponse } from 'next/server';
import { getUserByValidSession, updateUser } from '@/lib/users';
import { validateUserSession } from '@/lib/users';

// GET: Retorna as preferências do usuário autenticado
export async function GET(req: NextRequest): Promise<Response> {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = await getUserByValidSession(session);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    return NextResponse.json( user.preferences ?? {} );
}

// PUT: Atualiza as preferências do usuário autenticado
export async function PUT(req: NextRequest): Promise<Response> {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = await getUserByValidSession(session);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const data = await req.json();
    if (!data || !Array.isArray(data.meters) || data.meters.length > 2) {
        return NextResponse.json({ error: 'Você deve informar até dois medidores.' }, { status: 400 });
    }    // Atualiza apenas o campo preferences diretamente no banco sem verificações de permissão
    // pois o usuário está atualizando suas próprias preferências
    const preferences = { ...(typeof user.preferences === 'object' && user.preferences !== null ? user.preferences : {}), meters: data.meters };
    
    try {
        // Importa o prisma e atualiza diretamente
        const { default: prisma } = await import('@/lib/prisma');
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { preferences, updatedByUserId: userId },
        });
        
        return NextResponse.json({ preferences: updatedUser.preferences }, { status: 200 });
    } catch (error) {
        console.error("Error updating user preferences:", error);
        return NextResponse.json({ error: 'Erro interno ao atualizar preferências' }, { status: 500 });
    }
}
