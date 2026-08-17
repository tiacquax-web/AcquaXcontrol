// API: /api/user/suggestions/[suggestionId]/vote — Votar em sugestão
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

function getVoterHash(req: NextRequest, userId: string): string {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  return crypto.createHash('sha256').update(`${userId}:${ip}`).digest('hex');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ suggestionId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { suggestionId } = await params;
    const body = await req.json();
    const { isLike } = body; // true = like, false = dislike

    if (typeof isLike !== 'boolean') {
      return NextResponse.json({ error: 'Voto inválido' }, { status: 400 });
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) return NextResponse.json({ error: 'Sugestão não encontrada' }, { status: 404 });

    const voterHash = getVoterHash(req, userId);

    // Verificar voto existente
    const existingVote = await prisma.suggestionVote.findUnique({
      where: { unique_suggestion_vote: { suggestionId, voterHash } },
    });

    let likes = suggestion.likes;
    let dislikes = suggestion.dislikes;

    if (existingVote) {
      if (existingVote.isLike === isLike) {
        // Remover voto (toggle)
        await prisma.suggestionVote.delete({ where: { id: existingVote.id } } as any);
        if (isLike) likes = Math.max(0, likes - 1);
        else dislikes = Math.max(0, dislikes - 1);

        await prisma.suggestion.update({ where: { id: suggestionId }, data: { likes, dislikes } });
        return NextResponse.json({ likes, dislikes, myVote: null });
      } else {
        // Trocar voto
        await prisma.suggestionVote.update({
          where: { id: existingVote.id },
          data: { isLike },
        });
        if (isLike) { likes++; dislikes = Math.max(0, dislikes - 1); }
        else { dislikes++; likes = Math.max(0, likes - 1); }
      }
    } else {
      // Novo voto
      await prisma.suggestionVote.create({ data: { suggestionId, voterHash, isLike } });
      if (isLike) likes++;
      else dislikes++;
    }

    const updated = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: { likes, dislikes },
    });

    return NextResponse.json({ likes: updated.likes, dislikes: updated.dislikes, myVote: isLike ? 'like' : 'dislike' });
  } catch (error: any) {
    console.error('[VOTE] POST error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
