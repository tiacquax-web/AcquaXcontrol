import prisma from '@/lib/prisma';
import { ContextType } from '@prisma/client';

/**
 * Verifica se um usuário está com acesso suspenso.
 * Um usuário é considerado suspenso quando TODOS os condomínios
 * aos quais está vinculado estão com status "Suspenso".
 *
 * Usuários com contextType 'system' (Administradores/Programadores)
 * NUNCA são suspensos — sempre têm acesso.
 *
 * Retorna { suspended: boolean, complexNames: string[] } para mensagem de erro.
 */
export async function checkUserSuspension(userId: string): Promise<{
  suspended: boolean;
  complexNames: string[];
}> {
  // 1. Buscar todos os roleAssignments ativos do usuário
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      userId,
      OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
      ],
    },
    select: { contextId: true, contextType: true },
  });

  // 2. Se tem contexto 'system', é admin/programador — nunca suspende
  const isSystemUser = assignments.some(a => a.contextType === ContextType.system);
  if (isSystemUser) {
    return { suspended: false, complexNames: [] };
  }

  // 3. Coletar todos os complexIds vinculados ao usuário
  //    - Direto: contextType === 'complex'
  //    - Indireto via apartment: precisa buscar o apartment → block → complexId
  //    - Indireto via block: precisa buscar o block → complexId
  const directComplexIds = assignments
    .filter(a => a.contextType === ContextType.complex)
    .map(a => a.contextId);

  const apartmentIds = assignments
    .filter(a => a.contextType === ContextType.apartment)
    .map(a => a.contextId);

  const blockIds = assignments
    .filter(a => a.contextType === ContextType.block)
    .map(a => a.contextId);

  // Buscar complexIds a partir de apartments e blocks
  const indirectComplexIds: string[] = [];

  if (apartmentIds.length > 0) {
    const apartments = await prisma.apartment.findMany({
      where: {
        id: { in: apartmentIds },
        deletedAt: null,
      },
      select: {
        id: true,
        block: { select: { complexId: true } },
      },
    });
    for (const apt of apartments) {
      if (apt.block?.complexId) {
        indirectComplexIds.push(apt.block.complexId);
      }
    }
  }

  if (blockIds.length > 0) {
    const blocks = await prisma.block.findMany({
      where: {
        id: { in: blockIds },
        deletedAt: null,
      },
      select: { id: true, complexId: true },
    });
    for (const blk of blocks) {
      if (blk.complexId) {
        indirectComplexIds.push(blk.complexId);
      }
    }
  }

  // 4. Todos os complexIds do usuário (deduplicados)
  const allComplexIds = [...new Set([...directComplexIds, ...indirectComplexIds])];

  // 5. Se não tem nenhum vínculo com condomínio, não suspende
  //    (pode ser um usuário recém-criado sem atribuição ainda)
  if (allComplexIds.length === 0) {
    return { suspended: false, complexNames: [] };
  }

  // 6. Buscar o status de todos os condomínios vinculados
  const complexes = await prisma.complex.findMany({
    where: {
      id: { in: allComplexIds },
      deletedAt: null,
    },
    select: { id: true, socialName: true, status: true },
  });

  // 7. Se TODOS os condomínios estão suspensos, o usuário está suspenso
  const suspendedComplexes = complexes.filter(c => c.status === 'Suspenso');
  const activeComplexes = complexes.filter(c => c.status !== 'Suspenso');

  // Se não encontrou nenhum complex (foram deletados?), não suspende
  if (complexes.length === 0) {
    return { suspended: false, complexNames: [] };
  }

  const allSuspended = activeComplexes.length === 0 && suspendedComplexes.length > 0;

  return {
    suspended: allSuspended,
    complexNames: suspendedComplexes.map(c => c.socialName),
  };
}

/**
 * Suspende ou reativa um condomínio.
 * Altera o campo `status` entre "Ativo" e "Suspenso".
 */
export async function toggleComplexSuspension(complexId: string, suspend: boolean) {
  const complex = await prisma.complex.findFirst({
    where: { id: complexId, deletedAt: null },
    select: { id: true, socialName: true, status: true },
  });

  if (!complex) {
    throw new Error('Condomínio não encontrado.');
  }

  const newStatus = suspend ? 'Suspenso' : 'Ativo';

  const updated = await prisma.complex.update({
    where: { id: complexId },
    data: { status: newStatus },
    select: { id: true, socialName: true, status: true },
  });

  return updated;
}
