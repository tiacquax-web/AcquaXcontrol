// API: /api/user/suggestions/[suggestionId] — Detalhes e moderação de sugestão
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ suggestionId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { suggestionId } = await params;

    // Apenas admins podem moderar
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0;
    if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const body = await req.json();
    const { status, moderatorNote } = body;

    const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) return NextResponse.json({ error: 'Sugestão não encontrada' }, { status: 404 });

    const updated = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: {
        status: status || undefined,
        moderatorNote: moderatorNote !== undefined ? moderatorNote : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[SUGGESTION] PATCH error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ suggestionId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { suggestionId } = await params;

    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0;
    if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    await prisma.suggestion.update({
      where: { id: suggestionId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[SUGGESTION] DELETE error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
