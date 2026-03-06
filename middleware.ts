import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value;

  // Rotas públicas que não requerem autenticação
  const publicPaths = [
    '/api/auth',
    // '/api/services-layer', // TODO: Remove this line
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
  const authPaths = [
    '/login',
    '/signup',
  ];

  const isAuthPath = authPaths.some((path) => req.nextUrl.pathname.startsWith(path));
  const isFirstAccessPath = req.nextUrl.pathname.startsWith('/first-access');
  const isRootPath = req.nextUrl.pathname === '/';

  if (!token) {
    // Permitir acesso às rotas de autenticação mesmo sem token
    if (isAuthPath) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const response = await fetch(new URL('/api/auth/session', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (!data.valid) {
      // Criar uma resposta para excluir o cookie
      const redirectResponse = NextResponse.redirect(new URL('/login', req.url));
      redirectResponse.cookies.set('session', '', { path: '/', maxAge: 0 });
      return redirectResponse;
    }

    // Redirecionar usuários autenticados fora das rotas de autenticação
    if (data.mustUpdateCredentials) {
      if (!isFirstAccessPath) {
        return NextResponse.redirect(new URL('/first-access', req.url));
      }
      return NextResponse.next();
    }

    if (isAuthPath || isRootPath || isFirstAccessPath) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  } catch (e) {
    console.error(e);
    const redirectResponse = NextResponse.redirect(new URL('/login', req.url));
    redirectResponse.cookies.set('session', '', { path: '/', maxAge: 0 });
    return redirectResponse;
  }
}

// export const config = {
//     matcher: ['/dashboard/:path*', '/profile/:path*'], // Rotas protegidas
// };
