import { NextRequest, NextResponse } from 'next/server';
import { getUserByValidSession, updateCurrentUser, validateUserSession } from '@/lib/users';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

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
    const oldSessionToken = req.cookies.get('session')?.value;
    if (!oldSessionToken) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get user by valid session
    const user = await getUserByValidSession(oldSessionToken);
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
        delete (updatedUser as any).password;
    }

    // Se o usuário tinha mustUpdateCredentials=true e agora é false (trocou senha),
    // reemite o cookie de sessão com o JWT atualizado para o middleware não redirecionar mais.
    const hadMustUpdate = user.mustUpdateCredentials;
    const nowMustUpdate = (updatedUser as any).mustUpdateCredentials;
    if (hadMustUpdate && !nowMustUpdate) {
        try {
            // Cria novo token JWT sem mustUpdateCredentials
            const newJwt = jwt.sign(
                { userId: user.id, mustUpdateCredentials: false },
                JWT_SECRET,
                { expiresIn: '1h' }
            );
            // Substitui a sessão antiga no banco pelo novo token
            await prisma.session.updateMany({
                where: { token: oldSessionToken, userId: user.id },
                data: {
                    token: newJwt,
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
            const response = NextResponse.json({ user: updatedUser }, { status: updateStatus });
            response.cookies.set('session', newJwt, {
                httpOnly: true,
                maxAge: 60 * 60,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            });
            return response;
        } catch (e) {
            console.error('[me PUT] Erro ao reemitir sessão:', e);
            // Continua e retorna resposta normal mesmo se falhar a reemissão
        }
    }
    
    // Return the updated user data
    return NextResponse.json({ user: updatedUser }, { status: updateStatus });
}
