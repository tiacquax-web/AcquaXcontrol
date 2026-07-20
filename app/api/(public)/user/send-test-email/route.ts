import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/user/send-test-email
 * Body: { to: "email@example.com" }
 * Envia um email de teste direto, sem passar pela fila de EmailJobs.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) {
      return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    }
    if (!userId) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

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
    if (!isAdmin) {
      return NextResponse.json({ message: 'Apenas administradores podem enviar emails de teste' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const to = body.to;
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json({ message: 'Email de destino inválido' }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ message: 'SMTP não configurado' }, { status: 500 });
    }

    const testHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
        </div>
        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #333;">Email de Teste</h2>
          <p style="color: #555; line-height: 1.6;">
            Este e um email de teste enviado pelo sistema AcquaXcontrol em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
          </p>
          <p style="color: #555; line-height: 1.6;">
            Se voce esta lendo isto, o SMTP do Zoho esta funcionando corretamente!
          </p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            Este e um email automatico do sistema AcquaXcontrol. Nao responda.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to,
      toName: 'Giulia (Teste)',
      subject: 'Teste de Email - AcquaXcontrol',
      html: testHtml,
      text: 'Email de teste enviado pelo sistema AcquaXcontrol.',
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Email enviado com sucesso para ' + to, messageId: result.messageId });
    } else {
      return NextResponse.json({ success: false, message: 'Falha ao enviar email', error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[SendTestEmail] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
