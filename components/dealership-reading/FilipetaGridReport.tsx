'use client';

import React from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ApartmentWithConsumptionReport, EnrichedApartmentReport } from '@/types/apartment';
import { sanitizeImageUrl } from '@/lib/utils';


interface FilipetaGridReportProps {
  report: EnrichedApartmentReport;
  dealershipReading: any;
  description?: string | null;
}

const FilipetaGridReport: React.FC<FilipetaGridReportProps> = ({ report, dealershipReading, description }) => {
  const { apartment, lastReading, history } = report;
  const isGas = dealershipReading?.type === 'gas';
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
  const reportConsumption = Number(isGas ? (report.consumptionGasValue ?? 0) : (report.consumption ?? 0));
  const prevReport1Consumption = Number(isGas ? (prevReport1?.consumptionGasValue ?? 0) : (prevReport1?.consumption ?? 0));
  const prevReport2Consumption = Number(isGas ? (prevReport2?.consumptionGasValue ?? 0) : (prevReport2?.consumption ?? 0));
  const totalToPay = Number(isGas ? (report.totalGasValue ?? 0) : (report.totalUnit ?? 0));
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
          
          {/* Left: Meter Photo */}
          <div className="border-r-2 border-black py-1 px-1 flex items-center justify-center bg-gray-50" style={{ minHeight: '100px' }}>
            {lastReading?.urlCover ? (
              <div className="relative w-full h-full aspect-square overflow-hidden">
                <Image
                  src={sanitizeImageUrl(lastReading.urlCover)}
                  alt="Foto do medidor"
                  fill
                  sizes="140px"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full max-w-[140px] max-h-[140px] aspect-square border-2 border-gray-400 bg-gray-200">
                <p className="text-gray-600 text-xs text-center">Sem imagem</p>
              </div>
            )}
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
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{prevReport2 ? prevReport2Consumption.toFixed(6) : historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{prevReport1 ? `${String(prevReport1.monthRef).padStart(2, '0')}/${prevReport1.yearRef}`: historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{prevReport1 ? prevReport1Consumption.toFixed(6) : historyMissingLabel}</td>
                    <td className="border-r border-black py-0.5 px-1 text-xs">{monthRefStr}/{report.yearRef}</td>
                    <td className="py-0.5 px-1 text-center text-xs">{reportConsumption.toFixed(6)}</td>
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
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{reportConsumption.toFixed(6)}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs leading-tight">{periodStartFormatted}<br/>a<br/>{periodEndFormatted}</td>
                    <td className="border-r border-black py-0.5 px-1 text-center text-xs">{nextReadingDateFormatted}</td>
                    <td className="py-0.5 px-1 text-center text-xs font-bold">{totalToPay.toFixed(2)}</td>
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
