/** Ativa/desativa um link de auto-cadastro (uso interno). */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { getUserContexts } from '@/lib/userContexts';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) return NextResponse.json({ error: error || 'Não autorizado' }, { status: status || 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const active = !!body.active;

    const invite = await prisma.registrationInvite.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, complexId: true, Complex: { select: { companyId: true } } },
    });
    if (!invite) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });

    const contexts = await getUserContexts(userId);
    const allowed = contexts.system
      || contexts.complexIds.includes(invite.complexId)
      || (invite.Complex?.companyId ? contexts.companyIds.includes(invite.Complex.companyId) : false);
    if (!allowed) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });

    const updated = await prisma.registrationInvite.update({
      where: { id },
      data: { active },
      select: { id: true, active: true },
    });
    return NextResponse.json({ id: updated.id, active: updated.active });
  } catch (e: any) {
    console.error('[Invites] PATCH erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao atualizar link.' }, { status: 500 });
  }
}
