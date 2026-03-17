import { useState, useEffect } from 'react';
import {
    getRoles,
    createRole as createRoleService,
    updateRole as updateRoleService,
    deleteRole as deleteRoleService
} from '@/services/roleService';
import { Role } from '@prisma/client';
import { useDebounce } from './use-debounce';

interface useRolesProps {
    searchQuery?: string;
    take?: number;
    skip?: number;
    orderBy?: string;
}

export const useRoles = ({ searchQuery, take, skip, orderBy }: useRolesProps) => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState<number>(0);

    const debouncedSearchQuery = useDebounce(searchQuery, 350);

    const refetch = () => {
        setLoading(true);
        setError(null);
        setSequence((prev) => prev + 1);
    };

    useEffect(() => {
        const fetchRoles = async () => {
            setLoading(true);
            try {
                const data = await getRoles({ searchQuery: debouncedSearchQuery, take, skip, orderBy });
                const list = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
                setRoles(list);
                setTotalCount(typeof data?.totalCount === 'number' ? data.totalCount : list.length);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
                setRoles([]);
                setTotalCount(0);
            } finally {
                setLoading(false);
            }
        };

        fetchRoles();
    }, [debouncedSearchQuery, take, skip, orderBy, sequence]);

    return { roles, totalCount, loading, error, refetch };
};

export const useRoleMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createRole = async (roleAssignmentData: Role) => {
        setLoading(true);
        setError(null);
        try {
            const createdRole = await createRoleService(roleAssignmentData);
            if (!createdRole) {
                console.warn("A criação do papel pode não ter sido bem-sucedida.");
                setError("A criação do papel pode não ter sido bem-sucedida. Atualize a página para garantir sincronização.");
                return
            };
            setLoading(false);
            setError(null);
            return createdRole;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const updateRole = async (roleAssignmentId: string, roleAssignmentData: Role) => {
        setLoading(true);
        setError(null);
        try {
            const updatedRole = await updateRoleService(roleAssignmentId, roleAssignmentData);
            if (!updatedRole) {
                console.warn("A atualização do papel pode não ter sido bem-sucedida.");
                setError("A atualização do papel pode não ter sido bem-sucedida. Atualize a página para garantir sincronização.");
                return
            };
            setLoading(false);
            setError(null);
            return updatedRole;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteRole = async (roleAssignmentId: string) => {
        setLoading(true);
        setError(null);
        try {
            const deletedRole = await deleteRoleService(roleAssignmentId);
            if (!deletedRole) {
                console.warn("A exclusão do papel pode não ter sido bem-sucedida.");
                setError("A exclusão do papel pode não ter sido bem-sucedida. Atualize a página para garantir sincronização.");
                return
            };
            setLoading(false);
            setError(null);
            return deletedRole;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createRole, updateRole, deleteRole, loading, error };
};