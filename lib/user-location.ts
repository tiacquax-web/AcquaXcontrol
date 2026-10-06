// Resolve a localização (condomínio / bloco / apartamento) de um ou mais usuários
// a partir dos seus RoleAssignments.
//
// Regras de precedência para determinar o condomínio do usuário:
//   1. RoleAssignment de contexto 'apartment'  → apartamento → bloco → condomínio
//   2. RoleAssignment de contexto 'block'      → bloco → condomínio
//   3. RoleAssignment de contexto 'complex'    → condomínio direto
//
// O usuário pode ter múltiplos vínculos; escolhemos o mais específico (apartamento
// antes de bloco, antes de condomínio) para exibição.
import prisma from '@/lib/prisma';

export interface UserLocation {
  complexId: string | null;
  complexName: string | null;
  blockId: string | null;
  blockName: string | null;
  apartmentId: string | null;
  apartmentName: string | null;
}

function emptyLocation(): UserLocation {
  return {
    complexId: null,
    complexName: null,
    blockId: null,
    blockName: null,
    apartmentId: null,
    apartmentName: null,
  };
}

const ACTIVE = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as const;

/**
 * Retorna um Map<userId, UserLocation> para todos os usuários informados.
 * Otimizado: resolve tudo em poucas queries agregadas (sem N+1).
 */
export async function getUserLocations(userIds: string[]): Promise<Map<string, UserLocation>> {
  const result = new Map<string, UserLocation>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  uniqueIds.forEach((id) => result.set(id, emptyLocation()));
  if (uniqueIds.length === 0) return result;

  // Busca TODOS os role assignments relevantes desses usuários de uma vez.
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      userId: { in: uniqueIds },
      contextType: { in: ['apartment', 'block', 'complex'] as any },
      AND: [ACTIVE as any],
    },
    select: { userId: true, contextId: true, contextType: true },
  });

  const apartmentIds = new Set<string>();
  const blockIds = new Set<string>();
  const complexIds = new Set<string>();

  // Agrupa por usuário, mantendo prioridade: apartment > block > complex
  const chosen = new Map<string, { contextType: string; contextId: string }>();
  const priority: Record<string, number> = { apartment: 3, block: 2, complex: 1 };
  for (const a of assignments) {
    if (!a.contextId) continue;
    if (a.contextType === 'apartment') apartmentIds.add(a.contextId);
    else if (a.contextType === 'block') blockIds.add(a.contextId);
    else if (a.contextType === 'complex') complexIds.add(a.contextId);

    const current = chosen.get(a.userId);
    if (!current || (priority[a.contextType] ?? 0) > (priority[current.contextType] ?? 0)) {
      chosen.set(a.userId, { contextType: a.contextType, contextId: a.contextId });
    }
  }

  // Carrega apartamentos (com bloco + condomínio)
  const apartments = apartmentIds.size
    ? await prisma.apartment.findMany({
        where: { id: { in: [...apartmentIds] } },
        select: {
          id: true,
          name: true,
          blockId: true,
          complexId: true,
          block: { select: { id: true, name: true, complexId: true, complex: { select: { id: true, socialName: true } } } },
        },
      })
    : [];

  const apartmentsById = new Map(apartments.map((a: any) => [a.id, a]));

  // Carrega blocos (com condomínio) — inclui os blocos dos apartamentos para resolver nomes
  const blockIdsToLoad = new Set<string>(blockIds);
  apartments.forEach((a: any) => { if (a.blockId) blockIdsToLoad.add(a.blockId); });
  const blocks = blockIdsToLoad.size
    ? await prisma.block.findMany({
        where: { id: { in: [...blockIdsToLoad] } },
        select: { id: true, name: true, complexId: true, complex: { select: { id: true, socialName: true } } },
      })
    : [];
  const blocksById = new Map(blocks.map((b: any) => [b.id, b]));

  // Carrega condomínios diretos e também os que apareceram via bloco/apartamento
  const complexIdsToLoad = new Set<string>(complexIds);
  blocks.forEach((b: any) => { if (b.complexId) complexIdsToLoad.add(b.complexId); });
  apartments.forEach((a: any) => {
    const cx = a.block?.complexId || a.complexId;
    if (cx) complexIdsToLoad.add(cx);
  });
  const complexes = complexIdsToLoad.size
    ? await prisma.complex.findMany({
        where: { id: { in: [...complexIdsToLoad] } },
        select: { id: true, socialName: true, aliasName: true },
      })
    : [];
  const complexesById = new Map(complexes.map((c: any) => [c.id, c]));

  for (const [userId, sel] of chosen.entries()) {
    const loc = emptyLocation();
    if (sel.contextType === 'apartment') {
      const apt: any = apartmentsById.get(sel.contextId);
      if (apt) {
        const blk = apt.block || blocksById.get(apt.blockId);
        const cxId = apt.block?.complexId || apt.complexId || blk?.complexId || null;
        const cx: any = cxId ? complexesById.get(cxId) : null;
        loc.apartmentId = apt.id;
        loc.apartmentName = apt.name ?? null;
        loc.blockId = blk?.id ?? null;
        loc.blockName = blk?.name ?? null;
        loc.complexId = cxId;
        loc.complexName = cx?.socialName || cx?.aliasName || null;
      }
    } else if (sel.contextType === 'block') {
      const blk: any = blocksById.get(sel.contextId);
      if (blk) {
        const cxId = blk.complexId || null;
        const cx: any = cxId ? complexesById.get(cxId) : null;
        loc.blockId = blk.id;
        loc.blockName = blk.name ?? null;
        loc.complexId = cxId;
        loc.complexName = cx?.socialName || cx?.aliasName || null;
      }
    } else if (sel.contextType === 'complex') {
      const cx: any = complexesById.get(sel.contextId);
      if (cx) {
        loc.complexId = cx.id;
        loc.complexName = cx.socialName || cx.aliasName || null;
      }
    }
    result.set(userId, loc);
  }

  return result;
}

/** Conveniência: localização de um único usuário. */
export async function getUserLocation(userId: string): Promise<UserLocation> {
  const map = await getUserLocations([userId]);
  return map.get(userId) ?? emptyLocation();
}
