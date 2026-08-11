import { format } from 'date-fns';
import type { ConsumptionAnalysis } from './consumption-analysis';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface FilipetaEmailData {
  residentName: string;
  apartmentName: string;
  blockName: string;
  complexName: string;
  monthRef: string;
  yearRef: string;
  consumption: number;
  totalConsumption?: number;
  initialReading?: number | null;
  finalReading?: number | null;
  consumptionCost: number;
  sewageCost: number;
  totalUnit: number;
  rateioValue?: number | null;
  kiteCarConsumption?: number;
  kiteCarCost?: number;
  utilityType?: string;
  readingDate?: string;
  nextReadingDate?: string;
  periodStart?: string;
  periodEnd?: string;
  condominiumConsumption?: number | null;
  condominiumBillValue?: number | null;
  consumptionPerEconomy?: number | null;
  hasAlerts?: boolean;
  alertMessage?: string;
  analysis?: ConsumptionAnalysis;
  economyTip?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function generateEconomyTip(analysis?: ConsumptionAnalysis): string | undefined {
  if (!analysis || analysis.trend === 'insufficient_data') return undefined;
  if (analysis.trend === 'increase' && analysis.vsPreviousPct !== null) {
    if (analysis.vsPreviousPct > 30) return 'Seu consumo subiu significativamente. Recomendamos verificar possíveis vazamentos em torneiras, válvulas de descarga e conexões.';
    if (analysis.vsPreviousPct > 10) return 'Seu consumo aumentou neste mês. Confira se houve mudança de rotina e, se não houver motivo aparente, verifique possíveis vazamentos.';
  }
  if (analysis.trend === 'decrease' && analysis.vsPreviousPct !== null) {
    if (analysis.vsPreviousPct < -20) return 'Excelente! Seu consumo reduziu bastante este mês. Continue mantendo esses bons hábitos.';
    if (analysis.vsPreviousPct < -10) return 'Muito bem! Seu consumo diminuiu em relação ao mês anterior.';
  }
  if (analysis.trend === 'stable') return 'Dica: feche a torneira enquanto escova os dentes e ensaboa as mãos para reduzir o desperdício.';
  return undefined;
}

export function generateFilipetaEmail(data: FilipetaEmailData): { subject: string; html: string; text: string } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.acquaxcontrol.com.br';
  const monthName = MONTH_NAMES[parseInt(data.monthRef, 10) - 1] || data.monthRef;
  const isWater = data.utilityType !== 'gas';
  const utilityLabel = isWater ? 'Água' : 'Gás';

  const fmtCurrency = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtNumber = (v: number | null | undefined, decimals = 2) =>
    v == null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  const fmtDate = (value?: string | null) => {
    if (!value) return 'referência pendente';
    try {
      const normalized = value.includes('T') ? value : value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
      const date = new Date(normalized);
      return Number.isNaN(date.getTime()) ? 'referência pendente' : format(date, 'dd/MM/yyyy');
    } catch {
      return 'referência pendente';
    }
  };

  const residentName = escapeHtml(data.residentName || 'Morador');
  const apartmentName = escapeHtml(data.apartmentName);
  const blockName = escapeHtml(data.blockName);
  const complexName = escapeHtml(data.complexName);
  const monthYear = `${monthName}/${data.yearRef}`;
  const periodStr = `${fmtDate(data.periodStart)} a ${fmtDate(data.periodEnd)}`;
  const nextReading = fmtDate(data.nextReadingDate);
  const individualConsumption = data.totalConsumption ?? data.consumption;
  const economyTip = data.economyTip || generateEconomyTip(data.analysis);
  const detailUrl = `${baseUrl}/login?redirect=/filipeta&apt=${encodeURIComponent(data.apartmentName)}&ref=${encodeURIComponent(`${data.monthRef}/${data.yearRef}`)}`;

  const alertSection = data.hasAlerts ? `
    <tr><td style="padding:0 0 18px 0;">
      <div style="background:#fff8e1;border:1px solid #f3d27a;border-radius:8px;padding:13px 16px;">
        <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:#8a5a00;">Atenção sobre sua unidade</p>
        <p style="margin:0;font-size:13px;color:#8a5a00;line-height:1.5;">${escapeHtml(data.alertMessage || 'Há alertas de monitoramento associados à sua unidade. Acesse o sistema para consultar os detalhes.')}</p>
      </div>
    </td></tr>` : '';

  const analysisSection = data.analysis ? `
    <tr><td style="padding:0 0 18px 0;">
      <div style="border:1px solid #dbe5ef;border-radius:8px;overflow:hidden;">
        <div style="background:#f2f6fa;padding:10px 16px;font-size:13px;font-weight:700;color:#334155;">Análise do seu consumo</div>
        <div style="padding:13px 16px;">
          <p style="margin:0 0 10px;font-size:14px;color:#334155;line-height:1.5;">${escapeHtml(data.analysis.trendEmoji)} ${escapeHtml(data.analysis.trendLabel)}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${data.analysis.previousConsumption !== null ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Mês anterior</td><td style="padding:4px 0;text-align:right;font-size:12px;font-weight:600;color:#334155;">${fmtNumber(data.analysis.previousConsumption)} m³</td></tr>` : ''}
            ${data.analysis.avg6Months !== null ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Média histórica</td><td style="padding:4px 0;text-align:right;font-size:12px;font-weight:600;color:#334155;">${fmtNumber(data.analysis.avg6Months)} m³</td></tr>` : ''}
            ${data.analysis.vsPreviousPct !== null ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Variação vs. mês anterior</td><td style="padding:4px 0;text-align:right;font-size:12px;font-weight:600;color:${data.analysis.vsPreviousPct > 10 ? '#c62828' : data.analysis.vsPreviousPct < -10 ? '#2e7d32' : '#475569'};">${data.analysis.vsPreviousPct > 0 ? '+' : ''}${data.analysis.vsPreviousPct}%</td></tr>` : ''}
          </table>
        </div>
      </div>
    </td></tr>` : '';

  const economySection = economyTip ? `
    <tr><td style="padding:0 0 18px 0;">
      <div style="background:#edf8f0;border:1px solid #b8dfc0;border-radius:8px;padding:12px 16px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#216e39;">Dica de economia</p>
        <p style="margin:0;font-size:13px;color:#216e39;line-height:1.5;">${escapeHtml(economyTip)}</p>
      </div>
    </td></tr>` : '';

  const subject = `${utilityLabel}: extrato de consumo ${monthYear} - ${data.complexName}`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f7;"><tr><td align="center" style="padding:24px 10px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #d7dee6;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:18px 24px;background:#fff;border-bottom:1px solid #d7dee6;">
    <p style="margin:0;color:#075985;font-size:20px;font-weight:700;">AcquaX do Brasil</p>
    <p style="margin:4px 0 0;color:#64748b;font-size:12px;">Extrato de consumo individual</p>
  </td></tr>
  <tr><td style="padding:24px 24px 8px;">
    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">Prezado(a) ${residentName},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569;">Seguem abaixo os dados de consumo da unidade <strong>${apartmentName}</strong> do bloco <strong>${blockName}</strong> do condomínio <strong>${complexName}</strong>, referentes ao período de <strong>${monthYear}</strong>.</p>
  </td></tr>
  <tr><td style="padding:0 24px 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
      <tr><td colspan="3" style="padding:9px 12px;background:#6b7280;color:#fff;text-align:center;font-size:14px;font-weight:700;">Consumo individual</td></tr>
      <tr style="background:#f8fafc;"><th style="padding:8px;border-right:1px solid #cbd5e1;font-size:12px;">Índice inicial</th><th style="padding:8px;border-right:1px solid #cbd5e1;font-size:12px;">Índice final</th><th style="padding:8px;font-size:12px;">Consumo no período</th></tr>
      <tr><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtNumber(data.initialReading)} m³</td><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtNumber(data.finalReading)} m³</td><td style="padding:9px;text-align:center;font-size:13px;font-weight:700;color:#075985;">${fmtNumber(individualConsumption)} m³</td></tr>
      <tr style="background:#f8fafc;"><th style="padding:8px;border-top:1px solid #cbd5e1;border-right:1px solid #cbd5e1;font-size:12px;">Consumo total</th><th style="padding:8px;border-top:1px solid #cbd5e1;border-right:1px solid #cbd5e1;font-size:12px;">Valor consumido</th><th style="padding:8px;border-top:1px solid #cbd5e1;font-size:12px;">Valor total</th></tr>
      <tr><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtNumber(individualConsumption)} m³</td><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtCurrency(data.consumptionCost)}</td><td style="padding:9px;text-align:center;font-size:14px;font-weight:700;color:#075985;">${fmtCurrency(data.totalUnit)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
      <tr><td colspan="3" style="padding:9px 12px;background:#6b7280;color:#fff;text-align:center;font-size:14px;font-weight:700;">Consumo do condomínio</td></tr>
      <tr style="background:#f8fafc;"><th style="padding:8px;border-right:1px solid #cbd5e1;font-size:12px;">Consumo medido</th><th style="padding:8px;border-right:1px solid #cbd5e1;font-size:12px;">Valor da conta</th><th style="padding:8px;font-size:12px;">Consumo por economia</th></tr>
      <tr><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtNumber(data.condominiumConsumption)} m³</td><td style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${fmtCurrency(data.condominiumBillValue)}</td><td style="padding:9px;text-align:center;font-size:13px;">${fmtNumber(data.consumptionPerEconomy)} m³</td></tr>
      <tr style="background:#f8fafc;"><th colspan="2" style="padding:8px;border-top:1px solid #cbd5e1;border-right:1px solid #cbd5e1;font-size:12px;">Período de referência</th><th style="padding:8px;border-top:1px solid #cbd5e1;font-size:12px;">Data próx. leitura</th></tr>
      <tr><td colspan="2" style="padding:9px;text-align:center;border-right:1px solid #cbd5e1;font-size:13px;">${periodStr}</td><td style="padding:9px;text-align:center;font-size:13px;">${nextReading}</td></tr>
    </table>
  </td></tr>
  ${data.rateioValue != null || data.sewageCost > 0 || data.kiteCarCost ? `<tr><td style="padding:0 24px 18px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;"><tr><td colspan="2" style="padding:9px 12px;background:#f8fafc;font-size:13px;font-weight:700;color:#334155;">Composição do valor</td></tr>${data.sewageCost > 0 ? `<tr><td style="padding:7px 12px;font-size:12px;color:#64748b;">Esgoto</td><td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:600;">${fmtCurrency(data.sewageCost)}</td></tr>` : ''}${data.rateioValue != null ? `<tr><td style="padding:7px 12px;font-size:12px;color:#64748b;">Valor de rateio</td><td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:600;">${fmtCurrency(data.rateioValue)}</td></tr>` : ''}${data.kiteCarCost ? `<tr><td style="padding:7px 12px;font-size:12px;color:#64748b;">Carro-pipa</td><td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:600;">${fmtCurrency(data.kiteCarCost)}</td></tr>` : ''}</table></td></tr>` : ''}
  ${analysisSection}
  ${alertSection}
  ${economySection}
  <tr><td style="padding:2px 24px 28px;text-align:center;"><a href="${detailUrl}" style="display:inline-block;background:#075985;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 26px;border-radius:6px;">Ver extrato completo no AcquaX</a><p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">Consulte o histórico, fotos do medidor, gráficos e alertas da unidade.</p></td></tr>
  <tr><td style="padding:15px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;"><p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">Este é um e-mail automático do AcquaX Control. Não responda a esta mensagem.<br>Em caso de dúvidas, entre em contato com medicao@acquaxdobrasil.com.br ou 4003-7945.</p></td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `AcquaX do Brasil - Extrato de consumo individual\n\nPrezado(a) ${data.residentName},\n\nCondomínio: ${data.complexName}\nUnidade: ${data.blockName} - ${data.apartmentName}\nPeríodo: ${periodStr}\nPróxima leitura prevista: ${nextReading}\n\nCONSUMO INDIVIDUAL\nÍndice inicial: ${fmtNumber(data.initialReading)} m³\nÍndice final: ${fmtNumber(data.finalReading)} m³\nConsumo no período: ${fmtNumber(individualConsumption)} m³\nValor consumido: ${fmtCurrency(data.consumptionCost)}\nValor de rateio: ${fmtCurrency(data.rateioValue)}\nValor total: ${fmtCurrency(data.totalUnit)}\n\nCONSUMO DO CONDOMÍNIO\nConsumo medido: ${fmtNumber(data.condominiumConsumption)} m³\nValor da conta: ${fmtCurrency(data.condominiumBillValue)}\nConsumo por economia: ${fmtNumber(data.consumptionPerEconomy)} m³\n\nAcesse ${baseUrl} para consultar o extrato completo.`;

  return { subject, html, text };
}
