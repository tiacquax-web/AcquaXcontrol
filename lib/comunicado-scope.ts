/**
 * lib/comunicado-scope.ts
 *
 * Escopo de visibilidade da Central de Comunicados — usado apenas no servidor.
 *
 * Resolve, a partir dos vínculos (RoleAssignment) do usuário:
 *  - isAdmin        → administrador/programador do sistema (vê tudo)
 *  - userAudiences  → públicos do usuário (morador, síndico, administradora...)
 *  - complexIds     → condomínios a que o usuário tem acesso
 *
 * O acesso a um condomínio pode vir de vínculo direto (complex), de empresa
 * (company → todos os condomínios dela), de bloco (block → condomínio do bloco)
 * ou de unidade (apartment → bloco → condomínio).
 */

import prisma from '@/lib/prisma';
import { getUserAudiences, type ComunicadoAudience } from '@/lib/comunicado-audience';

const NOT_DELETED = [{ deletedAt: null }, { deletedAt: { isSet: false } }];

export interface ComunicadoScope {
  isAdmin: boolean;
  systemRoles: string[];
  userAudiences: ComunicadoAudience[];
  /** Vazio para administradores de sistema (sem restrição). */
  complexIds: string[];
}

/** Resolve o escopo completo do usuário na Central de Comunicados. */
export async function getComunicadoScope(userId: string): Promise<ComunicadoScope> {
  const assignments = await prisma.roleAssignment.findMany({
    where: { userId, OR: NOT_DELETED },
    select: {
      contextId: true,
      contextType: true,
      Role: { select: { name: true } },
    },
  });

  const systemAssignments = assignments.filter(
    (a) =>
      a.contextType === 'system' ||
      ['administrador', 'programador', 'master', 'admin'].includes((a.Role?.name || '').toLowerCase()),
  );
  const isSystem = systemAssignments.length > 0;
  const systemRoles = systemAssignments.map((a) => a.Role?.name || '').filter(Boolean) as string[];

  const idsOfType = (type: string) =>
    assignments
      .filter((a) => a.contextType === type)
      .map((a) => a.contextId)
      .filter(Boolean) as string[];

  const directComplexIds = idsOfType('complex');
  const blockIds = idsOfType('block');
  const apartmentIds = idsOfType('apartment');
  const companyIds = idsOfType('company');

  const userAudiences = getUserAudiences({
    isSystem,
    systemRoles,
    hasApartment: apartmentIds.length > 0,
    hasBlock: blockIds.length > 0,
    hasComplex: directComplexIds.length > 0,
    hasCompany: companyIds.length > 0,
  });

  // Administrador de sistema vê todos os condomínios (lista vazia = sem restrição).
  if (isSystem) {
    return { isAdmin: true, systemRoles, userAudiences, complexIds: [] };
  }

  const complexIds = new Set<string>(directComplexIds);

  // Empresa → todos os condomínios da empresa
  if (companyIds.length > 0) {
    const byCompany = await prisma.complex.findMany({
      where: { companyId: { in: companyIds }, OR: NOT_DELETED },
      select: { id: true },
    });
    byCompany.forEach((c) => complexIds.add(c.id));
  }

  // Bloco → condomínio do bloco
  if (blockIds.length > 0) {
    const blocks = await prisma.block.findMany({
      where: { id: { in: blockIds } },
      select: { complexId: true },
    });
    blocks.forEach((b) => b.complexId && complexIds.add(b.complexId));
  }

  // Apartamento → bloco → condomínio
  if (apartmentIds.length > 0) {
    const apartments = await prisma.apartment.findMany({
      where: { id: { in: apartmentIds } },
      select: { block: { select: { complexId: true } } },
    });
    apartments.forEach((a) => a.block?.complexId && complexIds.add(a.block.complexId));
  }

  let finalIds = Array.from(complexIds);

  // Descarta condomínios removidos, preservando os que vêm por vínculo direto
  if (finalIds.length > 0) {
    const valid = await prisma.complex.findMany({
      where: { id: { in: finalIds }, OR: NOT_DELETED },
      select: { id: true },
    });
    const validSet = new Set(valid.map((c) => c.id));
    finalIds = finalIds.filter((id) => validSet.has(id) || directComplexIds.includes(id));
  }

  return { isAdmin: false, systemRoles, userAudiences, complexIds: finalIds };
}

/**
 * Um comunicado é visível pelo condomínio quando não tem condomínios definidos
 * (vale para todos) ou quando o usuário tem acesso a pelo menos um deles.
 */
export function canViewComunicadoForComplex(
  comunicadoComplexIds: string[] | null | undefined,
  scope: Pick<ComunicadoScope, 'isAdmin' | 'complexIds'>,
): boolean {
  if (scope.isAdmin) return true;
  const targets = comunicadoComplexIds || [];
  if (targets.length === 0) return true;
  const allowed = new Set(scope.complexIds);
  return targets.some((id) => allowed.has(id));
}

/** Nome legível do condomínio (alias tem prioridade sobre a razão social). */
export function complexDisplayName(
  c: { socialName?: string | null; aliasName?: string | null } | undefined | null,
): string {
  if (!c) return '';
  return (c.aliasName || c.socialName || '').trim();
}
