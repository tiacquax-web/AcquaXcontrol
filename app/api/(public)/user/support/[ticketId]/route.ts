// API: /api/user/support/[ticketId] — Detalhes, atualização de status do ticket
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { ticketId } = await params;

    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    // Admin de sistema apenas (programador/administrador) — síndicos NÃO são admin de suporte
    const isAdmin = !!contexts.system;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        complex: { select: { id: true, socialName: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    if (!isAdmin && ticket.userId !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    // Marcar como lido pelo usuário correto
    if (isAdmin && ticket.unreadByAdmin) {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { unreadByAdmin: false },
      });
    } else if (!isAdmin && ticket.unreadByUser) {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { unreadByUser: false },
      });
    }

    return NextResponse.json({ ...ticket, isAdmin });
  } catch (error: any) {
    console.error('[SUPPORT_TICKET] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { ticketId } = await params;

    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    // Admin de sistema apenas (programador/administrador) — síndicos NÃO são admin de suporte
    const isAdmin = !!contexts.system;

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    if (!isAdmin && ticket.userId !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const body = await req.json();
    const { status } = body;

    // Apenas admin pode fechar/reabrir tickets
    if (status && !isAdmin && status !== 'closed') {
      return NextResponse.json({ error: 'Permissão insuficiente para alterar status' }, { status: 403 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: status || undefined },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[SUPPORT_TICKET] PATCH error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
