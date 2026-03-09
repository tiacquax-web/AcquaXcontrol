import { NextRequest, NextResponse } from 'next/server';
import { getUserByValidSession, updateCurrentUser, validateUserSession } from '@/lib/users';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

export async function GET(req: NextRequest): Promise<Response> {
    // Validate user session (aceita cookie JWT mesmo sem sessão no banco)
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Tenta buscar usuário pela sessão no banco, senão busca direto pelo userId do JWT
    const sessionCookie = req.cookies.get('session')?.value;
    let user = sessionCookie ? await getUserByValidSession(sessionCookie) : null;

    // Fallback: busca o usuário direto pelo userId (quando sessão não está mais no banco)
    if (!user) {
        user = await prisma.user.findUnique({ where: { id: userId } }) as any;
    }

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if ((user as any).id !== userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });

    // Remove senha da resposta
    const userResponse = { ...(user as any) };
    delete userResponse.password;

    return NextResponse.json({ user: userResponse });
}

export async function PUT(req: NextRequest): Promise<Response> {
    // Validate user session
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Tenta buscar usuário pela sessão no banco, senão busca direto pelo userId do JWT
    const oldSessionToken = req.cookies.get('session')?.value;
    let user = oldSessionToken ? await getUserByValidSession(oldSessionToken) : null;

    // Fallback: busca o usuário direto pelo userId (quando sessão não está mais no banco)
    if (!user) {
        user = await prisma.user.findUnique({ where: { id: userId } }) as any;
    }

    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get request body and validate it
    if (!req.body) {
        return NextResponse.json({ error: 'Nenhuma informação passada' }, { status: 400 });
    }
    
    const data = await req.json();

    if (!data || Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'Nenhuma informação passada' }, { status: 400 });
    }
    if (data.id && data.id !== (user as any).id) {
        return NextResponse.json({ error: 'Você não pode editar outro usuário nessa funcionalidade.' }, { status: 403 });
    }
    
    // Update user data
    const passwordBeingChanged = !!(data as any).password;
    const { user: updatedUser, error: updateError, status: updateStatus } = await updateCurrentUser((user as any).id, data, userId, req);
    if (updateError) return NextResponse.json({ error: updateError }, { status: updateStatus });
    if (!updatedUser) return NextResponse.json({ error: 'Erro interno — entidade não atualizada.' }, { status: 500 });

    // Remove password from the response
    if ('password' in updatedUser) {
        delete (updatedUser as any).password;
    }

    // ── Rotação de Sessão ────────────────────────────────────────────────────
    // Quando a senha é trocada (voluntária ou forçada via mustUpdateCredentials):
    // 1. Invalida TODAS as sessões antigas do usuário no banco (session fixation + logout em outros dispositivos)
    // 2. Emite um novo JWT e cria uma nova sessão
    // 3. Define o cookie com o novo token
    const hadMustUpdate = (user as any).mustUpdateCredentials;
    const nowMustUpdate = (updatedUser as any).mustUpdateCredentials;
    const shouldRotateSession = passwordBeingChanged || (hadMustUpdate && !nowMustUpdate);

    if (shouldRotateSession) {
        try {
            // 1. Invalida todas as sessões antigas do usuário (segurança: evita session fixation)
            await prisma.session.deleteMany({
                where: { userId: (user as any).id },
            }).catch(() => {/* best-effort */});

            // 2. Emite novo JWT
            const newJwt = jwt.sign(
                { userId: (user as any).id, mustUpdateCredentials: false },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            // 3. Cria nova sessão no banco
            await prisma.session.create({
                data: {
                    token: newJwt,
                    userId: (user as any).id,
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                }
            }).catch(() => {/* se falhar, o cookie JWT ainda é válido */});

            // 4. Retorna resposta com novo cookie
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
            console.error('[me PUT] Erro ao rotacionar sessão:', e);
            // Não falha o request por isso — retorna sem rotação
        }
    }
    
    // Return the updated user data
    return NextResponse.json({ user: updatedUser }, { status: updateStatus });
}
