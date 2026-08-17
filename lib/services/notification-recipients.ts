import prisma from '@/lib/prisma';

const MANAGEMENT_ROLE_NAMES = [
  'Síndico',
  'Administradora',
  'Sindico',
  'Administrador',
  'Admin',
] as const;

export interface NotificationRecipient {
  id: string;
  name: string;
  email: string;
}

function uniqueRecipients(
  users: Array<{ id: string; name: string; email: string | null; deletedAt?: Date | null } | null>,
): NotificationRecipient[] {
  const seen = new Set<string>();
  const recipients: NotificationRecipient[] = [];

  for (const user of users) {
    if (!user || user.deletedAt || !user.email || seen.has(user.id)) continue;
    seen.add(user.id);
    recipients.push({ id: user.id, name: user.name, email: user.email });
  }

  return recipients;
}

export async function findComplexManagementRecipients(complexId: string): Promise<NotificationRecipient[]> {
  if (!complexId) return [];

  const assignments = await prisma.roleAssignment.findMany({
    where: {
      contextId: complexId,
      contextType: 'complex',
      deletedAt: null,
      Role: {
        deletedAt: null,
        name: { in: [...MANAGEMENT_ROLE_NAMES] },
      },
    },
    select: {
      User: {
        select: { id: true, name: true, email: true, deletedAt: true },
      },
    },
  });

  return uniqueRecipients(assignments.map((assignment) => assignment.User));
}

/**
 * Retorna usuários vinculados diretamente ao apartamento. Sem fallback para evitar sobrecarga.
 */
export async function findApartmentRecipients(apartmentId: string): Promise<NotificationRecipient[]> {
  if (!apartmentId) return [];

  const assignments = await prisma.roleAssignment.findMany({
    where: {
      contextId: apartmentId,
      contextType: 'apartment',
      deletedAt: null,
    },
    select: {
      User: {
        select: { id: true, name: true, email: true, deletedAt: true },
      },
    },
  });

  return uniqueRecipients(assignments.map((assignment) => assignment.User));
}

export function isExternalNotificationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;
  return ![
    '@acquax',
    '@acquaxdobrasil',
    '@acquaxcontrol',
  ].some((blocked) => normalized.includes(blocked));
}
