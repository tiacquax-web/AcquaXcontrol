import { useState, useEffect } from 'react';
import { 
    getDealerships, 
    createDealership as createDealershipService, 
    updateDealership as updateDealershipService, 
    deleteDealership as deleteDealershipService 
} from '@/services/dealershipService';
import { useDebounce } from './use-debounce';
import { Dealership, PermissionableEntity } from '@prisma/client';

interface useDealershipsProps {
    search?: string;
}

export const useDealerships = ({ search }: useDealershipsProps) => {
    const [dealerships, setDealerships] = useState<Dealership[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<number>(0); // Sequence to trigger re-fetching

    // Apply debounce to the query parameters
    const debouncedSearch = useDebounce(search, 350);

    const refetch = () => {
        setLoading(true);
        setError(null);
        setSequence((prev) => prev + 1);
    };
    
    useEffect(() => {
        const fetchDealerships = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getDealerships({ take: 50, search: debouncedSearch });
                setDealerships(data);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchDealerships();
    }, [debouncedSearch, sequence]);

    return { refetch, dealerships, loading, error };
};

export const useDealershipMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createDealership = async (dealershipData: Dealership) => {
        setLoading(true);
        setError(null);
        try {
            await createDealershipService(dealershipData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateDealership = async (dealershipId: string, dealershipData: Dealership) => {
        setLoading(true);
        setError(null);
        try {
            await updateDealershipService(dealershipId, dealershipData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteDealership = async (dealershipId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteDealershipService(dealershipId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createDealership, updateDealership, deleteDealership, loading, error };
};