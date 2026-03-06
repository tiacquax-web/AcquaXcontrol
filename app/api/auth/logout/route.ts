import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSessionValid } from '@/lib/users';

export async function POST(req: NextRequest) {
    // validate user session
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = validSession.userId;

    // delete session from database
    await prisma.session.deleteMany({ where: { userId } });

    // delete session cookie
    const response = NextResponse.redirect('/login', { status: 302 });
    response.cookies.delete('session');

    return response;
}
