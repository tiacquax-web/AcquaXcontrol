import { NextResponse } from 'next/server';
import { getUserPermissions } from '@/lib/userContexts';
import { cookies } from 'next/headers';
import { isSessionValid } from '@/lib/users';

export async function GET() {
    // Recupera o token da sessão
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const validSession = await isSessionValid(session);
    if (!validSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = validSession.userId;
    // Busca permissões do usuário
    const permissions = await getUserPermissions(userId);
    return NextResponse.json(permissions);
}
