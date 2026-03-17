import { useState, useEffect } from 'react';
import {
    getRoleAssignments,
    createRoleAssignment as createRoleAssignmentService,
    updateRoleAssignment as updateRoleAssignmentService,
    deleteRoleAssignment as deleteRoleAssignmentService
} from '@/services/roleAssignmentService';
import { RoleAssignmentWithRoleAndUser } from '@/types/roleAssignment';
import { ContextType, Role } from '@prisma/client';

interface useRoleAssignmentsProps {
    searchQuery?: string;
    userName?: string;
    roleName?: string;
    userId?: string;
    roleId?: string;
}

type mutateRoleAssignmentProps = {
    userId: string;
    roleId: string;
    contextType: ContextType;
    contextId: string;
};

export const useRoleAssignments = ({ searchQuery, userName, roleName, userId, roleId }: useRoleAssignmentsProps) => {
    const [roleAssignments, setRoleAssignments] = useState<RoleAssignmentWithRoleAndUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sequence, setSequence] = useState(0);

    const refetch = () => {
        setLoading(true);
        setSequence((prev) => prev + 1);
    };

    useEffect(() => {
        const fetchRoleAssignments = async () => {
            try {
                const data = await getRoleAssignments({ searchQuery, userName, roleName, userId, roleId, withUser: false, withRole: true, withContext: true });
                setRoleAssignments(data);
                setError(null);
            } catch (error: any) {
                const message = error.response?.data?.error || error.message || "Unknown error";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchRoleAssignments();
    }, [searchQuery, userName, roleName, userId, roleId, sequence]);

    return { roleAssignments, loading, error, refetch };
};

export const useRoleAssignmentMutations = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createRoleAssignment = async (roleAssignmentData: mutateRoleAssignmentProps) => {
        setLoading(true);
        setError(null);
        try {
            const createdRoleAssignment = await createRoleAssignmentService(roleAssignmentData);
            setError(null);
            return createdRoleAssignment;
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateRoleAssignment = async (roleAssignmentId: string, roleAssignmentData: mutateRoleAssignmentProps) => {
        setLoading(true);
        setError(null);
        try {
            await updateRoleAssignmentService(roleAssignmentId, roleAssignmentData);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const deleteRoleAssignment = async (roleAssignmentId: string) => {
        setLoading(true);
        setError(null);
        try {
            await deleteRoleAssignmentService(roleAssignmentId);
        } catch (error: any) {
            const message = error.response?.data?.error || error.message || "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return { createRoleAssignment, updateRoleAssignment, deleteRoleAssignment, loading, error };
};