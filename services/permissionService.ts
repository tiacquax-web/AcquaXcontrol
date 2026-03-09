import axiosClient from '@/services/axiosClient';


interface getPermissionsProps {
    searchQuery?: string;
    roleId?: string;
    action?: string;
    entity?: string;
    take?: number;
    skip?: number;
    orderBy?: string;
}

export const getPermissions = async ({ searchQuery, roleId, action, entity, take, skip, orderBy }: getPermissionsProps) => {
    try {
        const params: any = {};
        if (searchQuery) params.search = searchQuery;
        if (roleId) params.role_id = roleId;
        if (action) params.action = action;
        if (entity) params.entity = entity;
        if (take) params.take = take;
        if (skip) params.skip = skip;
        if (orderBy) params.orderBy = orderBy;

        const response = await axiosClient.get(`user/permissions`, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching permissions:', error);
        throw error;
    }
};

export const createPermission = async (permissionData: any) => {
    try {
        const response = await axiosClient.post(`user/permissions`, permissionData);
        return response.data;
    } catch (error) {
        console.error('Error creating permission:', error);
        throw error;
    }
};

export const updatePermission = async (permissionId: string, permissionData: any) => {
    try {
        const response = await axiosClient.put(`user/permissions/${permissionId}`, permissionData);
        return response.data;
    } catch (error) {
        console.error('Error updating permission:', error);
        throw error;
    }
};

export const deletePermission = async (permissionId: string) => {
    try {
        const response = await axiosClient.delete(`user/permissions/${permissionId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting permission:', error);
        throw error;
    }
};