import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'acquax-super-secret-jwt-key-2024';

// ─── Rate limiting (in-memory, resets on cold start) ──────────────────────────
// Para produção escalável, substitua por Upstash Redis
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
    return true; // allowed
  }

  if (entry.count >= limit) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

// Limpa entradas antigas periodicamente (evita memory leak)
let lastCleanup = Date.now();
function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // só limpa a cada 1 min
  lastCleanup = now;
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}

// ─── Security headers ─────────────────────────────────────────────────────────
function addSecurityHeaders(res: NextResponse): NextResponse {
  // Prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // XSS Protection (legacy browsers)
  res.headers.set('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy — desabilita recursos desnecessários
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  // HSTS — força HTTPS por 1 ano
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  // Content Security Policy
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js precisa de unsafe-inline/eval
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.acquaxcontrol.com.br https://www.acquaxcontrol.com.br",
      "font-src 'self' data:",
      "connect-src 'self' https://acquaxcontrol.com.br https://cdn.acquaxcontrol.com.br",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  return res;
}

// ─── Suspicious pattern detection ────────────────────────────────────────────
const SUSPICIOUS_PATTERNS = [
  // SQL Injection
  /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDROP\b|\bDELETE\b|\bUPDATE\b|\bEXEC\b)/i,
  // XSS
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  // Path traversal
  /\.\.[/\\]/,
  // Command injection
  /[;&|`$(){}[\]]/,
  // LDAP injection
  /[*)(\\]/,
  // Null bytes
  /\x00/,
];

function isSuspiciousRequest(req: NextRequest): boolean {
  const url = decodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(url));
}

// ─── Blocked User Agents (bots, scanners, crawlers maliciosos) ───────────────
const BLOCKED_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /python-requests\/2\.[01]/i, // versões antigas de bots
  /curl\/7\.[0-4]/i,           // versões antigas de curl (bots)
  /wget\//i,
  /scrapy/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /\bscan\b/i,
  /\bhacker\b/i,
  /\bexploit\b/i,
  /dirbuster/i,
  /gobuster/i,
  /burpsuite/i,
  /metasploit/i,
  /hydra/i,
  /havij/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /w3af/i,
  /wfuzz/i,
  /\bbot\b.*\bhack/i,
];

function isBlockedUserAgent(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || '';
  return BLOCKED_USER_AGENTS.some((pattern) => pattern.test(ua));
}

// ─── Honeypot paths (rotas que nenhum usuário real deveria acessar) ───────────
const HONEYPOT_PATHS = [
  '/wp-admin', '/wp-login', '/wp-content', '/wordpress',
  '/phpmyadmin', '/pma', '/myadmin', '/mysqladmin',
  '/admin.php', '/administrator', '/panel',
  '/.env', '/.git', '/.svn', '/.htaccess', '/.htpasswd',
  '/etc/passwd', '/etc/shadow',
  '/config.php', '/configuration.php', '/config.js',
  '/shell', '/c99', '/r57', '/webshell',
  '/xmlrpc.php', '/cgi-bin', '/cgi',
  '/backup', '/db_backup', '/database',
  '/debug', '/info.php', '/phpinfo',
  '/actuator', '/metrics', '/health/env',
];

function isHoneypotPath(pathname: string): boolean {
  return HONEYPOT_PATHS.some(
    (hp) => pathname.toLowerCase().startsWith(hp.toLowerCase())
  );
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

  // ── 2. Block honeypot paths (scanners / bots) ──
  if (isHoneypotPath(pathname)) {
    // Retorna 404 para não confirmar a existência do sistema
    return new NextResponse('Not Found', { status: 404 });
  }

  // ── 3. Block suspicious URL patterns (injection attempts) ──
  if (isSuspiciousRequest(req)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // ── 4. Rate limiting por IP ──
  const isAuthEndpoint = pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/signup') ||
    pathname.startsWith('/api/auth/recover');

  if (isAuthEndpoint) {
    // Autenticação: 10 tentativas por minuto por IP (anti brute-force)
    if (!rateLimit(ip, 10, 60_000)) {
      const res = new NextResponse(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde 1 minuto.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
      res.headers.set('Retry-After', '60');
      return addSecurityHeaders(res);
    }
  } else if (pathname.startsWith('/api/')) {
    // APIs gerais: 200 req por minuto por IP
    if (!rateLimit(ip, 200, 60_000)) {
      const res = new NextResponse(
        JSON.stringify({ error: 'Rate limit excedido.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
      res.headers.set('Retry-After', '60');
      return addSecurityHeaders(res);
    }
  } else {
    // Páginas: 100 req por minuto por IP
    if (!rateLimit(ip, 100, 60_000)) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  // ── 5. Rotas de API — autenticação feita internamente em cada rota ──
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next();
    return addSecurityHeaders(res);
  }

  // ── 6. Rotas estáticas e públicas ──
  const publicPaths = [
    '/_next', '/favicon.ico', '/recover', '/politica-de-privacidade',
    '/logo-acquax.png', '/manifest.webmanifest', '/sw.js', '/offline',
    '/icons', '/.well-known', '/screenshots',
  ];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    const res = NextResponse.next();
    return addSecurityHeaders(res);
  }

  // ── 7. Autenticação JWT ──
  const authPaths = ['/login', '/signup', '/first-access'];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));
  const isRootPath = pathname === '/';
  const token = req.cookies.get('session')?.value;

  if (!token) {
    if (isAuthPath) {
      const res = NextResponse.next();
      return addSecurityHeaders(res);
    }
    const res = NextResponse.redirect(new URL('/login', req.url));
    return addSecurityHeaders(res);
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const mustUpdate = (payload as any).mustUpdateCredentials;

    if (mustUpdate) {
      if (pathname.startsWith('/first-access')) {
        const res = NextResponse.next();
        return addSecurityHeaders(res);
      }
      const res = NextResponse.redirect(new URL('/first-access', req.url));
      return addSecurityHeaders(res);
    }

    if (isAuthPath || isRootPath) {
      const res = NextResponse.redirect(new URL('/dashboard', req.url));
      return addSecurityHeaders(res);
    }

    const res = NextResponse.next();
    return addSecurityHeaders(res);
  } catch (_e) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set('session', '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
    return addSecurityHeaders(res);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
