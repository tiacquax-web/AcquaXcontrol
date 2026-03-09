import { ApartmentWithConsumptionReport } from "@/types/apartment";
import axiosClient from "@/services/axiosClient";


interface getApartmentReportParams {
    complexId?: string;
    blockId?: string;
    apartmentId?: string;
    search?: string;
    take?: number;
    skip?: number;
    withApartment?: boolean;
    withMetersCount?: boolean;
    withMeters?: boolean;
    withTotalDays?: boolean;
    withReadingDate?: boolean;
    includeLastReading?: boolean;
    dealershipReadingId?: string;
    fromDate?: Date;
    toDate?: Date;
    id?: string;
    orderBy?: string;
    orderByDirection?: 'asc' | 'desc';
    utilityType?: 'water' | 'gas';
}

export const getApartmentReports = async ({ id, withReadingDate, includeLastReading = true, fromDate, toDate, withTotalDays, withMeters, dealershipReadingId, withMetersCount, withApartment, complexId, blockId, apartmentId, search, take, skip, orderBy = 'apartment.name', orderByDirection = 'asc', utilityType }: getApartmentReportParams): Promise<{list:ApartmentWithConsumptionReport[],totalCount:number}> => {
    try {
        const params: any = {};
        if (id) params.id = id;
        if (dealershipReadingId) params.dealership_reading_id = dealershipReadingId;
        if (complexId) params.complex_id = complexId;
        if (blockId) params.block_id = blockId;
        if (apartmentId) params.apartment_id = apartmentId;
        if (withApartment) params.with_apartment = withApartment;
        if (withMetersCount) params.with_meters_count = withMetersCount;
        if (withMeters) params.with_meters = withMeters;
        if (withTotalDays) params.with_total_days = withTotalDays;
    if (withReadingDate) params.with_reading_date = withReadingDate;
    if (includeLastReading) params.include_last_reading = '1';
    if (search) params.search = search;
        if (take) params.take = take;
        if (skip) params.skip = skip;
        if (orderBy) params.order_by = orderBy;
        if (orderByDirection) params.order_by_direction = orderByDirection;
        if (fromDate) params.start_date = fromDate.toISOString();
        if (toDate) params.end_date = toDate.toISOString();
    if (utilityType) params.utility_type = utilityType;

        const response = await axiosClient.get(`user/apartment-report`, { params });
        return response.data;
    } catch (error) {
        console.error("Error fetching residences with reports:", error);
        throw error;
    }
};


export const createApartmentReport = async (reportData: any) => {
    try {
        const response = await axiosClient.post(`user/apartment-report`, reportData);
        return response.data;
    } catch (error) {
        console.error('Error creating apartment report:', error);
        throw error;
    }
};

export const updateApartmentReport = async (reportId: string, reportData: any) => {
    try {
        const response = await axiosClient.put(`user/apartment-report/${reportId}`, reportData);
        return response.data;
    } catch (error) {
        console.error('Error updating apartment report:', error);
        throw error;
    }
};

export const deleteApartmentReport = async (reportId: string) => {
    try {
        const response = await axiosClient.delete(`user/apartment-report/${reportId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting apartment report:', error);
        throw error;
    }
};

interface GenerateApartmentReportsParams {
    dealershipReadingId: string;
    complexId: string;
    monthRef: string;
    yearRef: string;
    calculationMethod: string;
}

export const generateApartmentReports = async (params: GenerateApartmentReportsParams) => {
    try {
        const response = await axiosClient.post(`user/apartment-report/generate`, params);
        return response.data;
    } catch (error) {
        console.error('Error generating apartment reports:', error);
        throw error;
    }
};

interface CalculateApartmentReportParams {
    apartmentId: string;
    dealershipReadingId: string;
    calculationMethod: string;
}

export const calculateApartmentReport = async (params: CalculateApartmentReportParams) => {
    try {
        const response = await axiosClient.post(`user/apartment-report/calculate`, params);
        return response.data;
    } catch (error) {
        console.error('Error calculating apartment report:', error);
        throw error;
    }
};

// Unified create/update (report + optional reading)
interface UnifiedReadingPayload {
    enabled: boolean;
    meterId?: string;
    reading?: number;
    readAtDate?: string; // YYYY-MM-DD (data_leitura)
    urlCover?: string; // foto
    nextReadingDate?: string; // prox_leitura
    isPreReading?: boolean; // pre_leitura
    registerName?: string; // chassi
}

interface UnifiedReportPayload {
    apartmentId: string;
    dealershipReadingId: string;
    monthRef: string;
    yearRef: string;
    consumption?: number;
    totalConsumption?: number;
    consumptionCost?: number;
    sewageCost?: number;
    partial?: number;
    totalUnit?: number;
    kiteCarConsumption?: number;
    kiteCarCost?: number;
    consumptionGasValue?: number;
    totalGasValue?: number;
}

export interface UnifiedItemPayload { report: UnifiedReportPayload; reading?: UnifiedReadingPayload }

export const submitUnifiedApartmentReports = async (items: UnifiedItemPayload[]) => {
    try {
        const response = await axiosClient.post(`user/apartment-report/unified`, { items });
        return response.data;
    } catch (error) {
        console.error('Error in unified apartment report submission:', error);
        throw error;
    }
};