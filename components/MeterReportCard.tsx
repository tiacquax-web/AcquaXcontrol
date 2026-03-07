'use client';

import React from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MeterReportItem } from '@/hooks/useMeterReport';
import { sanitizeImageUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Droplets, Calendar, Building2, DoorClosed } from 'lucide-react';

interface MeterReportCardProps {
  report: MeterReportItem;
  showAddress?: boolean;
}

const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

const parseReadAtDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseDateYmd = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const MeterReportCard: React.FC<MeterReportCardProps> = ({ report, showAddress = true }) => {
  const { apartment, lastReading, history, dealershipReading } = report;
  const complex = apartment?.block?.complex as any;
  const company = complex?.company as any;
  const block = apartment?.block as any;

  const complexName = complex?.socialName || complex?.aliasName || 'Condomínio';
  const blockName = block?.name || '';
  const apartmentName = apartment?.name || '';

  const hasAddress = complex?.street?.trim();
  const addressLine = hasAddress
    ? `${complex.street}${complex.number ? `, ${complex.number}` : ''}${complex.neighborhood ? ` - ${complex.neighborhood}` : ''}`
    : '';
  const cityLine = (complex?.city || complex?.state)
    ? `${complex.city || ''}${complex.city && complex.state ? ' - ' : ''}${complex.state || ''}${complex.zipcode ? ` - CEP: ${complex.zipcode}` : ''}`
    : '';

  const prevReport1 = history?.[0];
  const prevReport2 = history?.[1];

  const monthName = report.monthRef
    ? format(new Date(Number(report.yearRef), Number(report.monthRef) - 1), 'MMMM', { locale: ptBR })
    : '';
  const monthYearLabel = monthName
    ? `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} / ${report.yearRef}`
    : `${report.monthRef}/${report.yearRef}`;
  const monthRefStr = String(report.monthRef).padStart(2, '0');

  const currentReadingDate = parseReadAtDate(lastReading?.readAtDate);
  const previousReadingDate = parseReadAtDate(prevReport1?.lastReading?.readAtDate);
  const totalDays = Number.isFinite(Number(dealershipReading?.totalDays)) ? Number(dealershipReading!.totalDays) : null;
  const derivedStartDate = currentReadingDate && totalDays != null
    ? new Date(currentReadingDate.getTime() - totalDays * 24 * 60 * 60 * 1000)
    : null;

  const periodStartDate = previousReadingDate || derivedStartDate || null;
  const periodEndDate = currentReadingDate || null;

  const periodStartFormatted = periodStartDate ? format(periodStartDate, 'dd/MM/yyyy') : '—';
  const periodEndFormatted = periodEndDate ? format(periodEndDate, 'dd/MM/yyyy') : '—';

  const nextReadingDateFormatted = lastReading?.nextReadingDate
    ? format(parseDateYmd(lastReading.nextReadingDate) ?? new Date(lastReading.nextReadingDate), 'dd/MM/yyyy')
    : '—';

  const emissionDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm");

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          <span className="font-semibold text-sm truncate">{complexName}</span>
        </div>
        <Badge variant="secondary" className="text-xs bg-white/20 text-white border-white/30 shrink-0">
          {monthYearLabel}
        </Badge>
      </div>

      {/* Unit info */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-gray-700">
          <div className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <span>Bloco {blockName}</span>
          </div>
          <div className="flex items-center gap-1">
            <DoorClosed className="w-3.5 h-3.5 text-gray-400" />
            <span>
              {apartmentName && (apartmentName.toLowerCase().includes('casa') || apartmentName.toLowerCase().includes('apto'))
                ? apartmentName
                : `Apto ${apartmentName}`}
            </span>
          </div>
        </div>
        {showAddress && addressLine && (
          <p className="text-xs text-gray-400 hidden sm:block truncate max-w-[180px]">{addressLine}</p>
        )}
      </div>

      {/* Main content: photo + info */}
      <div className="flex gap-0 flex-1">
        {/* Photo — wider so the image is legible */}
        <div className="w-44 shrink-0 border-r bg-gray-50 flex items-center justify-center p-2">
          {lastReading?.urlCover ? (
            <div className="relative w-full aspect-square overflow-hidden rounded-md">
              <Image
                src={sanitizeImageUrl(lastReading.urlCover)}
                alt="Foto do medidor"
                fill
                sizes="176px"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="w-full aspect-square rounded-md bg-gray-200 border border-gray-300 flex items-center justify-center">
              <Droplets className="w-10 h-10 text-gray-400" />
            </div>
          )}
        </div>

        {/* Data */}
        <div className="flex-1 flex flex-col divide-y divide-gray-100">
          {/* Readings */}
          <div className="grid grid-cols-3 text-center text-xs divide-x divide-gray-100">
            <div className="px-2 py-2">
              <p className="text-gray-400 font-medium mb-0.5">Leitura Ant.</p>
              <p className="font-bold text-gray-800">{prevReport1?.lastReading?.reading?.toFixed(3) ?? '—'} m³</p>
            </div>
            <div className="px-2 py-2">
              <p className="text-gray-400 font-medium mb-0.5">Leitura Atual</p>
              <p className="font-bold text-blue-700">{lastReading?.reading?.toFixed(3) ?? '—'} m³</p>
            </div>
            <div className="px-2 py-2">
              <p className="text-gray-400 font-medium mb-0.5">Consumo</p>
              <p className="font-bold text-teal-700">{report.consumption?.toFixed(3) ?? '—'} m³</p>
            </div>
          </div>

          {/* Period + Next reading */}
          <div className="grid grid-cols-2 text-xs divide-x divide-gray-100">
            <div className="px-3 py-2">
              <p className="text-gray-400 font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Período de Consumo
              </p>
              <p className="text-gray-700">
                {periodStartFormatted} <span className="text-gray-400">→</span> {periodEndFormatted}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="text-gray-400 font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Próxima Leitura
              </p>
              <p className="text-gray-700">{nextReadingDateFormatted}</p>
            </div>
          </div>

          {/* Values */}
          <div className="grid grid-cols-3 text-center text-xs divide-x divide-gray-100">
            <div className="px-2 py-2">
              <p className="text-gray-400 font-medium mb-0.5">Área Comum</p>
              <p className="font-semibold text-gray-700">{formatCurrency(report.partial)}</p>
            </div>
            <div className="px-2 py-2">
              <p className="text-gray-400 font-medium mb-0.5">Água/Esgoto</p>
              <p className="font-semibold text-gray-700">
                {report.totalUnit != null && report.partial != null
                  ? formatCurrency(report.totalUnit - report.partial)
                  : '—'}
              </p>
            </div>
            <div className="px-2 py-2 bg-blue-50">
              <p className="text-blue-500 font-medium mb-0.5">Total a Pagar</p>
              <p className="font-bold text-blue-700">{formatCurrency(report.totalUnit)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="border-t bg-gray-50 px-4 py-2">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Histórico de Consumo</p>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {[prevReport2, prevReport1, report].map((r, i) => {
            const isCurrentMonth = i === 2;
            const mRef = r ? String(r.monthRef).padStart(2, '0') : null;
            const yRef = r?.yearRef;
            const cons = r?.consumption;
            return (
              <div
                key={i}
                className={`rounded-lg border px-2 py-1.5 ${isCurrentMonth ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
              >
                <p className={`font-medium mb-0.5 ${isCurrentMonth ? 'text-blue-600' : 'text-gray-500'}`}>
                  {mRef && yRef ? `${mRef}/${yRef}` : '—'}
                </p>
                <p className={`font-bold ${isCurrentMonth ? 'text-blue-700' : 'text-gray-700'}`}>
                  {cons != null ? `${cons.toFixed(3)} m³` : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-1.5 text-xs text-gray-400 flex justify-between items-center">
        <span>Emitido em {emissionDate}</span>
        <span className="text-blue-500">AcquaX</span>
      </div>
    </div>
  );
};

export default MeterReportCard;
