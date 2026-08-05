'use client';

import React, { useState } from 'react';
import Image from 'next/image'; // usado apenas para o logo (/logo-quadrada-2.jpg)
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ApartmentWithConsumptionReport, EnrichedApartmentReport } from '@/types/apartment';
import { sanitizeImageUrl } from '@/lib/utils';


// ─── MeterPhoto ──────────────────────────────────────────────────────────────
// Usa <img> nativo com loading="lazy" para carregar diretamente do CDN Cloudflare.
//
// Por que NÃO usamos next/image aqui:
//   - Filipetas renderizam até 500+ imagens de uma vez (ex: America Clube = 452 unidades).
//   - next/image roteia tudo pelo proxy Vercel /_next/image → 452 requisições simultâneas
//     ao servidor → fila → timeout → imagens não aparecem.
//   - As imagens já estão em cache no Cloudflare CDN (max-age=14400, cf-cache-status=HIT)
//     e servem JPEGs perfeitamente legíveis para impressão.
//   - loading="lazy" garante que apenas imagens visíveis no viewport são carregadas,
//     evitando sobrecarga no browser durante a renderização da lista completa.
//   - decoding="async" libera o thread principal durante a decodificação.
//
// sanitizeImageUrl: normaliza // no path (ex: //Bacarrini → /Bacarrini)
// onError: exibe placeholder com ícone de câmera se a imagem falhar.
interface MeterPhotoProps {
  urlCover: string | null;
}

