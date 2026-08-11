import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { sanitizeImageUrl } from '@/lib/utils';

export interface FilipetaPdfReport {
  id?: string;
  monthRef?: string | null;
  yearRef?: string | null;
  consumption?: number | null;
  partial?: number | null;
  totalUnit?: number | null;
  apartment?: any;
  lastReading?: any;
  history?: any[];
}

export interface FilipetaPdfPayload {
  reports: FilipetaPdfReport[];
  dealershipReading?: any;
  description?: string | null;
  baseUrl?: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PHOTO_BATCH_SIZE = 8;
const PHOTO_CONCURRENCY = 2;
const IMAGE_TIMEOUT_MS = 7000;

function text(value: unknown, fallback = 'ref. pend.') {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || fallback;
}

function numberText(value: unknown, decimals = 3) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return 'ref. pend.';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function currencyText(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00';
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00Z`
    : raw.includes(' ') && !raw.includes('T')
      ? raw.replace(' ', 'T')
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(value: unknown) {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : 'ref. pend.';
}

function safeMonthYear(report: FilipetaPdfReport) {
  const month = text(report.monthRef, '').padStart(2, '0');
  return month && report.yearRef ? `${month}/${report.yearRef}` : 'ref. pend.';
}

function addText(doc: PDFKit.PDFDocument, value: unknown, x: number, y: number, width: number, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(text(value, ''), x, y, { width, ...options });
}

function line(doc: PDFKit.PDFDocument, x1: number, y1: number, x2: number, y2: number, width = 0.7) {
  doc.lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke('#222222');
}

function cell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, value: unknown, options: { bold?: boolean; align?: PDFKit.Mixins.TextOptions['align']; size?: number; fill?: string } = {}) {
  if (options.fill) doc.rect(x, y, width, height).fillAndStroke(options.fill, '#222222');
  else doc.rect(x, y, width, height).stroke('#222222');
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 7);
  addText(doc, value, x + 3, y + 3, width - 6, { align: options.align ?? 'left', lineGap: 0 });
}

async function optimizeImage(url: string | null | undefined, baseUrl?: string): Promise<Buffer | null> {
  if (!url) return null;

  try {
    let input: Buffer;
    if (url.startsWith('data:image/')) {
      const comma = url.indexOf(',');
      if (comma < 0) return null;
      input = Buffer.from(url.slice(comma + 1), 'base64');
    } else {
      const absoluteUrl = url.startsWith('/') && baseUrl ? new URL(url, baseUrl).toString() : sanitizeImageUrl(url);
      const response = await fetch(absoluteUrl, {
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.5' },
      });
      if (!response.ok) return null;
      input = Buffer.from(await response.arrayBuffer());
    }

    return await sharp(input)
      .rotate()
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 55, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    console.warn('[Filipeta PDF] image skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      result[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return result;
}

function drawReportPage(doc: PDFKit.PDFDocument, report: FilipetaPdfReport, dealershipReading: any, description: string | null | undefined, logo: Buffer, photo: Buffer | null) {
  doc.addPage({ size: 'A4', margin: MARGIN });
  const x = MARGIN;
  let y = MARGIN;
  const apartment = report.apartment ?? {};
  const block = apartment.block ?? {};
  const complex = block.complex ?? {};
  const company = complex.company ?? {};
  const lastReading = report.lastReading ?? null;
  const history = Array.isArray(report.history) ? report.history : [];
  const previous = history[0]?.lastReading ?? null;
  const previousPrevious = history[1] ?? null;

  const companyName = text(company.socialName || company.name || 'Acqua X do Brasil', 'Acqua X do Brasil');
  const complexName = text(complex.socialName || complex.aliasName, 'ref. pend.');
  const blockName = text(block.name, 'ref. pend.');
  const apartmentNameRaw = text(apartment.name, 'ref. pend.');
  const apartmentName = /casa|apto/i.test(apartmentNameRaw) ? apartmentNameRaw : `Apto ${apartmentNameRaw}`;
  const address = [complex.street, complex.number].filter(Boolean).join(', ');
  const cityState = [complex.city, complex.state].filter(Boolean).join(' - ');
  const zip = complex.zipcode ? ` - CEP: ${complex.zipcode}` : '';

  doc.rect(x, y, CONTENT_WIDTH, 790).stroke('#111111');
  const headerHeight = 58;
  const headerCol1 = 92;
  const headerCol2 = 300;
  line(doc, x, y + headerHeight, x + CONTENT_WIDTH, y + headerHeight, 1.2);
  line(doc, x + headerCol1, y, x + headerCol1, y + headerHeight, 1.2);
  line(doc, x + headerCol1 + headerCol2, y, x + headerCol1 + headerCol2, y + headerHeight, 1.2);
  doc.image(logo, x + 18, y + 8, { fit: [55, 42], align: 'center', valign: 'center' });
  doc.font('Helvetica-Bold').fontSize(7);
  addText(doc, companyName, x + headerCol1 + 5, y + 6, headerCol2 - 10, { lineGap: 0 });
  addText(doc, complexName, x + headerCol1 + 5, y + 15, headerCol2 - 10, { lineGap: 0 });
  doc.font('Helvetica').fontSize(7);
  addText(doc, `Bloco ${blockName}`, x + headerCol1 + 5, y + 25, headerCol2 - 10, { lineGap: 0 });
  addText(doc, apartmentName, x + headerCol1 + 5, y + 34, headerCol2 - 10, { lineGap: 0 });
  addText(doc, address, x + headerCol1 + 5, y + 43, headerCol2 - 10, { lineGap: 0 });
  addText(doc, `${cityState}${zip}`, x + headerCol1 + 5, y + 52, headerCol2 - 10, { lineGap: 0 });
  doc.font('Helvetica-Bold').fontSize(7);
  addText(doc, 'Emitido em:', x + headerCol1 + headerCol2 + 5, y + 8, 70);
  doc.font('Helvetica').fontSize(7);
  addText(doc, new Date().toLocaleString('pt-BR'), x + headerCol1 + headerCol2 + 5, y + 18, CONTENT_WIDTH - headerCol1 - headerCol2 - 10);
  doc.font('Helvetica-Bold').fontSize(7);
  addText(doc, 'Mês Ref.', x + headerCol1 + headerCol2 + 5, y + 34, CONTENT_WIDTH - headerCol1 - headerCol2 - 10);
  doc.font('Helvetica').fontSize(7);
  addText(doc, safeMonthYear(report), x + headerCol1 + headerCol2 + 5, y + 44, CONTENT_WIDTH - headerCol1 - headerCol2 - 10);
  y += headerHeight;

  const photoWidth = 150;
  const infoWidth = CONTENT_WIDTH - photoWidth;
  const middleHeight = 205;
  line(doc, x + photoWidth, y, x + photoWidth, y + middleHeight, 1.2);
  line(doc, x, y + middleHeight, x + CONTENT_WIDTH, y + middleHeight, 1.2);
  if (photo) {
    doc.image(photo, x + 15, y + 12, { fit: [120, 125], align: 'center', valign: 'center' });
  } else {
    doc.font('Helvetica').fontSize(8).fillColor('#777777');
    addText(doc, 'Sem imagem', x + 15, y + 70, 120, { align: 'center' });
    doc.fillColor('#000000');
  }

  const rightX = x + photoWidth;
  const historyHeight = 48;
  doc.font('Helvetica-Bold').fontSize(8);
  addText(doc, 'HISTÓRICO DE CONSUMO', rightX + 5, y + 5, infoWidth - 10);
  line(doc, rightX, y + 19, x + CONTENT_WIDTH, y + 19);
  const historyCellWidth = infoWidth / 6;
  const historyLabels = [
    previousPrevious ? `${text(previousPrevious.monthRef, '').padStart(2, '0')}/${previousPrevious.yearRef}` : 'ref. pend.',
    previousPrevious ? numberText(previousPrevious.consumption, 6) : 'ref. pend.',
    history[0] ? `${text(history[0].monthRef, '').padStart(2, '0')}/${history[0].yearRef}` : 'ref. pend.',
    history[0] ? numberText(history[0].consumption, 6) : 'ref. pend.',
    safeMonthYear(report),
    numberText(report.consumption, 6),
  ];
  historyLabels.forEach((value, index) => cell(doc, rightX + historyCellWidth * index, y + 19, historyCellWidth, historyHeight - 19, value, { size: 6, align: 'center' }));

  const descriptionY = y + historyHeight;
  const descriptionHeight = 52;
  cell(doc, rightX, descriptionY, infoWidth, descriptionHeight, '', { fill: '#f7f7f7' });
  doc.font('Helvetica-Bold').fontSize(8);
  addText(doc, 'CAD. Descrição', rightX + 5, descriptionY + 5, infoWidth - 10);
  doc.font('Helvetica').fontSize(7);
  addText(doc, description || '', rightX + 5, descriptionY + 18, infoWidth - 10, { height: descriptionHeight - 22 });

  const commonY = descriptionY + descriptionHeight;
  const commonHeight = 35;
  cell(doc, rightX, commonY, infoWidth, commonHeight, '', { fill: '#f7f7f7' });
  doc.font('Helvetica-Bold').fontSize(8);
  addText(doc, 'CONSUMO ÁREA COMUM (RATEIO)', rightX + 5, commonY + 5, infoWidth - 10);
  doc.font('Helvetica').fontSize(8);
  addText(doc, currencyText(report.partial), rightX + 5, commonY + 20, infoWidth - 10);

  const tableY = commonY + commonHeight;
  const tableHeight = middleHeight - (tableY - y);
  const tableHeaders = ['LEITURA ANT.\nm³', 'LEITURA ATUAL\nm³', 'CONSUMO\nm³', 'PERÍODO DE\nCONSUMO', 'PRÓXIMA LEIT.\nPREVISTA', 'TOTAL A PAGAR'];
  const currentReadingDate = parseDate(lastReading?.readAtDate);
  const totalDays = Number(dealershipReading?.totalDays);
  const derivedStartDate = currentReadingDate && Number.isFinite(totalDays)
    ? new Date(currentReadingDate.getTime() - totalDays * 86400000)
    : null;
  const periodStartDate = parseDate(previous?.readAtDate) || derivedStartDate;

  const tableValues = [
    numberText(previous?.reading, 3),
    numberText(lastReading?.reading, 3),
    numberText(report.consumption, 6),
    `${dateText(periodStartDate)}\na\n${dateText(lastReading?.readAtDate)}`,
    dateText(lastReading?.nextReadingDate || lastReading?.readingDateNext || dealershipReading?.readingDateNext),
    numberText(report.totalUnit, 2),
  ];
  const tableWidth = infoWidth;
  const colWidth = tableWidth / tableHeaders.length;
  for (let i = 0; i < tableHeaders.length; i += 1) {
    cell(doc, rightX + i * colWidth, tableY, colWidth, tableHeight / 2, tableHeaders[i], { bold: true, size: 6, align: 'center', fill: '#f7f7f7' });
    cell(doc, rightX + i * colWidth, tableY + tableHeight / 2, colWidth, tableHeight / 2, tableValues[i], { size: i === 3 ? 5.5 : 6.5, align: 'center' });
  }
  y += middleHeight;

  const footerY = y;
  line(doc, x, footerY, x + CONTENT_WIDTH, footerY, 1.2);
  doc.font('Helvetica').fontSize(7);
  addText(doc, 'CENTRAL DE ATENDIMENTO: 4003-7945 ou medicao@acquaxdobrasil.com.br', x + 5, footerY + 8, CONTENT_WIDTH - 10, { align: 'center' });
}

export async function generateFilipetaPdf(payload: FilipetaPdfPayload): Promise<Buffer> {
  const logoPath = path.join(process.cwd(), 'public', 'logo-quadrada-2.jpg');
  const logo = fs.readFileSync(logoPath);
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: false, compress: true, info: { Title: 'Filipetas de medição', Author: 'Acqua X Control' } });
  const chunks: Buffer[] = [];
  const pdf = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (let start = 0; start < payload.reports.length; start += PHOTO_BATCH_SIZE) {
    const batch = payload.reports.slice(start, start + PHOTO_BATCH_SIZE);
    const photos = await mapWithConcurrency(batch, PHOTO_CONCURRENCY, report => optimizeImage(report.lastReading?.urlCover, payload.baseUrl));
    batch.forEach((report, index) => drawReportPage(doc, report, payload.dealershipReading, payload.description, logo, photos[index]));
  }

  doc.end();
  return pdf;
}
