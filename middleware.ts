import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

// ─── Rate limiting (in-memory, resets on cold start) ──────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

let lastCleanup = Date.now();
function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}

// ─── Security headers (safe, sem HSTS preload que conflita com Cloudflare) ────
function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  return res;
}

// ─── Blocked User Agents (bots e scanners conhecidos) ────────────────────────
const BLOCKED_UA_STRINGS = [
  'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab',
  'scrapy', 'libwww-perl', 'dirbuster', 'gobuster',
  'burpsuite', 'metasploit', 'hydra', 'havij',
  'acunetix', 'nessus', 'openvas', 'w3af', 'wfuzz',
];

function isBlockedUserAgent(req: NextRequest): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  return BLOCKED_UA_STRINGS.some((s) => ua.includes(s));
}

// ─── Honeypot paths (rotas que nenhum usuário real deveria acessar) ───────────
const HONEYPOT_PATHS = [
  '/wp-admin', '/wp-login', '/wp-content', '/wordpress',
  '/phpmyadmin', '/pma', '/myadmin', '/mysqladmin',
  '/admin.php', '/administrator',
  '/.env', '/.git', '/.svn', '/.htaccess', '/.htpasswd',
  '/etc/passwd', '/etc/shadow',
  '/config.php', '/configuration.php',
  '/shell', '/c99', '/r57', '/webshell',
  '/xmlrpc.php', '/cgi-bin',
  '/debug', '/info.php', '/phpinfo',
  '/actuator', '/health/env',
];

function isHoneypotPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return HONEYPOT_PATHS.some((hp) => lower.startsWith(hp));
}

// ─── Main middleware ──────────────────────────────────────────────────────────
export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const ip = getClientIp(req);

  cleanupRateLimitMap();

  // ── 1. Block malicious user agents ──
  if (isBlockedUserAgent(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // ── 2. Block honeypot paths ──
  if (isHoneypotPath(pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // ── 3. Rate limiting ──
  const isAuthEndpoint =
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/signup') ||
    pathname.startsWith('/api/auth/recover');

  if (isAuthEndpoint) {
    if (!rateLimit(ip, 10, 60_000)) {
      const res = new NextResponse(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde 1 minuto.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
      res.headers.set('Retry-After', '60');
      return addSecurityHeaders(res);
    }
  } else if (pathname.startsWith('/api/')) {
    if (!rateLimit(ip, 300, 60_000)) {
      const res = new NextResponse(
        JSON.stringify({ error: 'Rate limit excedido.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
      res.headers.set('Retry-After', '60');
      return addSecurityHeaders(res);
    }
  } else {
    if (!rateLimit(ip, 150, 60_000)) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  // ── 4. API routes — auth handled per-route ──
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next();
    return addSecurityHeaders(res);
  }

  // ── 5. Static & public paths ──
  const publicPaths = [
    '/_next', '/favicon.ico', '/recover', '/politica-de-privacidade',
    '/logo-acquax.png', '/manifest.webmanifest', '/sw.js', '/offline',
    '/icons', '/.well-known', '/screenshots', '/logo-quadrada',
    '/news/', '/services/', '/public/', '/suspended',
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    return addSecurityHeaders(res);
  }

  // ── 6. JWT Authentication ──
  const authPaths = ['/login', '/signup', '/first-access', '/suspended'];
  const isAuthPath = authPaths.some((p) => pathname.startsWith(p));
  const isRootPath = pathname === '/';
  const token = req.cookies.get('session')?.value;

  if (!token) {
    if (isAuthPath) {
      return addSecurityHeaders(NextResponse.next());
    }
    // Sem token → redireciona para login
    const loginUrl = new URL('/login', req.url);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const mustUpdate = (payload as any).mustUpdateCredentials;

    if (mustUpdate) {
      if (pathname.startsWith('/first-access')) {
        return addSecurityHeaders(NextResponse.next());
      }
      return addSecurityHeaders(
        NextResponse.redirect(new URL('/first-access', req.url))
      );
    }

    // Usuário autenticado tentando acessar páginas de auth → redireciona para dashboard
    if (isAuthPath || isRootPath) {
      return addSecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', req.url))
      );
    }

    return addSecurityHeaders(NextResponse.next());
  } catch {
    // Token inválido/expirado → limpa cookie e redireciona para login
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set('session', '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    return addSecurityHeaders(res);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
