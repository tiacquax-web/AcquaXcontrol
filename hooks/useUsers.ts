import { useState, useEffect } from 'react';
import {
    getUsers,
    createUser as createUserService,
    updateUser as updateUserService,
    deleteUser as deleteUserService,
    createBulkUsersForComplex as createBulkUsersForComplexService,
    exportUsers as exportUsersService,
    bulkUsersAction as bulkUsersActionService
} from '@/services/usersService';
import { ContextType, User } from '@prisma/client';
import { useDebounce } from './use-debounce';

interface useUsersProps {
    searchQuery?: string;
    documentUser?: string;
    userId?: string;
    roleName?: string;
    contextType?: ContextType;
    contextId?: string;
    complexId?: string;
    blockId?: string;
    apartmentId?: string;
    roleId?: string;
    take?: number;
    skip?: number;
    enabled?: boolean;
}

export const useUsers = ({ 
    userId, 
    searchQuery, 
    documentUser, 
    roleName, 
    contextType, 
    contextId, 
    complexId,
    blockId,
    apartmentId,
    roleId,
    take = 10, 
    skip = 0,
    enabled = true 
}: useUsersProps) => {
    const [users, setUsers] = useState<User[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Debounce search query para evitar muitas requisições
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const debouncedDocumentUser = useDebounce(documentUser, 300);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        const fetchUsers = async () => {
            setLoading(true);
            try {
                const data = await getUsers({ 
                    userId, 
                    searchQuery: debouncedSearchQuery, 
                    documentUser: debouncedDocumentUser, 
                    roleName, 
                    contextType, 
                    contextId,
                    complexId,
                    blockId,
                    apartmentId,
                    roleId,
                    take,
                    skip
                });
                setUsers(data.list || data);
                setTotalCount(data.totalCount || data.length || 0);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
                setUsers([]);
                setTotalCount(0);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [debouncedSearchQuery, debouncedDocumentUser, contextType, contextId, complexId, blockId, apartmentId, roleId, userId, roleName, take, skip, enabled]);

    const hasNextPage = skip + take < totalCount;
    const hasPreviousPage = skip > 0;

    const refetch = async () => {
        if (!enabled) return;
        
        setLoading(true);
        try {
            const data = await getUsers({ 
                userId, 
                searchQuery: debouncedSearchQuery, 
                documentUser: debouncedDocumentUser, 
                roleName, 
                contextType, 
                contextId,
                complexId,
                blockId,
                apartmentId,
                roleId,
                take,
                skip
            });
            setUsers(data.list || data);
            setTotalCount(data.totalCount || data.length || 0);
            setError(null);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const exportUsers = async (options: { search?: string; userIds?: string[] }) => {
        try {
            await exportUsersService(options);
            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Erro ao exportar usuários";
            setError(message);
            return { success: false, error: message };
        }
    };

    return { 
        users, 
        totalCount,
        loading, 
        error, 
        hasNextPage, 
        hasPreviousPage,
        refetch,
        exportUsers
    };
};

export const useUserMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createUser = async (companyData: User) => {
        setLoading(true);
        setError(null);
        try {
            const createdUser = await createUserService(companyData);
            return createdUser as User;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateUser = async (companyId: string, companyData: User) => {
        setLoading(true);
        setError(null);
        try {
            const updatedUser = await updateUserService(companyId, companyData);
            return updatedUser as User;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const deleteUser = async (companyId: string) => {
        setLoading(true);
        setError(null);
        try {
            const deletedUser = await deleteUserService(companyId);
            return deletedUser as User;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const createBulkUsersForComplex = async ({
        complexId,
        userNamePrefix,
        userPasswordPrefix,
        userEmailPrefix,
        userEmailDomain
    }: {
        complexId: string;
        userNamePrefix: string;
        userPasswordPrefix: string;
        userEmailPrefix: string;
        userEmailDomain: string;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const result = await createBulkUsersForComplexService({
                complexId,
                userNamePrefix,
                userPasswordPrefix,
                userEmailPrefix,
                userEmailDomain
            });
            return result;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const exportUsers = async ({
        search,
        userIds = []
    }: {
        search?: string;
        userIds?: string[];
    }) => {
        setLoading(true);
        setError(null);
        try {
            const result = await exportUsersService({
                search,
                userIds
            });
            return result;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const bulkUsersAction = async ({
        action,
        search,
        userIds = [],
        complexId,
        blockId,
        apartmentId,
        roleId
    }: {
        action: 'resetAllUsers';
        search?: string;
        userIds?: string[];
        complexId?: string;
        blockId?: string;
        apartmentId?: string;
        roleId?: string;
    }) => {
        setLoading(true);
        setError(null);
        try {
            return await bulkUsersActionService({
                action,
                search,
                userIds,
                complexId,
                blockId,
                apartmentId,
                roleId
            });
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { createUser, updateUser, deleteUser, createBulkUsersForComplex, exportUsers, bulkUsersAction, loading, error };
};