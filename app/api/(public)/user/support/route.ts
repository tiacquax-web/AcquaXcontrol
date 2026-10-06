// API: /api/user/support — Lista e cria tickets de suporte
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { getUserLocations, getUserLocation } from '@/lib/user-location';
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

    // ── Condomínio do solicitante (fallback quando o ticket não tem complexId) ──
    // Muitos tickets antigos foram criados sem vincular o condomínio. Resolvemos
    // a localização do usuário via RoleAssignments para nunca exibir "sem condomínio".
    const needsFallback = tickets.filter(t => !t.complexId && t.userId).map(t => t.userId);
    const locationMap = needsFallback.length
      ? await getUserLocations(needsFallback)
      : new Map();

    const list = tickets.map(t => {
      if (t.complex?.socialName) return t;
      const loc = locationMap.get(t.userId);
      if (loc?.complexName) {
        return { ...t, complex: { id: loc.complexId ?? '', socialName: loc.complexName } };
      }
      return t;
    });

    // ── Notificação: contagem de atendimentos em aberto (aguardando resposta do suporte) ──
    // Para o admin: total de tickets 'open' no escopo atual (respeitando filtros de
    // condomínio do usuário). Para o morador/síndico: tickets 'open' dele(s).
    const openWhere: any = isAdminView && isAdmin ? {} : { userId };
    if (isAdminView && isAdmin && complexId) openWhere.complexId = complexId;
    openWhere.status = 'open';
    const openCount = await prisma.supportTicket.count({ where: openWhere });

    // Contagem de tickets com mensagens não lidas pelo admin (requer atenção imediata)
    let unreadCount = 0;
    if (isAdminView && isAdmin) {
      const unreadWhere: any = { unreadByAdmin: true };
      if (complexId) unreadWhere.complexId = complexId;
      unreadCount = await prisma.supportTicket.count({ where: unreadWhere });
    }

    return NextResponse.json({ list, totalCount, isAdmin, openCount, unreadCount });
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
    const { subject, message, complexId, targetUserId, targetApartmentId } = body;

    if (!subject?.trim()) return NextResponse.json({ error: 'Assunto obrigatório' }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 });

    // Admin de sistema (programador/administrador) — somente ele pode iniciar
    // uma conversa com uma unidade (destinatário diferente dele mesmo).
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!contexts.system;

    let finalUserId = userId;
    let finalComplexId: string | undefined = complexId || undefined;
    let startedByAdmin = false;

    if (targetUserId && targetUserId !== userId) {
      // Apenas administradores podem abrir conversa em nome de outro usuário/unidade
      if (!isAdmin) return NextResponse.json({ error: 'Apenas administradores podem iniciar uma conversa com uma unidade.' }, { status: 403 });

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, email: true },
      });
      if (!targetUser) return NextResponse.json({ error: 'Usuário da unidade não encontrado.' }, { status: 404 });

      finalUserId = targetUserId;
      startedByAdmin = true;

      // Resolver condomínio da unidade (para aparecer no atendimento)
      if (!finalComplexId) {
        const loc = await getUserLocation(targetUserId);
        if (loc?.complexId) finalComplexId = loc.complexId;
      }
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        subject: subject.trim(),
        userId: finalUserId,
        complexId: finalComplexId,
        // Se o admin abriu, a primeira mensagem é dele e o morador ainda não leu.
        unreadByUser: startedByAdmin,
        unreadByAdmin: !startedByAdmin,
        messages: {
          create: {
            senderId: userId,
            isAdmin: startedByAdmin,
            content: message.trim(),
          },
        },
      },
      include: {
        messages: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ ...ticket, startedByAdmin }, { status: 201 });
  } catch (error: any) {
    console.error('[SUPPORT] POST error:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar chamado' }, { status: 500 });
  }
}
