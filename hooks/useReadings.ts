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

import { useRolePreview } from '@/contexts/RolePreviewContext';

export const useReadings = ({ enabled=true, withApartment, withBlock, withComplex, readingId, fromDate, toDate, meterId, companyId, complexId, blockId, apartmentId, isPreReading, withDevice, withMeter, take, skip, }: useReadingsProps) => {
  const { isPreviewing, effectiveContext } = useRolePreview();
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
        
        let targetCompanyId = companyId;
        let targetComplexId = complexId;
        let targetBlockId = blockId;
        let targetApartmentId = apartmentId;

        // FILTRAGEM DE SEGURANÇA NO PREVIEW MODE
        if (isPreviewing && effectiveContext) {
            if (effectiveContext.apartments?.length > 0) {
                targetApartmentId = targetApartmentId || effectiveContext.apartments[0].id;
            } else if (effectiveContext.accessibleComplexIds?.length > 0) {
                targetComplexId = targetComplexId || effectiveContext.accessibleComplexIds[0];
            } else if (effectiveContext.companyIds?.length > 0) {
                targetCompanyId = targetCompanyId || effectiveContext.companyIds[0];
            }
        }

        const data = await getReadings({ withApartment, withBlock, withComplex, readingId, fromDate, toDate, meterId, companyId: targetCompanyId, complexId: targetComplexId, blockId: targetBlockId, apartmentId: targetApartmentId, isPreReading, withDevice, withMeter, take: debouncedTake, skip: debouncedSkip, });
        
        let list = data.list || [];
        let count = data.totalCount || 0;

        if (isPreviewing && effectiveContext) {
            const allowedComplexIds = effectiveContext.accessibleComplexIds || [];
            const allowedAptIds = effectiveContext.apartments?.map((a: any) => a.id) || [];
            list = list.filter((r: any) => {
                const complexIdMatch = allowedComplexIds.length === 0 || allowedComplexIds.includes(r.meter?.apartment?.block?.complexId || r.complexId);
                const aptIdMatch = allowedAptIds.length === 0 || allowedAptIds.includes(r.apartmentId || r.meter?.apartmentId);
                return complexIdMatch && aptIdMatch;
            });
            count = list.length;
        }

        setReadings(list);
        setTotalCount(count);
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
