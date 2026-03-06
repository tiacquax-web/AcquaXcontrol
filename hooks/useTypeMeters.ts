import { useState, useEffect } from 'react';
import { 
    getTypeMeters, 
    createTypeMeter as createTypeMeterService, 
    updateTypeMeter as updateTypeMeterService, 
    deleteTypeMeter as deleteTypeMeterService 
} from '@/services/typemetersService';
import { useDebounce } from './use-debounce';

interface TypeMeter {
    id: string;
    name: string;
    acronym: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    createdByUserId?: string | null;
    updatedByUserId?: string | null;
}

interface useTypeMetersProps {
    nameQuery?: string;
    acronymQuery?: string;
}

export const useTypeMeters = ({ nameQuery, acronymQuery }: useTypeMetersProps) => {
    const [typeMeters, setTypeMeters] = useState<TypeMeter[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<number>(0); // Sequence to trigger re-fetching

    // Apply debounce to the query parameters
    const debouncedNameQuery = useDebounce(nameQuery, 350);
    const debouncedAcronymQuery = useDebounce(acronymQuery, 350);

    const refetch = () => {
        setLoading(true);
        setError(null);
        setSequence((prev) => prev + 1);
    };
    
    useEffect(() => {
        const fetchTypeMeters = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getTypeMeters({ nameQuery: debouncedNameQuery, acronymQuery: debouncedAcronymQuery });
                setTypeMeters(data);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchTypeMeters();
    }, [debouncedNameQuery, debouncedAcronymQuery, sequence]);

    return { refetch, typeMeters, loading, error };
};

export const useTypeMeterMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createTypeMeter = async (typeMeterData: TypeMeter) => {
        setLoading(true);
        setError(null);
        try {
            await createTypeMeterService(typeMeterData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateTypeMeter = async (typeMeterId: string, typeMeterData: TypeMeter) => {
        setLoading(true);
        setError(null);
        try {
            await updateTypeMeterService(typeMeterId, typeMeterData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteTypeMeter = async (typeMeterId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteTypeMeterService(typeMeterId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createTypeMeter, updateTypeMeter, deleteTypeMeter, loading, error };
};