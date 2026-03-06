"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { getApartmentReports, createApartmentReport as createApartmentReportService, updateApartmentReport as updateApartmentReportService, deleteApartmentReport as deleteApartmentReportService } from "@/services/apartmentReportsService";
import { submitUnifiedApartmentReports, UnifiedItemPayload } from "@/services/apartmentReportsService";
import { ApartmentWithConsumptionReport } from "@/types/apartment";
import { ApartmentConsumptionReport } from "@prisma/client";


interface useApartmentReportsProps {
    complexId?: string;
    blockId?: string;
    search?: string;
    take?: number;
    skip?: number;
    activeSearch?: boolean;
    withApartment?: boolean;
    withMetersCount?: boolean;
    withMeters?: boolean;
    dealershipReadingId?: string;
    withTotalDays?: boolean;
    withReadingDate?: boolean;
    fromDate?: Date;
    toDate?: Date;
    id?: string;
    orderBy?: string;
    orderByDirection?: 'asc' | 'desc';
    utilityType?: 'water' | 'gas';
}

export const useApartmentsReports = ({ id, fromDate, toDate, withReadingDate, withTotalDays, withMeters, dealershipReadingId, withApartment, complexId, blockId, search, take = 10, skip = 0, activeSearch = true, withMetersCount, orderBy = 'apartment.name', orderByDirection = 'asc', utilityType }: useApartmentReportsProps) => {
    const [apartmentReports, setApartmentReports] = useState<ApartmentWithConsumptionReport[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<number>(0); // State to trigger re-fetching

    // Debounce the search term to avoid excessive calls
    const debouncedSearch = useDebounce(search, 300); // Waits 500ms after the last input

    const refetch = () => {
        setSequence((prev) => prev + 1); // Increment the sequence to trigger re-fetching
    }

    useEffect(() => {
        if (!activeSearch) return;
        const fetchApartmentReports = async () => {
            setLoading(true);
            setError(null);            try {
                const data = await getApartmentReports({ id, fromDate, toDate, withReadingDate, withTotalDays, withMeters, dealershipReadingId, withMetersCount, withApartment, complexId, blockId, search: debouncedSearch, take, skip, orderBy, orderByDirection, utilityType });
                setTotalCount(data.totalCount);
                setApartmentReports(data.list);
                setError(null);
            } catch (error: any) {
                setError(error);
            } finally {
                setLoading(false);
            }
        };        fetchApartmentReports();
    }, [blockId, debouncedSearch, take, activeSearch, complexId, withApartment, withMetersCount, skip, dealershipReadingId, sequence, fromDate, toDate, orderBy, orderByDirection, utilityType]);

    return { refetch, apartmentReports, totalCount, loading, error };
};


export const useApartmentReportMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createApartmentReport = async (reportData: Partial<ApartmentConsumptionReport>) => {
        setLoading(true);
        setError(null);
        try {
            const createdApartmentReport = await createApartmentReportService(reportData);
            setError(null);
            return createdApartmentReport;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateApartmentReport = async (reportId: string, reportData: Partial<ApartmentConsumptionReport>) => {
        setLoading(true);
        setError(null);
        try {
            const updateApartmentReport = await updateApartmentReportService(reportId, reportData);
            setError(null);
            return updateApartmentReport;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteApartmentReport = async (reportId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteApartmentReportService(reportId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createApartmentReport, updateApartmentReport, deleteApartmentReport, loading, error };
};

// Hook for unified submission (report + reading)
export const useUnifiedApartmentReport = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<any>(null);

    const submit = async (items: UnifiedItemPayload[]) => {
        setLoading(true);
        setError(null);
        try {
        const result = await submitUnifiedApartmentReports(items);
        setLastResult(result);
        return result;
        } catch (e: any) {
            const message = e.response?.data?.error || e.message || 'Erro desconhecido';
            setError(message);
            throw e;
        } finally {
            setLoading(false);
        }
    };
    return { submit, loading, error, lastResult };
};