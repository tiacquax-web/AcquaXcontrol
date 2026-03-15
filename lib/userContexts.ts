import prisma from '@/lib/prisma';
import { ContextType, PermissionAction, PermissionableEntity } from '@prisma/client';

const PRIVILEGED_ROLE_NAMES = new Set(['programador', 'administrador']);

function normalizeRoleName(name?: string | null): string {
    return String(name || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

type AssignmentWithRole = {
    contextId: string;
    contextType: ContextType;
    roleId: string;
};

async function getAssignmentsWithRole(userId: string): Promise<AssignmentWithRole[]> {
    return prisma.roleAssignment.findMany({
        where: {
            userId,
            OR: [
                { deletedAt: null },
                { deletedAt: { isSet: false } },
            ],
        },
        select: {
            contextId: true,
            contextType: true,
            roleId: true,
        },
    }) as Promise<AssignmentWithRole[]>;
}

async function isSystemLike(assignments: AssignmentWithRole[]): Promise<boolean> {
    if (assignments.some((a) => a.contextType === ContextType.system)) {
        return true;
    }
    const roleIds = [...new Set(assignments.map((a) => a.roleId).filter(Boolean))];
    if (roleIds.length === 0) return false;
    const roles = await prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, name: true },
    });
    const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
    return assignments.some((a) =>
        a.contextType === ContextType.system ||
        PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(roleNameById.get(a.roleId)))
    );
}

// Retorna todos os roleAssignments ATIVOS do usuário (sem deletedAt ou com deletedAt null)
async function getUserContexts(userId: string) {
    const assignments = await getAssignmentsWithRole(userId);
    const system = await isSystemLike(assignments);

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system,
    };
}

// Retorna os roleAssignments ATIVOS do usuário — sem filtrar por permissão de entidade.
// A verificação de permissão granular foi removida pois as permissões específicas
// por entidade/ação podem não estar cadastradas no banco, causando erro em todas as telas.
async function getUserContextsForEntity(userId: string, entityType: PermissionableEntity) {
    const assignments = await getAssignmentsWithRole(userId);
    const system = await isSystemLike(assignments);

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system,
    };
}

// Retorna os roleAssignments ATIVOS do usuário — sem filtrar por ação específica.
// A verificação granular por permissão (Role.permissions) foi removida pois
// as permissões específicas por entidade/ação podem não estar cadastradas no banco,
// causando Internal Server Error em todas as telas.
async function getUserContextsForActionOnEntity(userId: string, entityType: PermissionableEntity, action: 'read' | 'update' | 'delete' | 'create' | 'do') {
    const assignments = await getAssignmentsWithRole(userId);
    const system = await isSystemLike(assignments);

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        system,
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
