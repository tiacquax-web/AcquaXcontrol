import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
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
      where: { name: { contains: complexName, mode: 'insensitive' } },
      select: { id: true, name: true },
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

    // 5. Enviar email de boas-vindas para cada morador encontrado
    const results: any[] = [];
    for (const user of usersWithEmail) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
          </div>
          <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333;">Bem-vindo ao AcquaXcontrol!</h2>
            <p style="color: #555; line-height: 1.6;">
              Ola <strong>${user.name || ''}</strong>,
            </p>
            <p style="color: #555; line-height: 1.6;">
              Seu acesso ao sistema de medicao AcquaXcontrol foi liberado para a unidade <strong>${apartment.name}</strong> - Bloco <strong>${block.name}</strong> do condominio <strong>${complex.name}</strong>.
            </p>
            <p style="color: #555; line-height: 1.6;">
              Atraves do sistema voce pode acompanhar seu consumo de agua, verificar filipetas mensais e monitorar seu gasto diario.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://www.acquaxcontrol.com.br" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
            </div>
            <p style="color: #555; line-height: 1.6;">
              Se ja definiu sua senha, basta acessar com seu email e senha. Caso ainda nao tenha definido, voce sera solicitado a criar uma no primeiro acesso.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              Este e um email automatico do sistema AcquaXcontrol. Nao responda.
            </p>
          </div>
        </div>
      `;

      const result = await sendEmail({
        to: user.email!,
        toName: user.name || undefined,
        subject: 'Bem-vindo ao AcquaXcontrol - ' + complex.name,
        html,
        text: 'Bem-vindo ao AcquaXcontrol! Seu acesso foi liberado para a unidade ' + apartment.name + ' - Bloco ' + block.name + '. Acesse www.acquaxcontrol.com.br',
      });

      results.push({
        name: user.name,
        email: user.email!.substring(0, 5) + '***',
        sent: result.success,
        error: result.success ? null : result.error,
      });
    }

    const allSent = results.every(r => r.sent);
    return NextResponse.json({
      success: allSent,
      complex: complex.name,
      block: block.name,
      apartment: apartment.name,
      results,
      message: allSent
        ? 'Email de boas-vindas enviado com sucesso!'
        : 'Alguns emails falharam ao enviar',
    });

  } catch (error: any) {
    console.error('[WelcomeEmail] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
