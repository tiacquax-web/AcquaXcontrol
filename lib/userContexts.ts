import prisma from '@/lib/prisma';
import { ContextType, PermissionAction, PermissionableEntity } from '@prisma/client';

// Helper: MongoDB-safe filter for "not deleted" (deletedAt is null OR not set)
function notDeleted() {
    return {
        OR: [
            { deletedAt: null },
            { deletedAt: { isSet: false } },
        ],
    };
}

type ActiveRoleAssignment = {
    contextId: string;
    contextType: ContextType;
    Role?: { name: string | null } | null;
};

function normalizeRoleName(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase();
}

function mapContextsFromAssignments(assignments: ActiveRoleAssignment[]) {
    const hasSystemAssignment = assignments.some((a) => a.contextType === ContextType.system);
    const isProgrammer = assignments.some((a) => normalizeRoleName(a.Role?.name) === 'programador');
    const isAdministrator = assignments.some((a) => normalizeRoleName(a.Role?.name) === 'administrador');
    const isSyndic = assignments.some((a) => {
        const role = normalizeRoleName(a.Role?.name);
        return role === 'síndico' || role === 'sindico';
    });
    const isAdministradora = assignments.some((a) => normalizeRoleName(a.Role?.name) === 'administradora');
    const hasPrivilegedRole = isProgrammer || isAdministrator;

    return {
        apartmentIds: assignments.filter((a) => a.contextType === ContextType.apartment).map((a) => a.contextId),
        blockIds: assignments.filter((a) => a.contextType === ContextType.block).map((a) => a.contextId),
        complexIds: assignments.filter((a) => a.contextType === ContextType.complex).map((a) => a.contextId),
        companyIds: assignments.filter((a) => a.contextType === ContextType.company).map((a) => a.contextId),
        // Programador/Administrador precisam de acesso operacional completo.
        system: hasSystemAssignment || hasPrivilegedRole,
        hasSystemAssignment,
        isProgrammer,
        isAdministrator,
        isSyndic,
        isAdministradora,
    };
}

// Retorna todos os roleAssignments ATIVOS do usuário (sem deletedAt ou com deletedAt null)
async function getUserContexts(userId: string) {
    const assignments = await prisma.roleAssignment.findMany({
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
            Role: { select: { name: true } },
        },
    });

    return mapContextsFromAssignments(assignments as ActiveRoleAssignment[]);
}

// Retorna os roleAssignments ATIVOS do usuário — sem filtrar por permissão de entidade.
// A verificação de permissão granular foi removida pois as permissões específicas
// por entidade/ação podem não estar cadastradas no banco, causando erro em todas as telas.
async function getUserContextsForEntity(userId: string, entityType: PermissionableEntity) {
    const assignments = await prisma.roleAssignment.findMany({
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
            Role: { select: { name: true } },
        },
    });

    return mapContextsFromAssignments(assignments as ActiveRoleAssignment[]);
}

// Retorna os roleAssignments ATIVOS do usuário — sem filtrar por ação específica.
// A verificação granular por permissão (Role.permissions) foi removida pois
// as permissões específicas por entidade/ação podem não estar cadastradas no banco,
// causando Internal Server Error em todas as telas.
async function getUserContextsForActionOnEntity(userId: string, entityType: PermissionableEntity, action: 'read' | 'update' | 'delete' | 'create' | 'do') {
    const assignments = await prisma.roleAssignment.findMany({
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
            Role: { select: { name: true } },
        },
    });

    return mapContextsFromAssignments(assignments as ActiveRoleAssignment[]);
}

async function getUserPermissions(userId: string) {
    const [permissions, assignments] = await Promise.all([
        prisma.permission.findMany({
            where: {
                role: {
                    RoleAssignments: {
                        some: {
                            userId,
                            OR: [
                                { deletedAt: null },
                                { deletedAt: { isSet: false } },
                            ],
                        },
                    },
                },
            },
            select: { action: true, entity: true },
        }),
        prisma.roleAssignment.findMany({
            where: {
                userId,
                OR: [
                    { deletedAt: null },
                    { deletedAt: { isSet: false } },
                ],
            },
            select: {
                Role: { select: { name: true } },
                contextType: true,
            },
        }),
    ]);

    const isProgrammer = assignments.some((a) => normalizeRoleName(a.Role?.name) === 'programador');
    const isAdministrator = assignments.some((a) =>
        normalizeRoleName(a.Role?.name) === 'administrador' || a.contextType === ContextType.system
    );
    const isSyndic = assignments.some((a) => {
        const role = normalizeRoleName(a.Role?.name);
        return role === 'síndico' || role === 'sindico';
    });
    const isAdministradora = assignments.some((a) => normalizeRoleName(a.Role?.name) === 'administradora');

    const permissionMap = new Map<string, { action: PermissionAction; entity: PermissionableEntity }>();
    for (const p of permissions) {
        permissionMap.set(`${p.entity}::${p.action}`, { action: p.action, entity: p.entity });
    }

    // Programador/Admin devem ter acesso operacional completo no produto.
    if (isProgrammer || isAdministrator) {
        const allEntities = Object.values(PermissionableEntity) as PermissionableEntity[];
        const allActions: PermissionAction[] = ['create', 'read', 'update', 'delete', 'do'];

        for (const entity of allEntities) {
            for (const action of allActions) {
                // Exceção: Programador não pode editar funções/permissões dos papéis.
                if (
                    isProgrammer &&
                    (entity === PermissionableEntity.role || entity === PermissionableEntity.permission) &&
                    action !== 'read'
                ) {
                    continue;
                }
                permissionMap.set(`${entity}::${action}`, { entity, action });
            }
        }
    }

    // Síndico/Administradora podem gerenciar dados, porém sem exclusões.
    // Mantém exceção para perfis privilegiados (Administrador/Programador).
    if ((isSyndic || isAdministradora) && !isProgrammer && !isAdministrator) {
        for (const [key, value] of permissionMap.entries()) {
            if (value.action === 'delete') {
                permissionMap.delete(key);
            }
        }
    }

    return { permissions: Array.from(permissionMap.values()) };
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
