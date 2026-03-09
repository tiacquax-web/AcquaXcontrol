'use client';

import { useState, useEffect } from 'react';
import axiosClient from '@/services/axiosClient';



export interface MeterReportItem {
  id: string;
  monthRef: string;
  yearRef: string;
  consumption: number | null;
  totalUnit: number | null;
  partial: number | null;
  apartmentId: string;
  dealershipReadingId: string | null;
  apartment: {
    id: string;
    name: string;
    block: {
      id: string;
      name: string;
      complexId: string;
      complex: {
        id: string;
        socialName: string;
        aliasName?: string | null;
        street?: string | null;
        number?: string | null;
        neighborhood?: string | null;
        city?: string | null;
        state?: string | null;
        zipcode?: string | null;
        company?: { id: string; socialName: string; name?: string } | null;
      };
    };
  };
  lastReading: {
    id: string;
    reading: number | null;
    readAtDate: string | null;
    nextReadingDate: string | null;
    urlCover: string | null;
    registerName?: string | null;
  } | null;
  history: Array<{
    monthRef: string;
    yearRef: string;
    consumption: number | null;
    lastReading?: { reading: number | null; readAtDate: string | null } | null;
  }>;
  dealershipReading: {
    id: string;
    totalDays?: number | null;
    readingDate?: string | null;
    nextReadingDate?: string | null;
    dealership?: { name: string } | null;
    complex?: { socialName: string } | null;
  } | null;
}

export interface MeterReportData {
  list: MeterReportItem[];
  totalCount: number;
  dealershipReadings: any[];
}

interface UseMeterReportProps {
  month: string; // "01".."12"
  year: string;  // "2026"
  complexId?: string;
  apartmentId?: string;
  enabled?: boolean;
}

export function useMeterReport({ month, year, complexId, apartmentId, enabled = true }: UseMeterReportProps) {
  const [data, setData] = useState<MeterReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !month || !year) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Record<string, string> = { month, year };
    if (complexId) params.complex_id = complexId;
    if (apartmentId) params.apartment_id = apartmentId;

    axiosClient
      .get<MeterReportData>('meter-report', {
        params,
        withCredentials: true,
      })
      .then(res => {
        if (!cancelled) {
          setData(res.data);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || 'Erro ao buscar filipeta');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [month, year, complexId, apartmentId, enabled]);

  return { data, loading, error };
}
