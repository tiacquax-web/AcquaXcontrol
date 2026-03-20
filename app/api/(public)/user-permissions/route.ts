import { NextRequest, NextResponse } from 'next/server';
import { getUserPermissions } from '@/lib/userContexts';
import { validateUserSession } from '@/lib/users';

export async function GET(req: NextRequest) {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError || !userId) {
        return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: sessionStatus || 401 });
    }

    // Busca permissões do usuário
    const permissions = await getUserPermissions(userId);
    return NextResponse.json(permissions);
}
