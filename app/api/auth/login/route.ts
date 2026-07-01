import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '@/lib/prisma';

// ─── Rate Limiter (in-memory, por IP) ─────────────────────────────────────────
// Máximo 5 tentativas por IP em janela de 5 minutos (300 segundos).
// Armazena: { count: number, resetAt: number (timestamp ms) }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

function getRateLimitEntry(ip: string) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    // Janela expirada ou novo IP: reinicia
    const fresh = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, fresh);
    return fresh;
  }
  return entry;
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const entry = getRateLimitEntry(ip);
  entry.count += 1;
  rateLimitStore.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// Limpeza periódica do store para evitar crescimento ilimitado em memória
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 10 * 60 * 1000); // A cada 10 minutos

// ─── Validação de Schema (Zod) ────────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email('E-mail inválido').max(254, 'E-mail muito longo'),
  password: z.string().min(1, 'Senha obrigatória').max(128, 'Senha muito longa'),
});

// ─── CORS helpers ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://acquaxcontrol.com.br',
  'https://www.acquaxcontrol.com.br',
];

function getAllowedOrigin(req: Request): string {
  if (process.env.NODE_ENV !== 'production') return '*';
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const JWT_SECRET = process.env.JWT_SECRET!;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': getAllowedOrigin(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export async function POST(req: Request) {
  // ── 1. Rate Limiting ────────────────────────────────────────────────────────
  const forwarded = (req.headers as any).get?.('x-forwarded-for') ?? '';
  const ip: string = forwarded ? String(forwarded).split(',')[0].trim() : 'unknown';
  const { allowed, retryAfterSeconds } = checkRateLimit(ip);

  if (!allowed) {
    console.warn(`[login] Rate limit excedido para IP: ${ip}`);
    return NextResponse.json(
      { error: `Muitas tentativas de login. Aguarde ${retryAfterSeconds} segundos e tente novamente.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'Access-Control-Allow-Origin': getAllowedOrigin(req),
        },
      }
    );
  }

  try {
    // ── 2. Validação do body com Zod ──────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido (JSON malformado).' }, { status: 400 });
    }

    const parsed = LoginSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? 'Dados inválidos.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // ── 3. Buscar usuário ─────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Mensagem genérica: não revela se o e-mail existe ou não
    if (!user) {
      console.warn('[login] E-mail não encontrado:', email);
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
    }

    // ── 4. Verificar senha ────────────────────────────────────────────────────
    const isPasswordValid = await compare(password, user.password);

    if (!isPasswordValid) {
      console.warn('[login] Senha incorreta para:', email);
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
    }

    // ── 5. Gerar JWT e sessão ─────────────────────────────────────────────────
    const token = jwt.sign(
      { userId: user.id, mustUpdateCredentials: user.mustUpdateCredentials ?? false },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const session = await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
        deletedAt: null,
      },
    });

    // ── 6. Zerar contador de tentativas ao logar com sucesso ──────────────────
    rateLimitStore.delete(ip);

    // ── 7. Montar resposta ────────────────────────────────────────────────────
    const response = NextResponse.json({
      message: 'Login successful',
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        mustUpdateCredentials: user.mustUpdateCredentials,
      },
    });

    response.headers.set('Access-Control-Allow-Origin', getAllowedOrigin(req));
    response.headers.set('Access-Control-Allow-Credentials', 'true');

    response.cookies.set('session', session.token, {
      httpOnly: true,
      maxAge: 60 * 60, // 1 hora
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    // Erro interno: não expor detalhes ao cliente
    console.error('[login] Erro interno:', error instanceof Error ? error.stack : error);
    // TEMP DEBUG - remover depois
    return NextResponse.json({ error: 'Erro interno. Tente novamente mais tarde.', _debug: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
