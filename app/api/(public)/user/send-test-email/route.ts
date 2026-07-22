import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/user/send-test-email?to=email@example.com&type=test|welcome|reset
 * Envia um email de teste, boas-vindas ou reset. Só visitar o link logado.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ message: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

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
    const to = url.searchParams.get('to') || 'ruivagiulia@gmail.com';
    const type = url.searchParams.get('type') || 'test';
    if (!to.includes('@')) return NextResponse.json({ message: 'Email invalido' }, { status: 400 });
    if (!isEmailConfigured()) return NextResponse.json({ message: 'SMTP nao configurado' }, { status: 500 });

    const header = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0066B3, #009FE0); padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">AcquaX do Brasil</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0;">Sistema de medicao e controle</p>
        </div>
        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">`;

    const footer = `
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            Este e um email automatico do sistema AcquaXcontrol. Nao responda.<br/>
            AcquaX do Brasil - Sistema de medicao e controle
          </p>
        </div>
      </div>`;

    let subject: string;
    let bodyHtml: string;
    let text: string;

    if (type === 'welcome') {
      subject = 'Bem-vindo(a) ao AcquaXcontrol!';
      bodyHtml = `
            <h2 style="color: #333;">Seu acesso esta ativo!</h2>
            <p style="color: #555; line-height: 1.6;">
              Seu acesso ao sistema de medicao AcquaXcontrol foi liberado.
            </p>
            <p style="color: #555; line-height: 1.6;">
              Atraves do sistema voce pode acompanhar seu consumo de agua, verificar filipetas mensais e monitorar seu gasto diario.
            </p>
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin: 16px 0;">
              <p style="color: #555; margin: 0 0 8px;"><strong>Como acessar:</strong></p>
              <p style="color: #555; margin: 0 0 4px;">1. Acesse <a href="https://www.acquaxcontrol.com.br" style="color: #0066B3;">www.acquaxcontrol.com.br</a></p>
              <p style="color: #555; margin: 0;">2. Faca login com seu email e senha cadastrados</p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://www.acquaxcontrol.com.br" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
            </div>
            <p style="color: #555; line-height: 1.6;">
              Em caso de duvidas sobre sua senha, entre em contato com a administracao do seu condominio.
            </p>`;
      text = 'Bem-vindo ao AcquaXcontrol! Seu acesso esta ativo. Acesse www.acquaxcontrol.com.br e faca login com seu email e senha cadastrados.';

    } else if (type === 'reset') {
      subject = 'Senha Redefinida - AcquaXcontrol';
      bodyHtml = `
            <h2 style="color: #333;">Senha Redefinida</h2>
            <p style="color: #555; line-height: 1.6;">
              Sua senha de acesso ao sistema AcquaXcontrol foi redefinida.
            </p>
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0 0 4px;">Sua nova senha temporaria:</p>
              <p style="font-size: 24px; font-weight: bold; color: #0066B3; margin: 0; letter-spacing: 2px;">Acquax@TESTE123</p>
            </div>
            <p style="color: #555; line-height: 1.6;">
              Acesse <a href="https://www.acquaxcontrol.com.br" style="color: #0066B3;">www.acquaxcontrol.com.br</a> e faca login com esta senha.
              Voce sera solicitado a criar uma nova senha no primeiro acesso.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://www.acquaxcontrol.com.br" style="background: #0066B3; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Acessar o Sistema</a>
            </div>
            <p style="color: #999; font-size: 12px; margin: 8px 0 0;">
              (Email de teste — a senha acima e ficticia)
            </p>`;
      text = 'Sua senha foi redefinida. Acesse www.acquaxcontrol.com.br e faca login com a nova senha temporaria. (Email de teste)';

    } else {
      subject = 'Teste de Email - AcquaXcontrol';
      bodyHtml = `
            <h2 style="color: #333;">Email de Teste</h2>
            <p style="color: #555; line-height: 1.6;">
              Este e um email de teste enviado pelo sistema AcquaXcontrol em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
            </p>
            <p style="color: #555; line-height: 1.6;">
              Se voce esta lendo isto, o SMTP do Zoho esta funcionando corretamente!
            </p>`;
      text = 'Email de teste enviado pelo sistema AcquaXcontrol.';
    }

    const html = header + bodyHtml + footer;

    const result = await sendEmail({
      to,
      toName: 'Giulia (Teste)',
      subject,
      html,
      text,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Email de ' + type + ' enviado para ' + to });
    } else {
      return NextResponse.json({ success: false, message: 'Falha ao enviar email', error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[SendTestEmail] Erro:', error);
    return NextResponse.json({ message: 'Erro interno', error: error?.message }, { status: 500 });
  }
}
