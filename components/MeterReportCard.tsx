'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MeterReportItem } from '@/hooks/useMeterReport';
import { sanitizeImageUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Droplets, Calendar, Building2, DoorClosed, ZoomIn, X, Printer } from 'lucide-react';

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

// ─── Modal de Foto Expandida ───────────────────────────────────────────────────
// Permite ver a foto completa do medidor ao tocar/clicar nela
interface PhotoModalProps {
  url: string;
  onClose: () => void;
}

const PhotoModal: React.FC<PhotoModalProps> = ({ url, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      {/* Botão fechar */}
      <button
        className="absolute top-4 right-4 z-10 bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
        onClick={onClose}
        aria-label="Fechar foto"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Instrução */}
      <p className="absolute top-4 left-4 text-white/70 text-xs">
        Toque para fechar
      </p>

      {/* Foto em tamanho completo */}
      <div
        className="relative w-full max-w-md max-h-[85vh] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Usamos <img> nativo para garantir que a foto inteira seja mostrada sem crop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Foto completa do medidor"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '85vh' }}
        />
      </div>
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────────────
const MeterReportCard: React.FC<MeterReportCardProps> = ({ report, showAddress = true }) => {
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  const { apartment, lastReading, history, dealershipReading } = report;
  const complex = apartment?.block?.complex as any;
  const block = apartment?.block as any;

  const complexName = complex?.socialName || complex?.aliasName || 'Condomínio';
  const blockName = block?.name || '';
  const apartmentName = apartment?.name || '';

  const hasAddress = complex?.street?.trim();
  const addressLine = hasAddress
    ? `${complex.street}${complex.number ? `, ${complex.number}` : ''}${complex.neighborhood ? ` - ${complex.neighborhood}` : ''}`
    : '';

  const prevReport1 = history?.[0];
  const prevReport2 = history?.[1];

  const monthName = report.monthRef
    ? format(new Date(Number(report.yearRef), Number(report.monthRef) - 1), 'MMMM', { locale: ptBR })
    : '';
  const monthYearLabel = monthName
    ? `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} / ${report.yearRef}`
    : `${report.monthRef}/${report.yearRef}`;

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

  const photoUrl = lastReading?.urlCover ? sanitizeImageUrl(lastReading.urlCover) : null;

  return (
    <>
      {/* ── Modal de foto expandida ─────────────────────────────────────────── */}
      {photoModalOpen && photoUrl && (
        <div className="meter-photo-modal">
          <PhotoModal url={photoUrl} onClose={() => setPhotoModalOpen(false)} />
        </div>
      )}

      <div className="meter-report-card-print bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col w-full">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-sm truncate">{complexName}</span>
          </div>
          <Badge variant="secondary" className="text-xs bg-white/20 text-white border-white/30 shrink-0 whitespace-nowrap">
            {monthYearLabel}
          </Badge>
        </div>

        {/* ── Unit info ───────────────────────────────────────────────────────── */}
        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-gray-700">
            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Bloco {blockName}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-700">
            <DoorClosed className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>
              {apartmentName && (apartmentName.toLowerCase().includes('casa') || apartmentName.toLowerCase().includes('apto'))
                ? apartmentName
                : `Apto ${apartmentName}`}
            </span>
          </div>
          {showAddress && addressLine && (
            <p className="text-xs text-gray-400 hidden sm:block truncate">{addressLine}</p>
          )}
        </div>

        {/* ── Foto do medidor — TOPO no mobile, destaque total ────────────────── */}
        {/* A foto vem ANTES de tudo no mobile para aparecer sem scroll */}
        <div
          className={`meter-report-photo-area w-full relative bg-black ${photoUrl ? 'cursor-pointer group' : ''}`}
          onClick={photoUrl ? () => setPhotoModalOpen(true) : undefined}
          role={photoUrl ? 'button' : undefined}
          aria-label={photoUrl ? 'Ampliar foto do medidor' : undefined}
        >
          {photoUrl ? (
            <>
              {/*
               * TELA: next/image com fill (position:absolute) — ótima qualidade na tela.
               * PRINT: next/image com fill NÃO é impresso pela maioria dos navegadores
               *        porque usa position:absolute. Por isso existe o <img> abaixo com
               *        classe "meter-photo-print" — invisível na tela, visível só no print.
               */}

              {/* ── Versão TELA (oculta no print via CSS) ── */}
              <div className="meter-photo-screen relative w-full h-[280px] sm:h-[200px] overflow-hidden bg-black">
                <Image
                  src={photoUrl}
                  alt="Foto do medidor"
                  fill
                  sizes="(max-width: 640px) 100vw, 176px"
                  className="object-contain transition-transform duration-300 group-hover:scale-105"
                  priority
                />
                {/* Overlay hover + ícone de zoom */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/50 rounded-full p-3">
                    <ZoomIn className="w-6 h-6 text-white" />
                  </div>
                </div>
                {/* Badge "Ampliar" — mobile only */}
                <div className="absolute bottom-2 right-2 sm:hidden bg-black/50 text-white text-[10px] rounded-full px-2 py-0.5 flex items-center gap-1">
                  <ZoomIn className="w-3 h-3" />
                  Ampliar
                </div>
              </div>

              {/* ── Versão PRINT (oculta na tela, visível no print) ──
               *  <img> nativo com position:static → impresso 100% por todos navegadores.
               *  object-contain + fundo preto = mesma aparência da versão tela.
               */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Foto do medidor"
                className="meter-photo-print"
                style={{
                  display: 'none',          /* oculto na tela — CSS print vai fazer display:block */
                  width: '100%',
                  maxHeight: '220px',
                  objectFit: 'contain',
                  background: '#000',
                }}
              />
            </>
          ) : (
            /* Placeholder quando não tem foto */
            <div className="w-full h-[140px] sm:h-[176px] bg-gray-100 border-b flex flex-col items-center justify-center gap-2">
              <Droplets className="w-10 h-10 text-gray-300" />
              <p className="text-gray-400 text-xs">Sem foto do medidor</p>
            </div>
          )}
        </div>

        {/* ── Dados da leitura ────────────────────────────────────────────────── */}
        <div className="flex flex-col divide-y divide-gray-100">

          {/* Leitura Ant. / Atual / Consumo */}
          <div className="grid grid-cols-3 text-center divide-x divide-gray-100">
            <div className="px-2 py-3">
              <p className="text-gray-400 text-[11px] font-medium mb-1 leading-tight">Leitura Ant.</p>
              <p className="font-bold text-gray-800 text-sm leading-tight">
                {prevReport1?.lastReading?.reading?.toFixed(3) ?? '—'}
              </p>
              <p className="text-gray-400 text-[10px]">m³</p>
            </div>
            <div className="px-2 py-3">
              <p className="text-gray-400 text-[11px] font-medium mb-1 leading-tight">Leitura Atual</p>
              <p className="font-bold text-blue-700 text-sm leading-tight">
                {lastReading?.reading?.toFixed(3) ?? '—'}
              </p>
              <p className="text-blue-400 text-[10px]">m³</p>
            </div>
            <div className="px-2 py-3">
              <p className="text-gray-400 text-[11px] font-medium mb-1 leading-tight">Consumo</p>
              <p className="font-bold text-teal-700 text-sm leading-tight">
                {report.consumption?.toFixed(3) ?? '—'}
              </p>
              <p className="text-teal-400 text-[10px]">m³</p>
            </div>
          </div>

          {/* Período de Consumo / Próxima Leitura */}
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <div className="px-3 py-2.5">
              <p className="text-gray-400 text-[11px] font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" />
                Período de Consumo
              </p>
              <p className="text-gray-700 text-xs">{periodStartFormatted}</p>
              <p className="text-gray-400 text-[10px]">→</p>
              <p className="text-gray-700 text-xs">{periodEndFormatted}</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-gray-400 text-[11px] font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" />
                Próxima Leitura
              </p>
              <p className="text-gray-700 text-xs">{nextReadingDateFormatted}</p>
            </div>
          </div>

          {/* Área Comum / Água+Esgoto / Total a Pagar */}
          <div className="grid grid-cols-3 text-center divide-x divide-gray-100">
            <div className="px-2 py-2.5">
              <p className="text-gray-400 text-[11px] font-medium mb-1 leading-tight">Área Comum</p>
              <p className="font-semibold text-gray-700 text-xs">{formatCurrency(report.partial)}</p>
            </div>
            <div className="px-2 py-2.5">
              <p className="text-gray-400 text-[11px] font-medium mb-1 leading-tight">Água/Esgoto</p>
              <p className="font-semibold text-gray-700 text-xs">
                {report.totalUnit != null && report.partial != null
                  ? formatCurrency(report.totalUnit - report.partial)
                  : '—'}
              </p>
            </div>
            <div className="px-2 py-2.5 bg-blue-50">
              <p className="text-blue-500 text-[11px] font-medium mb-1 leading-tight">Total a Pagar</p>
              <p className="font-bold text-blue-700 text-xs">{formatCurrency(report.totalUnit)}</p>
            </div>
          </div>

        </div>

        {/* ── History ─────────────────────────────────────────────────────────── */}
        <div className="border-t bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Histórico de Consumo</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[prevReport2, prevReport1, report].map((r, i) => {
              const isCurrentMonth = i === 2;
              const mRef = r ? String(r.monthRef).padStart(2, '0') : null;
              const yRef = r?.yearRef;
              const cons = r?.consumption;
              return (
                <div
                  key={i}
                  className={`rounded-lg border px-2 py-2 ${isCurrentMonth ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
                >
                  <p className={`text-[11px] font-medium mb-0.5 ${isCurrentMonth ? 'text-blue-600' : 'text-gray-500'}`}>
                    {mRef && yRef ? `${mRef}/${yRef}` : '—'}
                  </p>
                  <p className={`font-bold text-sm ${isCurrentMonth ? 'text-blue-700' : 'text-gray-700'}`}>
                    {cons != null ? `${cons.toFixed(3)} m³` : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="border-t px-4 py-1.5 text-xs text-gray-400 flex justify-between items-center">
          <span>Emitido em {emissionDate}</span>
          <span className="text-blue-500 font-medium">AcquaX</span>
        </div>
      </div>
    </>
  );
};

export default MeterReportCard;
