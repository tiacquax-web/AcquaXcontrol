import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
    const token = req.cookies.get('session')?.value;

    // Mesmo sem sessão válida, apaga o cookie e retorna OK
    // (não bloqueia o logout por falta de autenticação)
    if (token) {
        try {
            // Tenta deletar a sessão do banco (best-effort)
            await prisma.session.deleteMany({ where: { token } });
        } catch (_e) {
            // Ignora erros de banco — o cookie será apagado de qualquer forma
        }
    }

    // Apaga o cookie com as mesmas opções usadas na criação
    const proto = req.headers.get('x-forwarded-proto') ?? '';
    const isHttps = proto === 'https' || process.env.NODE_ENV === 'production';
    const response = NextResponse.json({ ok: true });
    response.cookies.set('session', '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: isHttps,
        expires: new Date(0),
    });

    return response;
}
