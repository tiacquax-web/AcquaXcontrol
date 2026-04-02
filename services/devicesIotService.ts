import axios from "axios";
import type { IotDevice } from "@prisma/client";

const NEXT_PUBLIC_API_URL = '/api';

export interface GetDevicesIotFilters {
    semLink?: boolean;
    comLeiturasDesvinculadas?: boolean;
    page?: number;
    pageSize?: number;
}

export async function getDevicesIot(filters: GetDevicesIotFilters) {
    const { semLink, comLeiturasDesvinculadas, page = 1, pageSize = 20 } = filters || {};

    const params: Record<string, any> = {};

    if (semLink) params.has_active_link = false;
    if (comLeiturasDesvinculadas) params.has_unlinked_readings = true;
    
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

export async function deleteAllDevicesIot(filters: GetDevicesIotFilters) {
    const { semLink, comLeiturasDesvinculadas } = filters || {};
    const payload: Record<string, boolean> = {};
    if (semLink) payload.semLink = true;
    if (comLeiturasDesvinculadas) payload.comLeiturasDesvinculadas = true;
    const { data } = await axios.post(`${NEXT_PUBLIC_API_URL}/user/devices/bulk-delete`, payload);
    return data;
}
