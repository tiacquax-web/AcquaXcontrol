"use client";

import { useState } from "react";
import { generateApartmentReports, calculateApartmentReport } from "@/services/apartmentReportsService";

interface UseApiOperationResult<T> {
    loading: boolean;
    error: string | null;
    result: T | null;
}

interface GenerateReportsParams {
    dealershipReadingId: string;
    complexId: string;
    monthRef: string;
    yearRef: string;
    calculationMethod: string;
}

interface CalculateReportParams {
    apartmentId: string;
    dealershipReadingId: string;
    calculationMethod: string;
}

export const useApartmentReportsOperations = () => {
    const [generateState, setGenerateState] = useState<UseApiOperationResult<any>>({
        loading: false,
        error: null,
        result: null,
    });

    const [calculateState, setCalculateState] = useState<UseApiOperationResult<any>>({
        loading: false,
        error: null,
        result: null,
    });

    const generateReports = async (params: GenerateReportsParams) => {
        setGenerateState({ loading: true, error: null, result: null });
        
        try {
            const result = await generateApartmentReports(params);
            setGenerateState({ loading: false, error: null, result });
            return result;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message || "Erro desconhecido";
            setGenerateState({ loading: false, error: errorMessage, result: null });
            throw error;
        }
    };

    const calculateReport = async (params: CalculateReportParams) => {
        setCalculateState({ loading: true, error: null, result: null });
        
        try {
            const result = await calculateApartmentReport(params);
            setCalculateState({ loading: false, error: null, result });
            return result;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message || "Erro desconhecido";
            setCalculateState({ loading: false, error: errorMessage, result: null });
            throw error;
        }
    };

    const clearGenerateState = () => {
        setGenerateState({ loading: false, error: null, result: null });
    };

    const clearCalculateState = () => {
        setCalculateState({ loading: false, error: null, result: null });
    };

    return {
        generate: {
            ...generateState,
            execute: generateReports,
            clear: clearGenerateState,
        },
        calculate: {
            ...calculateState,
            execute: calculateReport,
            clear: clearCalculateState,
        },
    };
};
