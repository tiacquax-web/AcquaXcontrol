import { useState, useEffect, useMemo } from 'react';
import { getComplexes, createComplex as createComplexService, updateComplex as updateComplexService, deleteComplex as deleteComplexService } from '@/services/complexesService';
import { Complex, PermissionableEntity } from '@prisma/client';
import { useDebounce } from './use-debounce';
import { ComplexFull } from '@/types/fullTypes';
import { useRolePreview } from '@/contexts/RolePreviewContext';

interface useComplexesProps {
    nameQuery?: string;
    documentCompany?: string;
    withCompany?: boolean;
    companyId?: string; // Adicionar companyId
    getAvailableForEntity?: PermissionableEntity;
    withBlocksCount?: boolean;
    withApartmentsCount?: boolean;
    withMetersCount?: boolean;
    onlyWithReservoirs?: boolean;
    id?: string;
    enabled?: boolean;
    take?: number;
    skip?: number;
    lite?: boolean;
}

type ComplexCacheEntry = {
    data: any;
    cachedAt: number;
};

const COMPLEX_CACHE_TTL = 60_000;
const complexesCache = new Map<string, ComplexCacheEntry>();
const complexesRequests = new Map<string, Promise<any>>();

export const useComplexes = ({ id, nameQuery, documentCompany, companyId, withCompany, getAvailableForEntity, withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, take = 12, skip = 0, lite = false, enabled = true}: useComplexesProps) => {
    const { isPreviewing, effectiveContext } = useRolePreview();
    const [complexes, setComplexes] = useState<ComplexFull[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);

    const debouncedNameQuery = useDebounce(nameQuery, nameQuery?.trim() ? 350 : 0);
    const debouncedDocumentCompany = useDebounce(documentCompany, documentCompany?.trim() ? 350 : 0);

    useEffect(() => {
        if (!enabled) {
            setLoading(false)
            return
        }

        const fetchComplexes = async () => {
            const requestKey = JSON.stringify({
                id,
                getAvailableForEntity,
                nameQuery: debouncedNameQuery || '',
                documentCompany: debouncedDocumentCompany || '',
                companyId,
                withCompany: !!withCompany,
                withBlocksCount: !!withBlocksCount,
                withApartmentsCount: !!withApartmentsCount,
                withMetersCount: !!withMetersCount,
                onlyWithReservoirs: !!onlyWithReservoirs,
                take,
                skip,
                lite,
                preview: isPreviewing ? effectiveContext?.accessibleComplexIds || [] : 'real',
            });
            try {
                setLoading(true);
                const cached = complexesCache.get(requestKey);
                const now = Date.now();
                if (cached && now - cached.cachedAt < COMPLEX_CACHE_TTL) {
                    applyComplexData(cached.data);
                    return;
                }

                let request = complexesRequests.get(requestKey);
                if (!request) {
                    request = getComplexes({
                        id,
                        getAvailableForEntity,
                        nameQuery: debouncedNameQuery,
                        documentCompany: debouncedDocumentCompany,
                        companyId,
                        withCompany,
                        withBlocksCount,
                        withApartmentsCount,
                        withMetersCount,
                        onlyWithReservoirs,
                        take,
                        skip,
                        lite,
                    });
                    complexesRequests.set(requestKey, request);
                }
                const data = await request;
                complexesCache.set(requestKey, { data, cachedAt: Date.now() });
                
                applyComplexData(data);
                setError(null)
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error"
                setError(message)
            } finally {
                if (requestKey) complexesRequests.delete(requestKey);
                setLoading(false)
            }
        };

        const applyComplexData = (data: any) => {
            let list = data?.list || [];
            let count = data?.totalCount || 0;

            if (isPreviewing && effectiveContext) {
                const allowedIds = effectiveContext.accessibleComplexIds || [];
                list = list.filter((c: any) => allowedIds.includes(c.id));
                count = list.length;
            }

            setComplexes(list);
            setTotalCount(count);
            setHasNextPage(skip + take < count);
            setHasPreviousPage(skip > 0);
            setError(null);
        };

        fetchComplexes();
    }, [debouncedNameQuery, debouncedDocumentCompany, companyId, withCompany, take, skip, enabled, isPreviewing, effectiveContext])

    return { 
        complexes, 
        loading, 
        error, 
        totalCount, 
        hasNextPage, 
        hasPreviousPage,
        currentPage: Math.floor(skip / take) + 1,
        take,
        skip
    }
}

export const useComplexMutations = () => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const createComplex = async (complexData: Complex) => {
        setLoading(true);
        setError(null);
        try {
            const created = await createComplexService(complexData);
            return created;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            throw error;
        } finally {
            setLoading(false);
        }
    }

    const updateComplex = async (complexId: string, complexData: Complex) => {
        setLoading(true)
        setError(null)
        try {
            const result = await updateComplexService(complexId, complexData)
            return result
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error"
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const deleteComplex = async (complexId: string) => {
        setLoading(true)
        setError(null)
        try {
            const deleted = await deleteComplexService(complexId)
            return deleted
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error"
            setError(message)
        } finally {
            setLoading(false)
        }
    };

    return { createComplex, updateComplex, deleteComplex, loading, error }
}