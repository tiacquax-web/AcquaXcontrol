import { useState, useCallback, useEffect } from "react";
import { getDevicesIot } from "@/services/devicesIotService";
import type { IotDevice } from "@prisma/client";
import type { DeviceFull } from "@/types/fullTypes";

export interface DeviceIotFilters {
    semLink?: boolean;
    comLeiturasDesvinculadas?: boolean;
}

export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
}

export function useDeviceIot(filters: DeviceIotFilters, page: number = 1, pageSize: number = 20) {
    const [devices, setDevices] = useState<DeviceFull[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [pagination, setPagination] = useState<PaginationInfo>({
        currentPage: 1,
        totalPages: 1,
        pageSize: 20,
        total: 0,
        hasMore: false
    });

    const fetchDevices = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getDevicesIot({ ...filters, page, pageSize });
            setDevices(data?.list || []);
            setPagination({
                currentPage: data.pagination.currentPage,
                totalPages: data.pagination.totalPages,
                pageSize: data.pagination.pageSize,
                total: data.total,
                hasMore: data.pagination.hasMore
            });
        } catch (err: any) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [filters, page, pageSize]);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    return { devices, isLoading, error, pagination, fetchDevices };
}
