import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { isEmailConfigured, sendEmail } from '@/lib/services/email-service';
import { generateWelcomeEmail } from '@/lib/services/welcome-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/user/send-welcome-email?complex=Living Wish Panamby&block=B&apartment=92
 * Busca o morador da unidade e envia email de boas-vindas.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

    // Verificar se é admin ou programador
    const systemAssignments = await prisma.roleAssignment.findMany({
      where: {
        userId,
        contextType: 'system',
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { Role: { select: { name: true } } },
    });
    const systemRoles = systemAssignments.map(a => a.Role?.name).filter(Boolean) as string[];
    const isAdmin = systemRoles.includes('Administrador') || systemRoles.includes('Programador');
    if (!isAdmin) return NextResponse.json({ message: 'Apenas administradores' }, { status: 403 });

    const url = new URL(req.url);
    const complexName = url.searchParams.get('complex') || '';
    const blockName = url.searchParams.get('block') || '';
    const apartmentName = url.searchParams.get('apartment') || '';

    if (!complexName || !blockName || !apartmentName) {
      return NextResponse.json({ message: 'Parametros obrigatorios: complex, block, apartment' }, { status: 400 });
    }

    // 1. Buscar condomínio
    const complex = await prisma.complex.findFirst({
      where: { socialName: { contains: complexName, mode: 'insensitive' } },
      select: { id: true, socialName: true },
    });
    if (!complex) return NextResponse.json({ message: 'Condominio nao encontrado: ' + complexName }, { status: 404 });

    // 2. Buscar bloco
    const block = await prisma.block.findFirst({
      where: { complexId: complex.id, name: { contains: blockName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!block) return NextResponse.json({ message: 'Bloco nao encontrado: ' + blockName }, { status: 404 });

    // 3. Buscar apartamento
    const apartment = await prisma.apartment.findFirst({
      where: { blockId: block.id, name: { contains: apartmentName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!apartment) return NextResponse.json({ message: 'Apartamento nao encontrado: ' + apartmentName }, { status: 404 });

    // 4. Buscar morador vinculado ao apartamento
    const moradorRole = await prisma.role.findFirst({
      where: { name: 'Morador' },
      select: { id: true },
    });
    if (!moradorRole) return NextResponse.json({ message: 'Role Morador nao encontrado' }, { status: 404 });

    const assignments = await prisma.roleAssignment.findMany({
      where: {
        roleId: moradorRole.id,
        contextType: 'apartment',
        contextId: apartment.id,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { userId: true },
    });

    if (assignments.length === 0) {
      return NextResponse.json({ message: 'Nenhum morador vinculado a unidade ' + apartmentName + '/' + blockName }, { status: 404 });
    }

    // Buscar dados do usuario
    const users = await prisma.user.findMany({
      where: { id: { in: assignments.map(a => a.userId) } },
      select: { id: true, name: true, email: true },
    });

    const usersWithEmail = users.filter(u => u.email && !isBlockedEmailDomain(u.email));

    if (usersWithEmail.length === 0) {
      const allUsers = users.map(u => ({ name: u.name, email: u.email || '(sem email)' }));
      return NextResponse.json({
        message: 'Morador encontrado mas sem email valido',
        users: allUsers,
      }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ message: 'SMTP nao configurado' }, { status: 500 });
    }

    // 5. Boas-vindas de UMA unidade são imediatas (envio direto pelo SMTP).
    // Só os fluxos em lote (importação/cadastro em massa) vão para a fila com
    // ritmo humano — ver bulk-import e users/route.ts (createBulkResidentsUsers).
    const results: any[] = [];
    for (const user of usersWithEmail) {
      const { subject, html, text } = generateWelcomeEmail({
        residentName: user.name || 'Morador',
        apartmentName: apartment.name,
        blockName: block.name,
        complexName: complex.socialName,
        email: user.email!,
      });

      let sent = false;
      let error: string | null = null;
      try {
        const result = await sendEmail({
          to: user.email!,
          toName: user.name || undefined,
          subject,
          html,
          text,
          log: {
            category: 'welcome',
            userId,
            complexId: complex.id,
            apartmentId: apartment.id,
          },
        });
        sent = result.success;
        if (!result.success) error = result.error || 'Falha no envio';
      } catch (err: any) {
        error = err?.message || 'Erro ao enviar email';
      }

      results.push({
        name: user.name,
        email: user.email!.substring(0, 5) + '***',
        sent,
        error,
        queued: false,
        immediate: true,
      });
    }

    const allSent = results.every(r => r.sent);
    return NextResponse.json({
      success: allSent,
      complex: complex.socialName,
      block: block.name,
      apartment: apartment.name,
      results,
      message: allSent
        ? 'E-mail de boas-vindas enviado.'
        : 'Alguns e-mails não puderam ser enviados',
    });

  } catch (error: any) {
    console.error('[WelcomeEmail] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
