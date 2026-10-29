/**
 * Auto-cadastro público de moradores por link do condomínio.
 * GET  → dados do condomínio + blocos/unidades com disponibilidade
 * POST → cria o acesso do morador (1 cadastro por unidade, garantido por
 *        RegistrationClaim com @unique em apartmentId)
 */
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ACTIVE = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as any;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadInvite(token: string) {
  return prisma.registrationInvite.findFirst({
    where: { token, active: true, deletedAt: null },
    select: { id: true, complexId: true, Complex: { select: { id: true, socialName: true, deletedAt: true } } },
  });
}

/** Conjunto de unidades já ocupadas (morador ativo OU claim com usuário ativo) */
async function getTakenApartmentIds(apartmentIds: string[]) {
  const taken = new Set<string>();
  if (apartmentIds.length === 0) return taken;

  const morador = await prisma.role.findFirst({ where: { name: 'Morador', deletedAt: null }, select: { id: true } });
  if (morador) {
    const ras = await prisma.roleAssignment.findMany({
      where: { roleId: morador.id, contextType: 'apartment', contextId: { in: apartmentIds }, ...ACTIVE },
      select: { contextId: true },
    });
    ras.forEach(r => taken.add(r.contextId));
  }

  const claims = await prisma.registrationClaim.findMany({
    where: { apartmentId: { in: apartmentIds } },
    select: { apartmentId: true, userId: true },
  });
  const claimUserIds = claims.map(c => c.userId).filter(Boolean) as string[];
  const liveUsers = claimUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: claimUserIds }, deletedAt: null }, select: { id: true } })
    : [];
  const live = new Set(liveUsers.map(u => u.id));
  for (const c of claims) if (c.userId && live.has(c.userId)) taken.add(c.apartmentId);

  return taken;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await loadInvite(token);
    if (!invite || invite.Complex?.deletedAt) {
      return NextResponse.json({ error: 'Link de cadastro inválido ou desativado.' }, { status: 404 });
    }

    const blocks = await prisma.block.findMany({
      where: { complexId: invite.complexId, deletedAt: null },
      select: { id: true, name: true, apartments: { where: ACTIVE, select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    const allAptIds = blocks.flatMap(b => b.apartments.map(a => a.id));
    const taken = await getTakenApartmentIds(allAptIds);

    return NextResponse.json({
      complex: { name: invite.Complex?.socialName ?? '' },
      blocks: blocks.map(b => ({
        id: b.id,
        name: b.name,
        apartments: [...b.apartments]
          .sort((a, c) => Number(a.name) - Number(c.name) || a.name.localeCompare(c.name))
          .map(a => ({ id: a.id, name: a.name, taken: taken.has(a.id) })),
      })),
    });
  } catch (e: any) {
    console.error('[Register] GET erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao carregar dados do condomínio.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await loadInvite(token);
    if (!invite || invite.Complex?.deletedAt) {
      return NextResponse.json({ error: 'Link de cadastro inválido ou desativado.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const blockId = String(body.blockId || '');
    const apartmentId = String(body.apartmentId || '');

    if (!blockId || !apartmentId) return NextResponse.json({ error: 'Selecione bloco e unidade.' }, { status: 400 });
    if (name.length < 3) return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 });
    if (!emailRegex.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

    // Unidade pertence a este bloco/condomínio?
    const apartment = await prisma.apartment.findFirst({
      where: { id: apartmentId, blockId, block: { complexId: invite.complexId } },
      select: { id: true, name: true, block: { select: { name: true } } },
    });
    if (!apartment) return NextResponse.json({ error: 'Unidade não encontrada neste condomínio.' }, { status: 400 });

    // Unidade já ocupada?
    const taken = await getTakenApartmentIds([apartmentId]);
    if (taken.has(apartmentId)) {
      return NextResponse.json({ error: 'Esta unidade já possui um cadastro. Se precisar alterar, fale com a administração.' }, { status: 409 });
    }

    // E-mail já cadastrado?
    const existingUser = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json({ error: 'Este e-mail já possui cadastro. Use "Esqueci minha senha" na tela de login.' }, { status: 409 });
    }

    const morador = await prisma.role.findFirst({ where: { name: 'Morador', deletedAt: null }, select: { id: true } });
    if (!morador) return NextResponse.json({ error: 'Papel "Morador" não configurado.' }, { status: 500 });

    // Trava atômica: cria o claim antes (unique apartmentId barra corrida)
    let claimId: string;
    try {
      const claim = await prisma.registrationClaim.create({ data: { apartmentId, inviteId: invite.id } });
      claimId = claim.id;
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      const existing = await prisma.registrationClaim.findUnique({ where: { apartmentId } });
      // claim órfão (usuário removido) → reaproveita
      if (existing?.userId) {
        const still = await prisma.user.findFirst({ where: { id: existing.userId, deletedAt: null }, select: { id: true } });
        if (still) return NextResponse.json({ error: 'Esta unidade já possui um cadastro.' }, { status: 409 });
      }
      if (!existing) return NextResponse.json({ error: 'Esta unidade já possui um cadastro.' }, { status: 409 });
      await prisma.registrationClaim.update({ where: { apartmentId }, data: { userId: null, inviteId: invite.id } });
      claimId = existing.id;
    }

    try {
      const hashed = await hash(password, 10);
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashed,
          cell: phone || null,
          mustUpdateCredentials: false,
          createdByUserId: null,
          updatedByUserId: null,
        },
        select: { id: true, name: true, email: true },
      });

      await prisma.roleAssignment.create({
        data: {
          userId: user.id,
          roleId: morador.id,
          contextType: 'apartment',
          contextId: apartmentId,
        },
      });

      await prisma.registrationClaim.update({ where: { apartmentId }, data: { userId: user.id } });

      // E-mail de boas-vindas (não bloqueia a resposta)
      if (isEmailConfigured() && !isBlockedEmailDomain(user.email)) {
        const complexName = invite.Complex?.socialName ?? '';
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
            </div>
            <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #333;">Cadastro confirmado!</h2>
              <p style="color: #555; line-height: 1.6;">Olá <strong>${user.name}</strong>,</p>
              <p style="color: #555; line-height: 1.6;">Seu acesso foi criado para a unidade <strong>${apartment.name}</strong> - Bloco <strong>${apartment.block?.name ?? '-'}</strong> do condomínio <strong>${complexName}</strong>.</p>
              <p style="color: #555; line-height: 1.6;">Entre com seu e-mail e a senha que você acabou de definir.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="https://www.acquaxcontrol.com.br/login" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">Este é um email automático do sistema AcquaXcontrol. Não responda.</p>
            </div>
          </div>`;
        sendEmail({
          to: user.email,
          toName: user.name,
          subject: `Cadastro confirmado - ${complexName}`,
          html,
          text: `Cadastro confirmado para ${apartment.name} - Bloco ${apartment.block?.name ?? '-'}. Acesse www.acquaxcontrol.com.br/login`,
        }).catch(err => console.error('[Register] falha email boas-vindas:', err?.message));
      }

      return NextResponse.json({ success: true, name: user.name, email: user.email, unit: `${apartment.block?.name ?? '-'}/${apartment.name}` });
    } catch (innerErr: any) {
      // Falhou depois do claim → libera a unidade
      await prisma.registrationClaim.delete({ where: { id: claimId } }).catch(() => {});
      console.error('[Register] POST erro criação:', innerErr?.message);
      return NextResponse.json({ error: 'Erro ao criar o cadastro. Tente novamente.' }, { status: 500 });
    }
  } catch (e: any) {
    console.error('[Register] POST erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao criar o cadastro. Tente novamente.' }, { status: 500 });
  }
}
