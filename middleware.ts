import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Deixa todas as rotas de API passarem — autenticação é feita em cada rota individualmente
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Rotas estáticas e públicas
  const publicPaths = [
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

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Rotas de autenticação (login/signup/first-access)
  const authPaths = ['/login', '/signup', '/first-access'];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));
  const isRootPath = pathname === '/';

  // Pega token do cookie session
  const token = req.cookies.get('session')?.value;

  if (!token) {
    if (isAuthPath) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    // Verifica JWT diretamente
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Verifica se precisa atualizar credenciais
    const mustUpdate = (payload as any).mustUpdateCredentials;
    if (mustUpdate && !pathname.startsWith('/first-access')) {
      return NextResponse.redirect(new URL('/first-access', req.url));
    }

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

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
