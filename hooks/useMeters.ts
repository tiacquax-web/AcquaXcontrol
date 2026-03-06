import { useState, useEffect } from 'react';
import { Meter } from '@prisma/client';
import { getMeters, createMeter as createMeterService, updateMeter as updateMeterService, deleteMeter as deleteMeterService, createMetersFromSheet } from '@/services/metersService';
import { selectMeterProps } from '@/types/meter';
import { useDebounce } from './use-debounce';
import { MeterFull } from '@/types/fullTypes';

interface useMeterProps {
  apartmentId?: string
  blockId?: string
  meterId?: string
  take?: number
  search?: string
  orderBy?: string
  meterTypeName?: string
  mustHaveReadings?: boolean
  select?: selectMeterProps
}

export function useMeter({ apartmentId, blockId, meterId, take, search, orderBy, meterTypeName, mustHaveReadings, select }: useMeterProps) {
  const [meters, setMeters] = useState<MeterFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const fetchUserMeters = async () => {
      try {
        const data = await getMeters({ apartmentId, blockId, meterId, take, search, orderBy, meterTypeName });
        setMeters(data.list);
        setTotalCount(data.totalCount || 0);
        setError(null);
        console.log(meters);
      } catch (error: any) {
        console.error(error);
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserMeters();
  }, [blockId]);

  return { totalCount, meters, loading, error };
}


export interface useMetersProps {
  companyId?: string;
  complexId?: string;
  blockId?: string;
  apartmentId?: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  nameQuery?: string;
  search?: string;
  meterTypeName?: string;
  enabled?: boolean;
  withApartment?: boolean;
  withBlock?: boolean;
  withComplex?: boolean;
  withTypeMeter?: boolean;
}

export const useMeters = ({ companyId, complexId, blockId, nameQuery, apartmentId, search, take, skip, orderBy, enabled = true, withApartment, withBlock, withComplex, withTypeMeter }: useMetersProps) => {
  const [meters, setMeters] = useState<MeterFull[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState<number>(0); // Sequence for triggering re-fetching

  const debouncedNameQuery = useDebounce(nameQuery, 350);
  const debouncedSearch = useDebounce(search, 350);

  const refetch = () => {
    setLoading(true);
    setError(null);
    setSequence((prev) => prev + 1); // Increment sequence to trigger re-fetching
  }

  useEffect(() => {
    // Só busca meters se enabled for true
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchMeters = async () => {
      setLoading(true);
      try {
        const data = await getMeters({ companyId, complexId, blockId, search: debouncedSearch, apartmentId, take, skip, orderBy, withApartment, withBlock, withComplex, withTypeMeter });
        setMeters(data.list);
        setTotalCount(data.totalCount);
        setError(null);
      } catch (error: any) {
        const message = error.response?.data?.error || error.message || "Unknown error";
        setError(message);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchMeters();
  }, [companyId, complexId, blockId, apartmentId, debouncedNameQuery, debouncedSearch, take, skip, orderBy, enabled, sequence]);

  return { totalCount, meters, loading, error, refetch };
};

export const useMeterMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMeter = async (meterData: Meter) => {
    setLoading(true);
    setError(null);
    try {
      await createMeterService(meterData);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const updateMeter = async (meterId: string, meterData: Meter) => {
    setLoading(true);
    setError(null);
    try {
      await updateMeterService(meterId, meterData);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const deleteMeter = async (meterId: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteMeterService(meterId);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const createMetersFromSheetMutation = async (rows: any[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createMetersFromSheet(rows);
      return result;
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { createMeter, updateMeter, deleteMeter, createMetersFromSheet: createMetersFromSheetMutation, loading, error };
};