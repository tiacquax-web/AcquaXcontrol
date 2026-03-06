import { useState, useEffect } from 'react';
import { getComplexes, createComplex as createComplexService, updateComplex as updateComplexService, deleteComplex as deleteComplexService } from '@/services/complexesService';
import { Complex, PermissionableEntity } from '@prisma/client';
import { useDebounce } from './use-debounce';
import { ComplexFull } from '@/types/fullTypes';

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
    const [complexes, setComplexes] = useState<ComplexFull[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);

    const debouncedNameQuery = useDebounce(nameQuery, 350);
    const debouncedDocumentCompany = useDebounce(documentCompany, 350);

    useEffect(() => {
    // Só busca apartamentos se enabled for true
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
                    companyId, // Passar companyId para o serviço
                    withCompany, 
                    withBlocksCount, 
                    withApartmentsCount, 
                    withMetersCount,
                    onlyWithReservoirs,
                    take,
                    skip
                })
                setComplexes(data.list)
                setTotalCount(data.totalCount || 0)
                setHasNextPage(skip + take < (data.totalCount || 0))
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
    }, [debouncedNameQuery, debouncedDocumentCompany, companyId, withCompany, take, skip, enabled])

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