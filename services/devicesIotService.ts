import axios from "axios";
import type { IotDevice } from "@prisma/client";

const NEXT_PUBLIC_API_URL = '/api';

export interface GetDevicesIotFilters {
    semLink?: boolean;
    vinculados?: boolean;
    comLeiturasDesvinculadas?: boolean;
    semLeitura?: boolean;
    piloto?: boolean;
    page?: number;
    pageSize?: number;
}

export async function getDevicesIot(filters: GetDevicesIotFilters) {
    const { semLink, vinculados, comLeiturasDesvinculadas, semLeitura, piloto, page = 1, pageSize = 20 } = filters || {};

    const params: Record<string, any> = {};

    if (semLink) params.has_active_link = false;
    if (vinculados) params.has_active_link = true;
    if (comLeiturasDesvinculadas) params.has_unlinked_readings = true;
    if (semLeitura) params.has_no_readings = true;
    if (piloto) params.pilot_mode = true;
    
    // Paginação
    params.take = pageSize;
    params.skip = (page - 1) * pageSize;

    const { data } = await axios.get(`/api/user/devices`, { params });

    return {
        list: data.devices || [],
        total: data.total || 0,
        pagination: {
            ...data.pagination,
            currentPage: page,
            totalPages: Math.ceil((data.total || 0) / pageSize),
            pageSize
        }
    };
}


export async function createDeviceIot(device: Partial<IotDevice>) {
    const { data } = await axios.post(`${NEXT_PUBLIC_API_URL}/user/devices`, device);
    return data;
}

export async function updateDeviceIot(device: Partial<IotDevice>) {
    const { data } = await axios.put(`${NEXT_PUBLIC_API_URL}/user/devices/${device.id}`, device);
    return data;
}

export async function deleteDeviceIot(id: string) {
    const { data } = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/devices/${id}`);
    return data;
}

export async function runDevicesBulkAction(payload: {
    action: 'delete_selected' | 'set_pilot_mode' | 'unlink_selected' | 'reprocess_selected' | 'cleanup_unlinked';
    ids?: string[];
    deviceIds?: string[];
    pilotMode?: boolean;
    onlyPilot?: boolean;
    onlyWithoutReadings?: boolean;
    olderThanDays?: number;
    confirmationText?: string;
}) {
    const { data } = await axios.post(`${NEXT_PUBLIC_API_URL}/user/devices/bulk`, payload);
    return data;
}

export async function importDevicesByChassi(payload: {
    rows: Array<{ device_id: string; chassi: string; pilotMode?: boolean }>;
    pilotMode?: boolean;
    pilotComplexId?: string;
}) {
    const { data } = await axios.post(`${NEXT_PUBLIC_API_URL}/user/devices/import-by-chassi`, payload);
    return data;
}
