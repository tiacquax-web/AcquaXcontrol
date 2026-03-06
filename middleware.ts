import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value;

  // Rotas públicas que não requerem autenticação
  const publicPaths = [
    '/api/auth',
    '/_next',
    '/favicon.ico',
    '/recover',
    '/politica-de-privacidade',
    '/logo-acquax.png',
    '/manifest.webmanifest',
    '/sw.js',
    '/offline',
    '/icons',
    '/.well-known',
    '/screenshots',
  ];

  if (publicPaths.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Rotas de autenticação
  const authPaths = ['/login', '/signup'];
  const isAuthPath = authPaths.some((path) => req.nextUrl.pathname.startsWith(path));
  const isFirstAccessPath = req.nextUrl.pathname.startsWith('/first-access');
  const isRootPath = req.nextUrl.pathname === '/';

  if (!token) {
    if (isAuthPath) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    // Verifica o JWT diretamente (sem fetch externo)
    const secret = new TextEncoder().encode(JWT_SECRET);
    await jwtVerify(token, secret);

    // Token válido — redireciona autenticado fora de auth pages
    if (isAuthPath || isRootPath) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  } catch (e) {
    // Token inválido ou expirado
    const redirectResponse = NextResponse.redirect(new URL('/login', req.url));
    redirectResponse.cookies.set('session', '', { path: '/', maxAge: 0 });
    return redirectResponse;
  }
}