const MeterPhoto: React.FC<MeterPhotoProps> = ({ urlCover }) => {
  const [imgError, setImgError] = useState(false);
  const src = urlCover ? sanitizeImageUrl(urlCover) : null;

  if (!src || imgError) {
    return (
      <div
        className="border-r-2 border-black p-1 flex flex-col items-center justify-center bg-gray-50 gap-1"
        style={{ minHeight: '120px' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-gray-400 text-[10px] text-center leading-tight">Sem imagem</p>
      </div>
    );
  }

  return (
    <div
      className="border-r-2 border-black p-1 flex items-center justify-center bg-gray-50"
      style={{ minHeight: '120px' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Foto do medidor"
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
};

// ─── FilipetaGridReport ───────────────────────────────────────────────────────

interface FilipetaGridReportProps {
  report: EnrichedApartmentReport;
  dealershipReading: any;
  description?: string | null;
}

const FilipetaGridReport: React.FC<FilipetaGridReportProps> = ({ report, dealershipReading, description }) => {
  const { apartment, lastReading, history } = report;
  const complex = apartment?.block?.complex as any;
  const company = complex?.company as any;
  const block = apartment?.block as any;

  const companyName = company ? (company.socialName || '') : 'referência pendente';
  const complexName = complex ? (complex.socialName || '') : 'referência pendente';
  const blockName = block ? (block.name || '') : 'referência pendente';
  const apartmentName = apartment ? (apartment.name || '') : 'referência pendente';

  // Endereço do CONDOMÍNIO (complex) — sem fallback para empresa
  const complexStreet = complex?.street?.trim() || '';
  const companyStreetLine = complexStreet
    ? `${complexStreet}${complex.number ? `, ${complex.number}` : ''}${complex.neighborhood ? `, ${complex.neighborhood}` : ''}`
    : '';
  const complexCity = complex?.city?.trim() || '';
  const complexState = complex?.state?.trim() || '';
  const complexZip = complex?.zipcode?.trim() || '';
  const companyCityStateLine = (complexCity || complexState || complexZip)
    ? `${complexCity}${(complexCity && complexState) ? ' - ' : ''}${complexState}${complexZip ? ` - CEP: ${complexZip}` : ''}`
    : '';
  
  const prevReport1 = history?.[0];
  const prevReport2 = history?.[1];
  const hasHistory = Array.isArray(history) && history.length > 0;
  const historyMissingLabel = hasHistory ? 'ref. pend.' : '';

  const emissionDate = format(new Date(), 'dd/MM/yyyy HH:mm');
  
  const monthName = report.monthRef 
    ? format(new Date(Number(report.yearRef), Number(report.monthRef) - 1), 'MMMM', { locale: ptBR })
    : 'ref. pendente';
  const monthYear = report.yearRef ? `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} - ${report.yearRef}` : 'ref. pendente';

  const parseReadAtDate = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const parseDateYmd = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const currentReadingDate = parseReadAtDate(lastReading?.readAtDate);
  const previousReadingDate = parseReadAtDate(prevReport1?.lastReading?.readAtDate);
  const totalDays = Number.isFinite(Number(dealershipReading?.totalDays))
    ? Number(dealershipReading.totalDays)
    : null;
  const derivedStartDate = currentReadingDate && totalDays != null
    ? new Date(currentReadingDate.getTime() - totalDays * 24 * 60 * 60 * 1000)
    : null;

  const periodStartDate = previousReadingDate || derivedStartDate || null;
  const periodEndDate = currentReadingDate || null;

  const nextReadingDateFormatted = lastReading?.nextReadingDate
    ? format(parseDateYmd(lastReading.nextReadingDate) || new Date(lastReading.nextReadingDate), 'dd/MM/yyyy')
    : 'refer?ncia pendente';

  const periodStartFormatted = periodStartDate
    ? format(periodStartDate, 'dd/MM/yyyy')
    : 'refer?ncia pendente';

  const periodEndFormatted = periodEndDate
    ? format(periodEndDate, 'dd/MM/yyyy')
    : 'refer?ncia pendente';

  const monthRefStr = String(report.monthRef).padStart(2, '0');

  return (
    <div className="filipeta-grid-report bg-white p-0 break-inside-avoid-page" style={{ fontSize: '11pt' }}>
      {/* MAIN CONTAINER: Logo + Info on left, Meter photo on right */}
      <div className="border-2 border-b-0 border-black">
        
        {/* TOP HEADER SECTION */}
        <div className="grid grid-cols-3 border-b-2 border-black">
          {/* Left: Logo */}
          <div className="border-r-2 border-black py-1 px-2 flex items-center justify-center" style={{ minHeight: '40px' }}>
            <div className="relative w-12 h-12">
              <Image
                src="/logo-quadrada-2.jpg"
                alt="Logo"
                width={48}
                height={48}
                objectFit="contain"
              />
            </div>
          </div>

          {/* Middle: Company and Complex Info */}
          <div className="border-r-2 border-black py-1 px-2">
            <p className="font-bold text-xs leading-tight">{companyName}</p>
            <p className="font-bold text-xs leading-tight">{complexName}</p>
            <p className="text-xs leading-tight">Bloco {blockName}</p>
            <p className="text-xs leading-tight">{apartmentName && (apartmentName.toLowerCase().includes('casa') || apartmentName.toLowerCase().includes('apto')) ? apartmentName : `Apto ${apartmentName}`}</p>
            <p className="text-xs leading-tight">
              {companyStreetLine}
            </p>
            <p className="text-xs leading-tight">
              {companyCityStateLine}
            </p>
          </div>

          {/* Right: IDs and Contact */}
          <div className="py-1 px-2">
            <div className="grid grid-cols-2 gap-x-1 text-xs">
              <div className="border-r-2 border-black pr-2">
                <p className="font-bold leading-tight">Emitido em:</p>
                <p className="text-xs leading-tight">{emissionDate}</p>
              </div>
              <div className="pl-1">
                <p className="font-bold leading-tight">Mês Ref.</p>
                <p className="text-xs leading-tight">{monthYear}</p>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Meter photo on left, all info on right */}
        <div className="grid grid-cols-3 border-b-2 border-black">
          
          {/* Left: Meter Photo + Aviso */}
          <div className="flex flex-col">
            <MeterPhoto urlCover={lastReading?.urlCover ?? null} />
            <div className="flex items-start gap-1 px-1 py-1 bg-gray-50 print:hidden">
              <Info className="w-2.5 h-2.5 text-gray-400 shrink-0 mt-0.5" />
              <p className="text-[8px] leading-tight text-gray-500">
                Imagem processada com aprimoramento óptico para garantir precisão na leitura.
                Pequenas diferenças visuais são artefatos do processamento e não alteram o valor.
              </p>
            </div>
          </div>

          {/* Right: All Information */}
          <div className="col-span-2">
            
            {/* CONSUMPTION HISTORY TABLE */}
            <div className="border-b-2 border-black">
              <p className="font-bold text-xs py-0.5 px-1 border-b-2 border-black bg-gray-100 leading-tight">HISTÓRICO DE CONSUMO</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-black">
                    <th className="border-r border-black py-0.5 px-1 text-left font-bold">Mês</th>
                    <th className="border-r border-black py-0.5 px-1 text-center font-bold">cons. m³</th>
                    <th className="border-r border-black py-0.5 px-1 text-left font-bold">Mês</th>
                    <th className="border-r border-black py-0.5 px-1 text-center font-bold">cons. m³</th>
                    <th className="border-r border-black py-0.5 px-1 text-left font-bold">Mês</th>
                    <th className="py-0.5 px-1 text-center font-bold">cons. m³</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{prevReport2 ? `${String(prevReport2.monthRef).padStart(2, '0')}/${prevReport2.yearRef}`: historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{prevReport2 ? prevReport2.consumption?.toFixed(6) : historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{prevReport1 ? `${String(prevReport1.monthRef).padStart(2, '0')}/${prevReport1.yearRef}`: historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{prevReport1 ? prevReport1.consumption?.toFixed(6) : historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{monthRefStr}/{report.yearRef}</td>
                    <td className="py-0.5 px-1 text-center text-xs">{report.consumption?.toFixed(6) || '0.000000'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* METER DETAILS SECTION */}
            <div className="border-b-2 border-black">
              <p className="font-bold text-xs py-0.5 px-1 border-b-2 border-black bg-gray-100 leading-tight">CAD. Descrição</p>
              <div className="py-0.5 px-1 text-xs">
                {description ? (
                  <p className="leading-tight whitespace-pre-wrap">{description}</p>
                ) : (
                  <div className="h-12"></div> // Empty space if no description
                )}
              </div>
            </div>

            <div className="border-b-2 border-black">
              <p className="font-bold text-xs py-0.5 px-1 border-b-2 border-black bg-gray-100 leading-tight">
                CONSUMO ÁREA COMUM (RATEIO)
              </p>
              <div className="py-0.5 px-1 text-xs text-left">
                <p className="leading-tight">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(report.
                  partial ?? 0)}
                </p>
              </div>
            </div>

            {/* READING DETAILS TABLE */}
            <div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="border-r border-black py-0.5 px-1 font-bold text-left leading-tight">LEITURA ANT.<br/>m³</th>
                    <th className="border-r border-black py-0.5 px-1 font-bold text-left leading-tight">LEITURA ATUAL<br/>m³</th>
                    <th className="border-r border-black py-0.5 px-1 font-bold text-center leading-tight">CONSUMO m³</th>
                    <th className="border-r border-black py-0.5 px-1 font-bold text-center leading-tight">PERÍODO DE<br/>CONSUMO</th>
                    <th className="border-r border-black py-0.5 px-1 font-bold text-center leading-tight">PRÓXIMA LEIT.<br/>PREVISTA</th>
                    <th className="py-0.5 px-1 font-bold text-center leading-tight">TOTAL A PAGAR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{prevReport1?.lastReading?.reading?.toFixed(3) ?? 'ref. pend.'}</td>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{lastReading?.reading?.toFixed(3) ?? 'ref. pend.'}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{report.consumption?.toFixed(6) ?? 'ref. pend.'}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs leading-tight">{periodStartFormatted}<br/>a<br/>{periodEndFormatted}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{nextReadingDateFormatted}</td>
                    <td className="py-0.5 px-1 text-center text-xs font-bold">{report.totalUnit?.toFixed(2) ?? 'ref. pend.'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER SECTION */}
      <div className="border-2 border-black border-t-0 py-1 px-2 text-center text-xs">
        <p className="leading-tight">CENTRAL DE ATENDIMENTO: <a href="tel:40037945">4003-7945</a> ou <a href="mailto:medicao@acquaxdobrasil.com.br">medicao@acquaxdobrasil.com.br</a></p>
      </div>
    </div>
  );
};

export default FilipetaGridReport;
