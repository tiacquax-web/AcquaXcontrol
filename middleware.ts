import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Rotas de API: autenticação feita internamente em cada rota
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Rotas estáticas e públicas
  const publicPaths = [
    '/_next', '/favicon.ico', '/recover', '/politica-de-privacidade',
    '/logo-acquax.png', '/manifest.webmanifest', '/sw.js', '/offline',
    '/icons', '/.well-known', '/screenshots',
  ];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const authPaths = ['/login', '/signup', '/first-access'];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));
  const isRootPath = pathname === '/';
  const token = req.cookies.get('session')?.value;

  if (!token) {
    if (isAuthPath) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const mustUpdate = (payload as any).mustUpdateCredentials;

    // Usuário precisa trocar senha: só pode acessar /first-access
    if (mustUpdate) {
      if (pathname.startsWith('/first-access')) {
        return NextResponse.next(); // deixa passar normalmente
      }
      return NextResponse.redirect(new URL('/first-access', req.url));
    }

    // Usuário autenticado tentando acessar página de auth ou raiz: manda pro dashboard
    if (isAuthPath || isRootPath) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  } catch (_e) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set('session', '', { path: '/', maxAge: 0 });
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
