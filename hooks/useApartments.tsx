import { useState, useEffect } from 'react';
import { getApartments, createApartment as createApartmentService, updateApartment as updateApartmentService, deleteApartment as deleteApartmentService } from '@/services/apartmentService';
import type { ApartmentWithBlockAndComplex } from '@/services/apartmentService';
import { PermissionableEntity } from '@prisma/client';
import { useDebounce } from './use-debounce';
import type { Apartment } from '@prisma/client';
import { ApartmentFull } from '@/types/fullTypes';
import { useRolePreview } from '@/contexts/RolePreviewContext';

interface useApartmentsProps {
  withComplex?: boolean;
  withBlock?: boolean;
  withCompany?: boolean;
  companyId?: string;
  complexId?: string;
  blockId?: string;
  nameQuery?: string;
  getAvailableForEntity?: PermissionableEntity;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  enabled?: boolean;
}

export const useApartments = ({ withComplex, withBlock, withCompany, companyId, complexId, blockId, nameQuery, getAvailableForEntity, take = 10, skip = 0, orderBy, orderDirection, enabled = true }: useApartmentsProps) => {
  const { isPreviewing, effectiveContext } = useRolePreview();
  const [apartments, setApartments] = useState<ApartmentFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [sequence, setSequence] = useState(0)

  const debouncedNameQuery = useDebounce(nameQuery, nameQuery?.trim() ? 350 : 0);

  const refetch = () => setSequence(s => s + 1);

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const fetchApartments = async () => {
      setLoading(true)
      try {
        const data = await getApartments({ withComplex, withBlock, withCompany, companyId, complexId, blockId, nameQuery: debouncedNameQuery, getAvailableForEntity, take, skip, orderBy, orderDirection })
        
        let list = data.list || [];
        let count = data.totalCount || 0;

        // FILTRAGEM DE SEGURANÇA NO PREVIEW MODE
        if (isPreviewing && effectiveContext) {
            // Se for morador, só vê os apartamentos dele
            if (effectiveContext.apartments?.length > 0) {
                const allowedAptIds = effectiveContext.apartments.map((a: any) => a.id);
                list = list.filter((a: any) => allowedAptIds.includes(a.id));
            } else if (effectiveContext.accessibleComplexIds?.length > 0) {
                list = list.filter((a: any) => effectiveContext.accessibleComplexIds.includes(a.complexId));
            }
            count = list.length;
        }

        setApartments(list)
        setTotalCount(count)
        setError(null)
      } catch (error: any) {
        const message = error.response?.data?.error || error.message || "Unknown error"
        setError(message)
      } finally {
        setLoading(false)
      }
    };

    fetchApartments()
  }, [companyId, complexId, blockId, debouncedNameQuery, getAvailableForEntity, take, skip, enabled, withComplex, withBlock, withCompany, sequence, isPreviewing, effectiveContext])

  return { apartments, loading, error, totalCount, refetch }
};

export const useApartmentMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createApartment = async (apartmentData: Apartment) => {
    setLoading(true);
    setError(null);
    try {
      await createApartmentService(apartmentData);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const updateApartment = async (apartmentId: string, apartmentData: Apartment) => {
    setLoading(true);
    setError(null);
    try {
      await updateApartmentService(apartmentId, apartmentData);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const deleteApartment = async (apartmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteApartmentService(apartmentId);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return { createApartment, updateApartment, deleteApartment, loading, error };
};