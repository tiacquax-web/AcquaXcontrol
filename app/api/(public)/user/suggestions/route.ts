// API: /api/user/suggestions — Lista e cria sugestões públicas
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

function getVoterHash(req: NextRequest, userId: string): string {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  return crypto.createHash('sha256').update(`${userId}:${ip}`).digest('hex');
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (validSession as any).userId as string;
    const take = Math.min(parseInt(req.nextUrl.searchParams.get('take') || '20'), 100);
    const skip = Math.max(parseInt(req.nextUrl.searchParams.get('skip') || '0'), 0);
    const statusParam = req.nextUrl.searchParams.get('status') || undefined;
    const search = req.nextUrl.searchParams.get('search') || undefined;
    const orderByParam = req.nextUrl.searchParams.get('orderBy') || 'likes'; // likes | createdAt

    // ── Determine admin status ──────────────────────────────────────────────────
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!(
      contexts.system ||
      contexts.companyIds.length > 0 ||
      contexts.complexIds.length > 0
    );

    // ── Build WHERE clause ──────────────────────────────────────────────────────
    // NOTE: the soft-delete filter (deletedAt) is injected automatically by the
    // global Prisma middleware in lib/prisma.ts for all read operations.
    // This route only needs to express business-logic filters (status, search).
    const conditions: any[] = [];

    // Status filter
    if (statusParam) {
      if (isAdmin) {
        // Admin can filter by any status, including 'rejected'
        conditions.push({ status: statusParam });
      } else {
        const allowed = ['open', 'analyzing', 'approved', 'implemented'];
        // Non-admin requesting a hidden status → silently constrain to allowed set
        conditions.push({ status: allowed.includes(statusParam) ? statusParam : { in: allowed } });
      }
    } else if (!isAdmin) {
      // No status filter + non-admin → hide rejected
      conditions.push({ status: { in: ['open', 'analyzing', 'approved', 'implemented'] } });
    }
    // isAdmin + no statusParam → no status filter → sees all statuses

    // Full-text search on content
    if (search) {
      conditions.push({ content: { contains: search, mode: 'insensitive' } });
    }

    // Compose: no conditions → empty where (middleware adds deletedAt filter);
    // one condition → pass directly; multiple → AND array.
    const where: any =
      conditions.length === 0 ? {} :
      conditions.length === 1 ? conditions[0] :
      { AND: conditions };

    // ── Voter hash for "did I vote on this?" ────────────────────────────────────
    const voterHash = getVoterHash(req, userId);

    // ── Query ───────────────────────────────────────────────────────────────────
    const [suggestions, totalCount] = await Promise.all([
      prisma.suggestion.findMany({
        where,
        include: {
          votes: {
            where: { voterHash },
            select: { isLike: true },
          },
        },
        orderBy: orderByParam === 'likes' ? { likes: 'desc' } : { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.suggestion.count({ where }),
    ]);

    // ── Map — keep authorId private from non-admins ─────────────────────────────
    const mapped = suggestions.map(s => ({
      id: s.id,
      content: s.content,
      status: s.status,
      likes: s.likes,
      dislikes: s.dislikes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      moderatorNote: isAdmin ? s.moderatorNote : undefined,
      authorId: isAdmin ? s.authorId : undefined,
      myVote: s.votes.length > 0 ? (s.votes[0].isLike ? 'like' : 'dislike') : null,
    }));

    return NextResponse.json({ list: mapped, totalCount, isAdmin });

  } catch (error: any) {
    console.error('[SUGGESTIONS] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (validSession as any).userId as string;
    const body = await req.json();
    const { content } = body;

    if (!content?.trim() || content.trim().length < 10) {
      return NextResponse.json({ error: 'Sugestão deve ter no mínimo 10 caracteres' }, { status: 400 });
    }
    if (content.trim().length > 2000) {
      return NextResponse.json({ error: 'Sugestão deve ter no máximo 2000 caracteres' }, { status: 400 });
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        content: content.trim(),
        authorId: userId,
      },
    });

    return NextResponse.json({
      id: suggestion.id,
      content: suggestion.content,
      status: suggestion.status,
      likes: suggestion.likes,
      dislikes: suggestion.dislikes,
      createdAt: suggestion.createdAt,
      myVote: null,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[SUGGESTIONS] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao salvar sugestão' }, { status: 500 });
  }
}
