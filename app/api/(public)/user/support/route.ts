// API: /api/user/support — Lista e cria tickets de suporte
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const take = parseInt(req.nextUrl.searchParams.get('take') || '20');
    const skip = parseInt(req.nextUrl.searchParams.get('skip') || '0');
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const complexId = req.nextUrl.searchParams.get('complex_id') || undefined;
    const isAdminView = req.nextUrl.searchParams.get('admin') === 'true';

    // Verificar se é admin de sistema (programador ou administrador)
    // REGRA: somente perfis com contextType=system podem ver todos os tickets.
    // Síndicos, administradoras e demais perfis veem APENAS seus próprios tickets.
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!contexts.system; // exclusivamente system-level (Programador/Administrador)

    // deletedAt filter is handled globally by the Prisma soft-delete middleware.
    // Do NOT add explicit { deletedAt: null } here — newly created tickets have
    // the deletedAt field absent (not null), and the inner deletedAt: null would
    // still exclude them even after the middleware wraps with OR+isSet.
    const where: any = {};

    if (isAdminView && isAdmin) {
      // Admin vê todos os tickets (pode filtrar por condomínio)
      if (complexId) where.complexId = complexId;
    } else {
      // Usuário comum vê apenas seus próprios tickets
      where.userId = userId;
    }

    if (status) where.status = status;

    const [tickets, totalCount] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          complex: { select: { id: true, socialName: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ list: tickets, totalCount, isAdmin });
  } catch (error: any) {
    console.error('[SUPPORT] GET error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = validSession.userId;
    const body = await req.json();
    const { subject, message, complexId } = body;

    if (!subject?.trim()) return NextResponse.json({ error: 'Assunto obrigatório' }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 });

    const ticket = await prisma.supportTicket.create({
      data: {
        subject: subject.trim(),
        userId,
        complexId: complexId || undefined,
        unreadByAdmin: true,
        messages: {
          create: {
            senderId: userId,
            isAdmin: false,
            content: message.trim(),
          },
        },
      },
      include: {
        messages: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    console.error('[SUPPORT] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar chamado' }, { status: 500 });
  }
}
