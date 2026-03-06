import { useState, useEffect } from 'react';
import {
    getPermissions,
    createPermission as createPermissionService,
    updatePermission as updatePermissionService,
    deletePermission as deletePermissionService
} from '@/services/permissionService';
import { Permission } from '@prisma/client';

interface usePermissionsProps {
    roleId?: string;
    searchQuery?: string;
    action?: string;
    entity?: string;
    take?: number;
    skip?: number;
    orderBy?: string;
}

export const usePermissions = ({ searchQuery, roleId, action, entity, take, skip, orderBy }: usePermissionsProps) => {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState(0);

    const refetch = () => {
        setLoading(true);
        setError(null);
        setSequence((prev) => prev + 1);
    };

    useEffect(() => {
        const fetchPermissions = async () => {
            setLoading(true);
            try {
                const data = await getPermissions({ searchQuery, roleId, action, entity, take, skip, orderBy });
                setPermissions(data.list || data);
                setTotalCount(data.totalCount || data.length);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchPermissions();
    }, [searchQuery, roleId, action, entity, take, skip, orderBy, sequence]);

    return { refetch, permissions, totalCount, loading, error };
};

export const usePermissionMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createPermission = async (permissionData: Partial<Permission>) => {
        setLoading(true);
        setError(null);
        try {
            const createdPermission = await createPermissionService(permissionData);
            console.log("createdPermission", createdPermission);
            return createdPermission as Permission;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updatePermission = async (permissionId: string, permissionData: Permission) => {
        setLoading(true);
        setError(null);
        try {
            await updatePermissionService(permissionId, permissionData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deletePermission = async (permissionId: string) => {
        setLoading(true);
        setError(null);
        try {
            const deletedPermission = await deletePermissionService(permissionId);
            return deletedPermission as Permission;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createPermission, updatePermission, deletePermission, loading, error };
};