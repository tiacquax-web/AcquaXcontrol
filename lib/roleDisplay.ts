import { Role } from "@prisma/client";

export const SYNDIC_ADMIN_UNIFIED_NAME = "Síndico / Administradora";

export function normalizeRoleDisplayName(name: string): string {
  if (name === "Síndico" || name === "Administradora") {
    return SYNDIC_ADMIN_UNIFIED_NAME;
  }
  return name;
}

export function getRoleOptionsForUI(roles: Role[]): Role[] {
  // Mantém somente uma opção para o papel unificado no UI.
  const hasSyndic = roles.some((r) => r.name === "Síndico");
  const hasAdminCompany = roles.some((r) => r.name === "Administradora");

  return roles.filter((role) => {
    if (role.name === "Administradora" && hasSyndic) return false;
    if (role.name === "Síndico" && hasAdminCompany) return true;
    return true;
  });
}
