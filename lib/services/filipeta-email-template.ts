/**
 * lib/services/filipeta-email-template.ts
 *
 * Gera o HTML do email enviado aos moradores com o resumo de consumo
 * e um link para visualizar a filipeta completa no sistema.
 */

import { format } from 'date-fns';
import type { ConsumptionAnalysis } from './consumption-analysis';
import { ptBR } from 'date-fns/locale';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface FilipetaEmailData {
  residentName: string;
  apartmentName: string;
  blockName: string;
  complexName: string;
  monthRef: string; // "01" - "12"
  yearRef: string;  // "2026"
  consumption: number;        // m³
  totalConsumption?: number;  // m³ total
  consumptionCost: number;    // R$
  sewageCost: number;         // R$
  totalUnit: number;          // R$ final
  kiteCarConsumption?: number;
  kiteCarCost?: number;
  utilityType?: string;       // water | gas
  readingDate?: string;       // data da leitura YYYY-MM-DD
  nextReadingDate?: string;   // próxima leitura YYYY-MM-DD
  periodStart?: string;
  periodEnd?: string;
  // Alertas
  hasAlerts?: boolean;
  alertMessage?: string;
  // Análise de consumo (comparação histórica da própria unidade)
  analysis?: ConsumptionAnalysis;
  // Dica de economia contextual
  economyTip?: string;
}


/**
 * Gera uma dica de economia contextual baseada na análise de consumo.
 */
function generateEconomyTip(analysis?: ConsumptionAnalysis): string | undefined {
  if (!analysis) return undefined;

  if (analysis.trend === 'insufficient_data') {
    return undefined; // não incomodar no primeiro mês
  }

  if (analysis.trend === 'increase' && analysis.vsPreviousPct !== null) {
    if (analysis.vsPreviousPct > 30) {
      return 'Seu consumo subiu significativamente. Recomendamos verificar possíveis vazamentos em torneiras, válvulas de descarga e conexões. Um vazamento pequeno pode desperdiçar até 200 litros por dia.';
    }
    if (analysis.vsPreviousPct > 10) {
      return 'Seu consumo aumentou neste mês. Confira se houve aumento de pessoas em casa ou uso intensivo de equipamentos. Se não houver motivo aparente, vale verificar vazamentos ocultos.';
    }
  }

  if (analysis.trend === 'decrease' && analysis.vsPreviousPct !== null) {
    if (analysis.vsPreviousPct < -20) {
      return 'Excelente! Seu consumo reduziu bastante este mês. Continue assim — pequenas mudanças de hábito fazem grande diferença no final do ano.';
    }
    if (analysis.vsPreviousPct < -10) {
      return 'Muito bem! Seu consumo diminuiu em relação ao mês anterior. Manter esse padrão ajuda a reduzir custos ao longo do ano.';
    }
  }

  if (analysis.trend === 'stable') {
    return 'Dica: feche a torneira enquanto escova os dentes e ensaboa as mãos. Esse simples hábito economiza até 12 litros por minuto.';
  }

  return undefined;
}

