'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRolePreview } from '@/contexts/RolePreviewContext';

const NEXT_PUBLIC_API_URL = '/api';

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
    readAt?: string | null;
    readAtDate?: string | null;
    nextReadingDate?: string | null;
    readingDate?: string | null;
    readingDateNext?: string | null;
    urlCover: string | null;
    registerName?: string | null;
  } | null;
  history: Array<{
    monthRef: string;
    yearRef: string;
    consumption: number | null;
    lastReading?: { 
      reading: number | null; 
      readAt?: string | null;
      readAtDate?: string | null;
      readingDate?: string | null;
    } | null;
  }>;
  dealershipReading: {
    id: string;
    totalDays?: number | null;
    readingDate?: string | null;
    readingDateNext?: string | null;
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
  blockId?: string;
  apartmentId?: string;
  utilityType?: string;
  enabled?: boolean;
}

export function useMeterReport({ month, year, complexId, blockId, apartmentId, utilityType, enabled = true }: UseMeterReportProps) {
  const { isPreviewing, effectiveContext } = useRolePreview();
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
    if (blockId) params.block_id = blockId;
    if (apartmentId) params.apartment_id = apartmentId;
    if (utilityType) params.utility_type = utilityType;

    axios
      .get<MeterReportData>(`${NEXT_PUBLIC_API_URL}/meter-report`, {
        params,
        withCredentials: true,
      })
      .then(res => {
        if (!cancelled) {
          let reportData = res.data;

          // FILTRAGEM DE SEGURANÇA NO PREVIEW MODE
          if (isPreviewing && effectiveContext) {
            const allowedComplexIds = effectiveContext.accessibleComplexIds || [];
            const allowedAptIds = effectiveContext.apartments?.map((a: any) => a.id) || [];

            if (reportData.list) {
              reportData.list = reportData.list.filter((item: any) => {
                const complexIdMatch = allowedComplexIds.includes(item.apartment?.block?.complexId);
                const aptIdMatch = allowedAptIds.length === 0 || allowedAptIds.includes(item.apartmentId);
                return complexIdMatch && aptIdMatch;
              });
              reportData.totalCount = reportData.list.length;
            }
          }

          setData(reportData);
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
  }, [month, year, complexId, blockId, apartmentId, utilityType, enabled]);

  return { data, loading, error };
}
