import { DealershipReading } from "@prisma/client";
import axios from "axios";

const NEXT_PUBLIC_API_URL = '/api';

interface GetDealershipReadingParams {
    companyId?: string;
    complexId?: string;
    dealershipId?: string;
    monthRef?: string;
    yearRef?: string;
    search?: string;
    take?: number;
    skip?: number;
    withComplex?: boolean;
    withCompany?: boolean;
    withDealership?: boolean;
    id?: string;
    fromDate?: Date;
    toDate?: Date;
    type?: 'water' | 'gas';
}

export const getDealershipReadings = async ({ id, fromDate, toDate, withDealership, withCompany, companyId, complexId, dealershipId, monthRef, yearRef, search, take, skip, withComplex, type }: GetDealershipReadingParams): Promise<{ list: DealershipReading[], totalCount: number }> => {
    try {
        const params: any = {};
        if (id) params.id = id;
        if (companyId) params.company_id = companyId;
        if (complexId) params.complex_id = complexId;
        if (dealershipId) params.dealership_id = dealershipId;
        if (monthRef) params.month_ref = monthRef;
        if (yearRef) params.year_ref = yearRef;
        if (search) params.search = search;
        if (take) params.take = take;
        if (skip) params.skip = skip;
        if (withComplex) params.with_complex = withComplex;
        if (withCompany) params.with_company = withCompany;
        if (withDealership) params.with_dealership = withDealership;
        if (fromDate) params.start_date = fromDate.toISOString();
        if (toDate) params.end_date = toDate.toISOString();
        if (type) params.type = type;

        const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/dealership-reading`, { params });
        return response.data;
    } catch (error) {
        console.error("Error fetching dealership readings:", error);
        throw error;
    }
};


export const createDealershipReading = async (readingData: any) => {
    try {
        const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/dealership-reading`, readingData);
        return response.data;
    } catch (error) {
        console.error('Error creating dealership reading:', error);
        throw error;
    }
};

export const updateDealershipReading = async (readingId: string, readingData: any) => {
    try {
        const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/dealership-reading/${readingId}`, readingData);
        return response.data;
    } catch (error) {
        console.error('Error updating dealership reading:', error);
        throw error;
    }
};

export const deleteDealershipReading = async (readingId: string) => {
    try {
        const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/dealership-reading/${readingId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting dealership reading:', error);
        throw error;
    }
};