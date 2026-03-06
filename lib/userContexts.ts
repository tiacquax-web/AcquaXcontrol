import prisma from '@/lib/prisma';
import { ContextType, PermissionAction, PermissionableEntity } from '@prisma/client';

async function getUserContexts(userId: string) {
    const assignments = await prisma.roleAssignment.findMany({
        where: { userId },
        select: { contextId: true, contextType: true },
    });

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system: assignments.some((a) => a.contextType === ContextType.system),
    };
}

async function getUserContextsForEntity(userId: string, entityType: PermissionableEntity) {
    const assignments = await prisma.roleAssignment.findMany({
        where: {
            userId,
            Role: {
                permissions: {
                    some: { entity: entityType }, //TODO: include action in the filter
                },
            },
        },
        select: { contextId: true, contextType: true },
    });

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system: assignments.some((a) => a.contextType === ContextType.system),
    };
}

async function getUserContextsForActionOnEntity(userId: string, entityType: PermissionableEntity, action: 'read' | 'update' | 'delete' | 'create' | 'do') {
    const assignments = await prisma.roleAssignment.findMany({
        where: {
            userId,
            Role: {
                permissions: {
                    some: {
                        entity: entityType,
                        action,
                        deletedAt: null,
                    },
                },
                deletedAt: null,
            },
            deletedAt: null,
        },
        select: { contextId: true, contextType: true },
    });

    console.log("Assignments:", assignments);

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system: assignments.some((a) => a.contextType === ContextType.system),
    };
}

async function getUserPermissions(userId: string) {
    const permissions = await prisma.permission.findMany({
        where: {
            role: {
                RoleAssignments: {
                    some: { userId },
                },
            },
        },
        select: { action: true, entity: true },
    });

    return { permissions: permissions.map((p) => ({ action: p.action, entity: p.entity })) };
}

async function getUserEntityPermissions(userId: string, entityType: PermissionableEntity) {
    const permissions = await prisma.permission.findMany({
        where: {
            role: {
                RoleAssignments: {
                    some: { userId },
                },
            },
            entity: entityType,
        },
        select: { action: true },
    });

    return { permissions: permissions.map((p) => p.action) };
}

async function userHasPermission(userId: string, entityType: PermissionableEntity, action: PermissionAction) {
    const contexts = await getUserContextsForActionOnEntity(userId, entityType, action);

    return (
        contexts.system ||
        contexts.companyIds.length > 0 ||
        contexts.complexIds.length > 0 ||
        contexts.blockIds.length > 0 ||
        contexts.apartmentIds.length > 0
    );
}

export { getUserPermissions, getUserContexts, getUserContextsForEntity, getUserContextsForActionOnEntity, userHasPermission };