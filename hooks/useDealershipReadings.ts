"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { getDealershipReadings, createDealershipReading as createDealershipReadingService, updateDealershipReading as updateDealershipReadingService, deleteDealershipReading as deleteDealershipReadingService } from "@/services/dealershipReadingsService";
import { DealershipReading } from "@prisma/client";
import { set } from "date-fns";
import { DealershipReadingFull } from "@/types/fullTypes";

interface useDealershipReadingsProps {
    companyId?: string;
    complexId?: string;
    withComplex?: boolean;
    withCompany?: boolean;
    withDealership?: boolean;
    dealershipId?: string;
    search?: string;
    take?: number;
    skip?: number;
    id?: string;
    fromDate?: Date;
    toDate?: Date;
    type?: 'water' | 'gas';
}

export const useDealershipReadings = ({ id, withDealership, companyId, complexId, dealershipId, search, fromDate, toDate, take = 10, skip = 0, withComplex, withCompany, type }: useDealershipReadingsProps) => {
    const [dealershipReadings, setDealershipReadings] = useState<DealershipReadingFull[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Debounce the search term to avoid excessive calls
    const debouncedSearch = useDebounce(search, 300);

    useEffect(() => {
        const fetchDealershipReadings = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch dealership readings from the API
                const data = await getDealershipReadings({ id, fromDate, toDate, withDealership, companyId, complexId, dealershipId, search: debouncedSearch, take, skip, withComplex, withCompany, type });
                setDealershipReadings(data.list);
                setTotalCount(data.totalCount);
                setError(null);

            } catch (error: any) {
                setError(error);

            } finally {
                setLoading(false);
            }
        };

        fetchDealershipReadings();
    }, [complexId, dealershipId, debouncedSearch, take, companyId,  fromDate, toDate, type]);

    return { dealershipReadings, totalCount, loading, error };
};

export const useDealershipReadingMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createDealershipReading = async (readingData: Partial<DealershipReading>) => {
        setLoading(true);
        setError(null);
        try {
            if (readingData.kiteCar === false) {
                readingData.kiteCarConsumption = 0;
                readingData.kiteCarConsumedUnits = 0;
                readingData.kiteCarQtd = 0;
                readingData.kiteCarTax = 0;
                readingData.kiteCarTotal = 0;
                readingData.valuePerKiteCar = 0;
                readingData.kiteCarCostUnits = 0;
            }
            const createdDealershipReading = await createDealershipReadingService(readingData);
            return createdDealershipReading;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateDealershipReading = async (readingId: string, readingData: Partial<DealershipReading>) => {
        setLoading(true);
        setError(null);
        try {
            if (readingData.kiteCar === false) {
                readingData.kiteCarConsumption = 0;
                readingData.kiteCarConsumedUnits = 0;
                readingData.kiteCarQtd = 0;
                readingData.kiteCarTax = 0;
                readingData.kiteCarTotal = 0;
                readingData.valuePerKiteCar = 0;
                readingData.kiteCarCostUnits = 0;
            }
            const updatedDealershipReading = await updateDealershipReadingService(readingId, readingData);
            return updatedDealershipReading;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteDealershipReading = async (readingId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteDealershipReadingService(readingId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createDealershipReading, updateDealershipReading, deleteDealershipReading, loading, error };
};