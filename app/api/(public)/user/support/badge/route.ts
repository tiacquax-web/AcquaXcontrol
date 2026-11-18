// API: /api/user/support/badge — contador do "numerozinho" do menu Suporte
//
// Regra (o badge mostra o que está esperando VOCÊ):
//  - suporte (perfis de sistema): chamados abertos cuja última mensagem é do
//    solicitante OU que estão com mensagem não lida (unreadByAdmin). Assim o
//    número continua aparecendo mesmo depois de o atendente abrir o chamado,
//    até alguém do suporte responder;
//  - morador/síndico: chamados com resposta do suporte ainda não lida
//    (unreadByUser), que é limpo quando ele abre o chamado.
// Chamados encerrados (status 'closed') nunca contam.
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    // Somente perfis de sistema (Programador/Administrador) atendem todos os
    // chamados; síndico, administradora e morador veem apenas os próprios.
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isStaff = !!contexts.system;

    // deletedAt é tratado pelo middleware global de soft-delete (não filtrar aqui:
    // tickets novos têm o campo ausente, não null).
    const where: any = { status: { not: 'closed' } };
    if (!isStaff) where.userId = userId;

    const tickets = await prisma.supportTicket.findMany({
      where,
      select: {
        id: true,
        unreadByAdmin: true,
        unreadByUser: true,
        messages: {
          select: { isAdmin: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const count = tickets.reduce((total, ticket) => {
      if (isStaff) {
        const ultimaDoSolicitante = ticket.messages?.[0]?.isAdmin === false;
        const esperandoResposta = ultimaDoSolicitante || ticket.unreadByAdmin;
        return esperandoResposta ? total + 1 : total;
      }
      return ticket.unreadByUser ? total + 1 : total;
    }, 0);

    return NextResponse.json({ count, staff: isStaff });
  } catch (error: any) {
    console.error('[SUPPORT][BADGE] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
