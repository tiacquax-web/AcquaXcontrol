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
 * Retorna usuários vinculados ao apartamento e garante email de teste se não houver.
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

  const recipients = uniqueRecipients(assignments.map((assignment) => assignment.User));

  if (recipients.length === 0) {
    const apt = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: { name: true },
    });
    // Fallback garantido para teste do morador
    return [{
      id: 'fallback-resident-' + apartmentId,
      name: `Morador Ap. ${apt?.name || ''}`,
      email: 'ruivagiulia@gmail.com',
    }];
  }

  return recipients;
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
