import { ContextType, PermissionAction } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';

type UserAction = Extract<PermissionAction, 'read' | 'update' | 'delete' | 'create'>;

function notDeletedWhere() {
  return {
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  };
}

function normalizeRoleName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export async function getAccessibleUserIdsForAction(userId: string, action: UserAction) {
  const contexts = await getUserContextsForActionOnEntity(userId, 'user', action);
  const hasPermission =
    contexts.system ||
    contexts.companyIds.length > 0 ||
    contexts.complexIds.length > 0 ||
    contexts.blockIds.length > 0 ||
    contexts.apartmentIds.length > 0;

  if (!hasPermission) {
    return { hasPermission: false, isSystem: false, userIds: [] as string[] };
  }

  if (contexts.system) {
    return { hasPermission: true, isSystem: true, userIds: null as string[] | null };
  }

  const companyIds = [...new Set(contexts.companyIds)];

  const complexIdsSet = new Set(contexts.complexIds);
  if (companyIds.length > 0) {
    const companyComplexes = await prisma.complex.findMany({
      where: { ...notDeletedWhere(), companyId: { in: companyIds } },
      select: { id: true },
    });
    companyComplexes.forEach((cx) => complexIdsSet.add(cx.id));
  }
  const complexIds = [...complexIdsSet];

  const blockIdsSet = new Set(contexts.blockIds);
  if (complexIds.length > 0 || companyIds.length > 0) {
    const blocks = await prisma.block.findMany({
      where: {
        ...notDeletedWhere(),
        OR: [
          ...(complexIds.length > 0 ? [{ complexId: { in: complexIds } }] : []),
          ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
        ],
      },
      select: { id: true },
    });
    blocks.forEach((b) => blockIdsSet.add(b.id));
  }
  const blockIds = [...blockIdsSet];

  const apartmentIdsSet = new Set(contexts.apartmentIds);
  if (blockIds.length > 0 || complexIds.length > 0 || companyIds.length > 0) {
    const apartments = await prisma.apartment.findMany({
      where: {
        ...notDeletedWhere(),
        OR: [
          ...(blockIds.length > 0 ? [{ blockId: { in: blockIds } }] : []),
          ...(complexIds.length > 0 ? [{ complexId: { in: complexIds } }] : []),
          ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
        ],
      },
      select: { id: true },
    });
    apartments.forEach((a) => apartmentIdsSet.add(a.id));
  }
  const apartmentIds = [...apartmentIdsSet];

  const assignmentScopeOr: Array<{ contextType: ContextType; contextId: { in: string[] } }> = [
    ...(companyIds.length > 0
      ? [{ contextType: ContextType.company, contextId: { in: companyIds } }]
      : []),
    ...(complexIds.length > 0
      ? [{ contextType: ContextType.complex, contextId: { in: complexIds } }]
      : []),
    ...(blockIds.length > 0
      ? [{ contextType: ContextType.block, contextId: { in: blockIds } }]
      : []),
    ...(apartmentIds.length > 0
      ? [{ contextType: ContextType.apartment, contextId: { in: apartmentIds } }]
      : []),
  ];

  if (assignmentScopeOr.length === 0) {
    return { hasPermission: true, isSystem: false, userIds: [] as string[] };
  }

  const assignments = await prisma.roleAssignment.findMany({
    where: {
      ...notDeletedWhere(),
      OR: assignmentScopeOr,
    },
    select: { userId: true },
  });

  const userIds = [...new Set(assignments.map((a) => a.userId))];
  return { hasPermission: true, isSystem: false, userIds };
}

export async function userHasRestrictedManagerProfile(userId: string) {
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      ...notDeletedWhere(),
      userId,
    },
    select: {
      contextType: true,
      Role: { select: { name: true } },
    },
  });

  const isSystemUser = assignments.some((a) => a.contextType === ContextType.system);
  if (isSystemUser) return false;

  const hasRestrictedRole = assignments.some((a) => {
    const normalizedName = normalizeRoleName(a.Role?.name || '');
    return normalizedName === 'sindico' || normalizedName === 'administradora';
  });

  return hasRestrictedRole;
}

export function getTemporaryPasswordFromPreferences(preferences: unknown): string {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return '';
  const prefObj = preferences as Record<string, unknown>;

  if (typeof prefObj.temporaryPassword === 'string') return prefObj.temporaryPassword;
  if (typeof prefObj.tempPassword === 'string') return prefObj.tempPassword;
  if (typeof prefObj.password === 'string' && prefObj.passwordSource === 'temporary') return prefObj.password;
  if (prefObj.credentials && typeof prefObj.credentials === 'object') {
    const credentials = prefObj.credentials as Record<string, unknown>;
    if (typeof credentials.temporaryPassword === 'string') return credentials.temporaryPassword;
    if (typeof credentials.password === 'string') return credentials.password;
  }

  return '';
}
