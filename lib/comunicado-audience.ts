/**
 * lib/comunicado-audience.ts
 *
 * Regras de público-alvo da Central de Comunicados.
 *
 * Um comunicado pode ser destinado a um ou mais públicos (audiences):
 *  - 'all'            → todos os perfis
 *  - 'morador'        → moradores
 *  - 'sindico'        → síndicos
 *  - 'administradora' → administradoras
 *  - 'programador'    → programadores (perfil de sistema)
 *  - 'administrador'  → administradores (perfil de sistema)
 */

export type ComunicadoAudience =
  | 'all'
  | 'morador'
  | 'sindico'
  | 'administradora'
  | 'programador'
  | 'administrador';

export const COMUNICADO_AUDIENCES: { value: ComunicadoAudience; label: string; description: string }[] = [
  { value: 'all', label: 'Todos os acessos', description: 'Visível para moradores, síndicos e administração' },
  { value: 'morador', label: 'Moradores', description: 'Apenas usuários com perfil de morador' },
  { value: 'sindico', label: 'Síndicos', description: 'Apenas síndicos(as)' },
  { value: 'administradora', label: 'Administradoras', description: 'Apenas administradoras/gestoras' },
  { value: 'administrador', label: 'Administradores', description: 'Apenas administradores do sistema' },
  { value: 'programador', label: 'Programadores', description: 'Apenas programadores do sistema' },
];

export interface AudienceContextInput {
  isSystem: boolean;
  systemRoles?: string[];
  hasApartment?: boolean;
  hasBlock?: boolean;
  hasComplex?: boolean;
  hasCompany?: boolean;
}

/**
 * Calcula o conjunto de públicos a que um usuário pertence (sem incluir 'all').
 * Um usuário pode pertencer a mais de um público.
 */
export function getUserAudiences(ctx: AudienceContextInput | null | undefined): ComunicadoAudience[] {
  if (!ctx) return [];
  const set = new Set<ComunicadoAudience>();

  if (ctx.isSystem) {
    const roles = (ctx.systemRoles || []).map((r) => (r || '').toLowerCase());
    if (roles.some((r) => r.includes('administrador') || r === 'admin' || r === 'master')) {
      set.add('administrador');
    }
    if (roles.some((r) => r.includes('programador'))) {
      set.add('programador');
    }
    // Perfil de sistema sem papel específico → trata como administrador
    if (set.size === 0) set.add('administrador');
  }

  if (ctx.hasCompany) set.add('administradora');
  if (ctx.hasComplex || ctx.hasBlock) set.add('sindico');
  if (ctx.hasApartment && !ctx.hasComplex && !ctx.hasBlock && !ctx.hasCompany && !ctx.isSystem) {
    set.add('morador');
  }

  return Array.from(set);
}

/** Verifica se um comunicado (pelas suas audiences) é visível para o usuário. */
export function canViewComunicado(
  audiences: string[] | null | undefined,
  userAudiences: ComunicadoAudience[],
): boolean {
  const list = audiences || [];
  if (list.includes('all')) return true;
  return list.some((a) => userAudiences.includes(a as ComunicadoAudience));
}

/** Rótulos legíveis das audiences de um comunicado (para exibição). */
export function describeAudiences(audiences: string[] | null | undefined): string {
  const list = audiences || [];
  if (list.length === 0) return '—';
  if (list.includes('all')) return 'Todos os acessos';
  return list
    .map((a) => COMUNICADO_AUDIENCES.find((x) => x.value === a)?.label || a)
    .join(', ');
}
