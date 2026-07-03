/**
 * lib/services/welcome-email-template.ts
 *
 * Gera o HTML do email de boas-vindas enviado aos moradores quando seus
 * acessos são criados via importação de planilha com senha provisória.
 */

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface WelcomeEmailData {
  residentName: string;
  apartmentName: string;
  blockName: string;
  complexName: string;
  email: string;
  provisionalPassword: string;
}

export function generateWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string; text: string } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || 'https://www.acquaxcontrol.com.br';

  const subject = `Bem-vindo ao AcquaXControl - Seu acesso ao sistema (${data.complexName})`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;min-height:100vh;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#1e88e5;padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">AcquaX do Brasil</p>
              <p style="margin:4px 0 0 0;color:#bbdefb;font-size:13px;">Sistema de Medição e Controle</p>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#333;">Olá, ${data.residentName}!</p>
              <p style="margin:0 0 20px 0;font-size:14px;color:#666;line-height:1.6;">
                Seu acesso ao sistema AcquaXControl foi criado. Através dele você poderá acompanhar
                suas filipetas de consumo, histórico de medições e muito mais.
              </p>
            </td>
          </tr>

          <!-- Dados do condomínio -->
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;padding:16px 20px;">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">Condomínio</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${data.complexName}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">Unidade</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${data.blockName} - ${data.apartmentName}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Credenciais de acesso -->
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="background:#1e88e5;color:#fff;padding:10px 20px;font-size:13px;font-weight:600;">
                    🔑 Seus dados de acesso
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#888;">E-mail</td>
                        <td style="padding:6px 0;font-size:14px;color:#333;font-weight:600;text-align:right;">${data.email}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#888;">Senha provisória</td>
                        <td style="padding:6px 0;font-size:14px;color:#333;font-weight:600;text-align:right;font-family:monospace;letter-spacing:1px;">${data.provisionalPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Aviso troca de senha -->
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <div style="background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:12px 16px;">
                <p style="margin:0;font-size:13px;color:#856404;line-height:1.5;">
                  ⚠️ Por segurança, você será solicitado a trocar sua senha no primeiro acesso ao sistema.
                </p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 28px 32px;text-align:center;">
              <a href="${baseUrl}/login"
                 style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
                Acessar o sistema
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:11px;color:#999;text-align:center;line-height:1.5;">
                Este é um email automático do sistema AcquaXControl. Não responda a esta mensagem.<br>
                Em caso de dúvidas, entre em contato com medicao@acquaxdobrasil.com.br e/ou 4003-7945.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `AcquaX do Brasil - Sistema de Medição e Controle\n\nOlá, ${data.residentName}!\n\nSeu acesso ao sistema AcquaXControl foi criado. Através dele você poderá acompanhar suas filipetas de consumo, histórico de medições e muito mais.\n\nCondomínio: ${data.complexName}\nUnidade: ${data.blockName} - ${data.apartmentName}\n\nE-mail: ${data.email}\nSenha provisória: ${data.provisionalPassword}\n\nPor segurança, você será solicitado a trocar sua senha no primeiro acesso.\n\nAcesse ${baseUrl}/login para entrar no sistema.\n\nEm caso de dúvidas, entre em contato com medicao@acquaxdobrasil.com.br e/ou 4003-7945.\n\nEste é um email automático. Não responda a esta mensagem.`;

  return { subject, html, text };
}
