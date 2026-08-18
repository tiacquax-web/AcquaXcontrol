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
}

export const useComplexes = ({ id, nameQuery, documentCompany, companyId, withCompany, getAvailableForEntity, withBlocksCount, withApartmentsCount, withMetersCount, onlyWithReservoirs, take = 12, skip = 0, enabled = true}: useComplexesProps) => {
    const { isPreviewing, effectiveContext } = useRolePreview();
    const [complexes, setComplexes] = useState<ComplexFull[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);

    const debouncedNameQuery = useDebounce(nameQuery, 350);
    const debouncedDocumentCompany = useDebounce(documentCompany, 350);

    useEffect(() => {
        if (!enabled) {
            setLoading(false)
            return
        }

        const fetchComplexes = async () => {
            try {
                setLoading(true);
                const data = await getComplexes({ 
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
                    skip
                })
                
                let list = data.list || [];
                let count = data.totalCount || 0;

                // FILTRAGEM DE SEGURANÇA NO PREVIEW MODE
                if (isPreviewing && effectiveContext) {
                    const allowedIds = effectiveContext.accessibleComplexIds || [];
                    list = list.filter((c: any) => allowedIds.includes(c.id));
                    count = list.length;
                }

                setComplexes(list)
                setTotalCount(count)
                setHasNextPage(skip + take < count)
                setHasPreviousPage(skip > 0)
                setError(null)
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error"
                setError(message)
            } finally {
                setLoading(false)
            }
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