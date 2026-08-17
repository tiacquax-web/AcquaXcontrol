// API: /api/user/support/[ticketId]/messages — Envio de mensagens no ticket
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const { ticketId } = await params;
    const body = await req.json();
    const { content, attachmentUrl } = body;

    if (!content?.trim()) return NextResponse.json({ error: 'Mensagem não pode ser vazia' }, { status: 400 });

    // Admin de sistema apenas (programador/administrador) — síndicos NÃO respondem como admin
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!contexts.system;

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    if (!isAdmin && ticket.userId !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (ticket.status === 'closed') return NextResponse.json({ error: 'Ticket encerrado. Abra um novo chamado.' }, { status: 400 });

    const message = await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        isAdmin,
        content: content.trim(),
        attachmentUrl: attachmentUrl || undefined,
      },
    });

    // Atualizar notificações e status do ticket
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: isAdmin ? 'answered' : 'open',
        unreadByUser: isAdmin ? true : false,    // Admin respondeu → user não leu
        unreadByAdmin: isAdmin ? false : true,   // User enviou → admin não leu
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    console.error('[SUPPORT_MSG] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao enviar mensagem' }, { status: 500 });
  }
}
