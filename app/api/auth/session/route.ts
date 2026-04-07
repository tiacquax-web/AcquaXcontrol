import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
    const { token } = await req.json();

    try {
        const session = await prisma.session.findUnique({
            where: { token },
            select: {
                expiresAt: true,
                deletedAt: true,
                user: {
                    select: {
                        mustUpdateCredentials: true
                    }
                }
            }
        });

        if (!session || session.deletedAt || new Date() > session.expiresAt) {
            const response = NextResponse.json({ valid: false }, { status: 401 });
            response.cookies.delete('session');

            return response;
        }

        return NextResponse.json({ 
            valid: true, 
            mustUpdateCredentials: session.user?.mustUpdateCredentials ?? false 
        }, { status: 200 });
    } catch (e) {
        const response = NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        response.cookies.delete('session');

        return response;
    }
}
