import { useState, useEffect } from 'react';
import { 
    getCompanies, 
    createCompany as createCompanyService, 
    updateCompany as updateCompanyService, 
    deleteCompany as deleteCompanyService 
} from '@/services/companiesService';
import { useDebounce } from './use-debounce';
import { Company, PermissionableEntity } from '@prisma/client';

interface useCompaniesProps {
    nameQuery?: string;
    documentCompany?: string;
    getAvailableForEntity?: PermissionableEntity;
    id?: string;
}

export const useCompanies = ({ nameQuery, documentCompany, getAvailableForEntity, id }: useCompaniesProps) => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<number>(0); // Sequence to trigger re-fetching

    // Apply debounce to the query parameters
    const debouncedNameQuery = useDebounce(nameQuery, 350);
    const debouncedDocumentCompany = useDebounce(documentCompany, 350);

    const refetch = () => {
        setLoading(true);
        setError(null);
        setSequence((prev) => prev + 1);
    };
    
    useEffect(() => {
        const fetchCompanies = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getCompanies({ getAvailableForEntity, nameQuery: debouncedNameQuery, documentCompany: debouncedDocumentCompany, id });
                setCompanies(data);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchCompanies();
    }, [debouncedNameQuery, debouncedDocumentCompany, sequence, getAvailableForEntity]);

    return { refetch, companies, loading, error };
};

export const useCompanyMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createCompany = async (companyData: Company) => {
        setLoading(true);
        setError(null);
        try {
            await createCompanyService(companyData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateCompany = async (companyId: string, companyData: Company) => {
        setLoading(true);
        setError(null);
        try {
            await updateCompanyService(companyId, companyData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteCompany = async (companyId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteCompanyService(companyId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createCompany, updateCompany, deleteCompany, loading, error };
};