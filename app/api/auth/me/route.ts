import { NextRequest, NextResponse } from 'next/server';
import { getUserByValidSession, updateCurrentUser, validateUserSession } from '@/lib/users';

export async function GET(req: NextRequest): Promise<Response> {
    // Validate user session
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get session cookie
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    
    // Get user by valid session
    const user = await getUserByValidSession(session);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    if (user.id !== userId) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    return NextResponse.json({ user });
}

export async function PUT(req: NextRequest): Promise<Response> {
    // Validate user session
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get session cookie
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get user by valid session
    const user = await getUserByValidSession(session);
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get request body and validate it
    if (!req.body) {
        return NextResponse.json({ error: 'Nenhuma informação passada' }, { status: 400 });
    }
    
    const data = await req.json();

    if (!data || Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'Nenhuma informação passada' }, { status: 400 });
    }
    if (data.id && data.id !== user.id) {
        return NextResponse.json({ error: 'Você não pode editar outro usuário nessa funcionalidade.' }, { status: 403 });
    }
    
    // Update user data
    const { user: updatedUser, error: updateError, status: updateStatus } = await updateCurrentUser(user.id, data, userId, req);
    if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
    if (!updatedUser) return NextResponse.json({ error: 'Internal Server Error - Entity not updated' }, { status: 500 });


    // Remove password from the response
    if ('password' in updatedUser) {
        delete (updatedUser as any).password; // Remove password from the response
    }
    
    // Return the updated user data
    return NextResponse.json({user: updatedUser}, {status: updateStatus});
}