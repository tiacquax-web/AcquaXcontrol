import { useState, useEffect } from 'react';
import { getReadings, createPreReading, CreatePreReadingInput, updateReading as updateReadingService, createReadingsFromSheet } from '@/services/readingsService';
import { ReadingFull } from '@/types/fullTypes';
import { useDebounce } from './use-debounce';

interface useReadingsProps {
  enabled?: boolean;
  readingId?: string;
  companyId?: string;
  complexId?: string;
  blockId?: string;
  apartmentId?: string;
  meterId?: string;
  isPreReading?: boolean;
  withDevice?: boolean;
  withMeter?: boolean;
  withBlock?: boolean;
  withApartment?: boolean;
  withComplex?: boolean;
  fromDate?: Date;
  toDate?: Date;
  take?: number;
  skip?: number;
}

export const useReadings = ({ enabled=true, withApartment, withBlock, withComplex, readingId, fromDate, toDate, meterId, companyId, complexId, blockId, apartmentId, isPreReading, withDevice, withMeter, take, skip, }: useReadingsProps) => {
  const [readings, setReadings] = useState<ReadingFull[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState<number>(0); // State to trigger re-fetching

  const refetch = () => {
      setSequence((prev) => prev + 1); // Increment the sequence to trigger re-fetching
  }

  const debouncedTake = useDebounce(take, 350);
  const debouncedSkip = useDebounce(skip, 350);

  useEffect(() => {
    if (!enabled) {
      setReadings([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const fetchReadings = async () => {
      try {
        setLoading(true);
        const data = await getReadings({ withApartment, withBlock, withComplex, readingId, fromDate, toDate, meterId, companyId, complexId, blockId, apartmentId, isPreReading, withDevice, withMeter, take: debouncedTake, skip: debouncedSkip, });
        setReadings(data.list);
        setTotalCount(data.totalCount);
        setError(null);
      } catch (error: any) {
        const message = error.response?.data?.error || error.message || 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    };    fetchReadings();
  }, [ sequence, companyId, complexId, blockId, apartmentId, isPreReading, withDevice, debouncedTake, debouncedSkip, meterId, fromDate, toDate]);

  return { totalCount, readings, loading, error, refetch };
};

export function useCreatePreReading() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const createPreReadingFn = async (input: CreatePreReadingInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPreReading(input);
      setData(result);
      return result;
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createPreReading: createPreReadingFn, loading, error, data };
}

export function useReadingMutations()  {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateReading = async (readingId: string, readingData: Partial<ReadingFull>) => {
    setLoading(true);
    setError(null);
    try {
      const updatedReading = await updateReadingService(readingId, { ...readingData }); // Assuming createPreReading can handle updates
      setLoading(false);
      return updatedReading;
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  const createReadingsFromSheetMutation = async (rows: any[], allowUpdates: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createReadingsFromSheet(rows, allowUpdates);
      return result;
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Unknown error';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return { updateReading, createReadingsFromSheetMutation, loading, error };
}
