/**
 * Gestão dos links de auto-cadastro (uso interno, autenticado).
 * GET  → lista os links existentes com o nome do condomínio
 * POST → gera (ou reaproveita) o link de um condomínio
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { getUserContexts } from '@/lib/userContexts';

export const runtime = 'nodejs';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';

export async function GET(req: NextRequest) {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) return NextResponse.json({ error: error || 'Não autorizado' }, { status: status || 401 });

    const contexts = await getUserContexts(userId);
    const invites = await prisma.registrationInvite.findMany({
      where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: {
        id: true, token: true, active: true, createdAt: true, complexId: true,
        Complex: { select: { id: true, socialName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const visible = invites.filter(inv => {
      if (contexts.system) return true;
      if (contexts.complexIds.includes(inv.complexId)) return true;
      return false;
    });

    return NextResponse.json({
      list: visible.map(i => ({
        id: i.id,
        token: i.token,
        active: i.active,
        createdAt: i.createdAt,
        complexId: i.complexId,
        complexName: i.Complex?.socialName ?? '(sem nome)',
        url: `${BASE_URL}/cadastro/${i.token}`,
      })),
    });
  } catch (e: any) {
    console.error('[Invites] GET erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao listar links.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) return NextResponse.json({ error: error || 'Não autorizado' }, { status: status || 401 });

    const body = await req.json().catch(() => ({}));
    const complexId = String(body.complexId || '');
    if (!complexId) return NextResponse.json({ error: 'Informe o condomínio.' }, { status: 400 });

    const complex = await prisma.complex.findFirst({
      where: { id: complexId, deletedAt: null },
      select: { id: true, socialName: true, companyId: true },
    });
    if (!complex) return NextResponse.json({ error: 'Condomínio não encontrado.' }, { status: 404 });

    // Autorização: admin/sistema, síndico do condomínio ou administradora dona
    const contexts = await getUserContexts(userId);
    const allowed = contexts.system
      || contexts.complexIds.includes(complexId)
      || (complex.companyId ? contexts.companyIds.includes(complex.companyId) : false);
    if (!allowed) return NextResponse.json({ error: 'Não autorizado para este condomínio.' }, { status: 403 });

    // Reaproveita link ativo existente
    const existing = await prisma.registrationInvite.findFirst({
      where: { complexId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, token: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        await prisma.registrationInvite.update({ where: { id: existing.id }, data: { active: true } });
      }
      return NextResponse.json({
        id: existing.id, token: existing.token, active: true, complexId,
        complexName: complex.socialName,
        url: `${BASE_URL}/cadastro/${existing.token}`,
      });
    }

    const invite = await prisma.registrationInvite.create({
      data: { token: randomUUID().replace(/-/g, ''), complexId, createdByUserId: userId },
      select: { id: true, token: true, active: true },
    });

    return NextResponse.json({
      id: invite.id, token: invite.token, active: true, complexId,
      complexName: complex.socialName,
      url: `${BASE_URL}/cadastro/${invite.token}`,
    });
  } catch (e: any) {
    console.error('[Invites] POST erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao gerar link.' }, { status: 500 });
  }
}