export function generateFilipetaEmail(data: FilipetaEmailData): { subject: string; html: string; text: string } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || 'https://www.acquaxcontrol.com.br';
  const monthName = MONTH_NAMES[parseInt(data.monthRef, 10) - 1] || data.monthRef;
  const isWater = data.utilityType !== 'gas';
  const utilityLabel = isWater ? 'Água' : 'Gás';

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const fmtNumber = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(v || 0);

  const fmtDate = (d?: string) => {
    if (!d) return null;
    try {
      const date = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
      if (isNaN(date.getTime())) return null;
      return format(date, 'dd/MM/yyyy');
    } catch { return null; }
  };

  const periodStr = [fmtDate(data.periodStart), fmtDate(data.periodEnd)]
    .filter(Boolean).join(' a ') || '—';

  const subject = `${utilityLabel}: Sua filipeta de ${monthName}/${data.yearRef} - ${data.complexName}`;

  // Tabela de valores (só linhas relevantes)
  const costRows: string[] = [];

  if (data.consumptionCost > 0) {
    costRows.push(`
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">Consumo de ${utilityLabel.toLowerCase()}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtCurrency(data.consumptionCost)}</td>
      </tr>`);
  }

  if (data.sewageCost > 0 && isWater) {
    costRows.push(`
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">Esgoto</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtCurrency(data.sewageCost)}</td>
      </tr>`);
  }

  if (data.kiteCarCost && data.kiteCarCost > 0) {
    costRows.push(`
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">Carro Pipa</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtCurrency(data.kiteCarCost)}</td>
      </tr>`);
  }

  const economyTip = data.economyTip || generateEconomyTip(data.analysis);

  const alertSection = data.hasAlerts ? `
    <tr>
      <td style="padding:0 0 16px 0;">
        <div style="background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:12px 16px;">
          <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#856404;">⚠️ Aviso Importante</p>
          <p style="margin:0;font-size:13px;color:#856404;line-height:1.5;">${data.alertMessage || 'Há alertas pendentes para sua unidade. Acesse o sistema para mais detalhes.'}</p>
        </div>
      </td>
    </tr>` : '';

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
                Sua filipeta de <strong>${utilityLabel.toLowerCase()}</strong> referente a <strong>${monthName}/${data.yearRef}</strong> está disponível.
              </p>
            </td>
          </tr>

          <!-- Resumo do consumo -->
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
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">Período de consumo</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${periodStr}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">Consumo</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtNumber(data.totalConsumption ?? data.consumption)} m³</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Valores -->
          ${costRows.length > 0 ? `
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 20px;">
                ${costRows.join('')}
                <tr>
                  <td style="padding:12px 0;font-size:16px;font-weight:700;color:#1e88e5;border-top:2px solid #1e88e5;">Valor Total</td>
                  <td style="padding:12px 0;font-size:18px;font-weight:700;color:#1e88e5;border-top:2px solid #1e88e5;text-align:right;">${fmtCurrency(data.totalUnit)}</td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- Alertas -->
          ${alertSection}

                    <!-- Análise de consumo -->
          ${data.analysis ? `
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="background:#f8f9fa;color:#333;padding:10px 20px;font-size:13px;font-weight:600;">
                    📊 Análise do seu consumo
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 12px 0;font-size:14px;color:#333;line-height:1.5;">
                      <span style="font-size:16px;">${data.analysis.trendEmoji}</span>
                      ${data.analysis.trendLabel}
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${data.analysis.previousConsumption !== null ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#888;">Mês anterior</td>
                        <td style="padding:6px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtNumber(data.analysis.previousConsumption)} m³</td>
                      </tr>` : ''}
                      ${data.analysis.avg6Months !== null ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#888;">Média ${data.analysis.monthsAnalyzed > 0 ? 'últimos ' + data.analysis.monthsAnalyzed + ' meses' : 'histórica'}</td>
                        <td style="padding:6px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${fmtNumber(data.analysis.avg6Months)} m³</td>
                      </tr>` : ''}
                      ${data.analysis.vsPreviousPct !== null ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#888;">Variação vs mês anterior</td>
                        <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:${data.analysis.vsPreviousPct > 10 ? '#e53935' : data.analysis.vsPreviousPct < -10 ? '#43a047' : '#666'};">
                          ${data.analysis.vsPreviousPct > 0 ? '+' : ''}${data.analysis.vsPreviousPct}%
                        </td>
                      </tr>` : ''}
                      ${data.analysis.vsAvgPct !== null ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#888;">Variação vs média histórica</td>
                        <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:${data.analysis.vsAvgPct > 10 ? '#e53935' : data.analysis.vsAvgPct < -10 ? '#43a047' : '#666'};">
                          ${data.analysis.vsAvgPct > 0 ? '+' : ''}${data.analysis.vsAvgPct}%
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          ${economyTip ? `
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:12px 16px;">
                <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#2e7d32;">💡 Dica de economia</p>
                <p style="margin:0;font-size:13px;color:#2e7d32;line-height:1.5;">${economyTip}</p>
              </div>
            </td>
          </tr>` : ''}

                    <!-- CTA -->
          <tr>
            <td style="padding:0 32px 28px 32px;text-align:center;">
              <a href="${baseUrl}/login?redirect=/filipeta&apt=${data.apartmentName}&ref=${data.monthRef}/${data.yearRef}"
                 style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
                Ver filipeta completa
              </a>
              <p style="margin:12px 0 0 0;font-size:12px;color:#999;">
                Acesse o sistema para ver o detalhamento completo, histórico e fotos do medidor.
              </p>
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

  const text = `AcquaX do Brasil - Sistema de Medição e Controle\n\nOlá, ${data.residentName}!\n\nSua filipeta de ${utilityLabel.toLowerCase()} referente a ${monthName}/${data.yearRef} está disponível.\n\nCondomínio: ${data.complexName}\nUnidade: ${data.blockName} - ${data.apartmentName}\nPeríodo: ${periodStr}\nConsumo: ${fmtNumber(data.totalConsumption ?? data.consumption)} m³\nValor Total: ${fmtCurrency(data.totalUnit)}\n\n${economyTip ? `\n💡 Dica de economia: ${economyTip}\n` : ''}
Acesse ${baseUrl} para ver a filipeta completa.
${data.analysis ? `
Análise de consumo:
${data.analysis.trendLabel}
${data.analysis.previousConsumption !== null ? `Mês anterior: ${fmtNumber(data.analysis.previousConsumption)} m³` : ''}
${data.analysis.avg6Months !== null ? `Média: ${fmtNumber(data.analysis.avg6Months)} m³` : ''}
${data.analysis.vsPreviousPct !== null ? `Variação vs mês anterior: ${data.analysis.vsPreviousPct > 0 ? '+' : ''}${data.analysis.vsPreviousPct}%` : ''}` : ''}

Em caso de dúvidas, entre em contato com medicao@acquaxdobrasil.com.br e/ou 4003-7945.\n\nEste é um email automático. Não responda a esta mensagem.`;

  return { subject, html, text };
}
