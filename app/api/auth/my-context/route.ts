import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';

/**
 * GET /api/auth/my-context
 * Retorna os contextos do usuário logado com dados completos:
 * - apartamentos vinculados (com bloco e condomínio)
 * - blocos vinculados
 * - condomínios vinculados
 * - se tem permissão de sistema (admin/programador)
 */
export async function GET(req: NextRequest): Promise<Response> {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    try {
        const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

        // Busca todos os role assignments do usuário (incluindo nome do papel)
        const assignments = await prisma.roleAssignment.findMany({
            where: {
                userId,
                ...notDeleted,
            },
            select: {
                contextId: true,
                contextType: true,
                Role: { select: { name: true } },
            },
        });

        const isSystem = assignments.some(a => a.contextType === 'system');
        // Nomes dos papéis com contextType=system ex: ['Administrador'] ou ['Programador']
        const systemRoles = assignments
            .filter(a => a.contextType === 'system')
            .map(a => a.Role?.name)
            .filter(Boolean) as string[];
        const apartmentIds = [...new Set(assignments
            .filter(a => a.contextType === 'apartment')
            .map(a => a.contextId)
            .filter(Boolean) as string[])];
        const blockIds = [...new Set(assignments
            .filter(a => a.contextType === 'block')
            .map(a => a.contextId)
            .filter(Boolean) as string[])];
        const complexIds = [...new Set(assignments
            .filter(a => a.contextType === 'complex')
            .map(a => a.contextId)
            .filter(Boolean) as string[])];
        const companyIds = [...new Set(assignments
            .filter(a => a.contextType === 'company')
            .map(a => a.contextId)
            .filter(Boolean) as string[])];

        // Apartamentos acessíveis pelo usuário:
        // - vínculo direto de apartamento
        // - herança por bloco/condomínio/empresa (contextos superiores)
        const apartmentWhereOr: Array<
            | { id: { in: string[] } }
            | { blockId: { in: string[] } }
            | { complexId: { in: string[] } }
            | { companyId: { in: string[] } }
        > = [];
        if (apartmentIds.length > 0) apartmentWhereOr.push({ id: { in: apartmentIds } });
        if (blockIds.length > 0) apartmentWhereOr.push({ blockId: { in: blockIds } });
        if (complexIds.length > 0) apartmentWhereOr.push({ complexId: { in: complexIds } });
        if (companyIds.length > 0) apartmentWhereOr.push({ companyId: { in: companyIds } });

        // Busca dados completos dos apartamentos acessíveis
        const apartments = apartmentWhereOr.length > 0
            ? await prisma.apartment.findMany({
                where: {
                    AND: [
                        notDeleted,
                        { OR: apartmentWhereOr },
                    ],
                },
                include: {
                    block: {
                        include: {
                            complex: {
                                include: { company: true }
                            }
                        }
                    }
                }
            })
            : [];

        // Ordenação estável para manter UX consistente no dashboard
        const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
        apartments.sort((a, b) => {
            const cxA = a.block?.complex?.socialName || '';
            const cxB = b.block?.complex?.socialName || '';
            const blockA = a.block?.name || '';
            const blockB = b.block?.name || '';
            const aptA = a.name || '';
            const aptB = b.name || '';

            const cxCmp = collator.compare(cxA, cxB);
            if (cxCmp !== 0) return cxCmp;

            const blockCmp = collator.compare(blockA, blockB);
            if (blockCmp !== 0) return blockCmp;

            return collator.compare(aptA, aptB);
        });

        // Busca blocos vinculados diretamente
        const blocks = blockIds.length > 0
            ? await prisma.block.findMany({
                where: {
                    id: { in: blockIds },
                    ...notDeleted,
                },
                include: { complex: { include: { company: true } } }
            })
            : [];

        // Busca condomínios vinculados diretamente
        const complexes = complexIds.length > 0
            ? await prisma.complex.findMany({
                where: {
                    id: { in: complexIds },
                    ...notDeleted,
                },
                include: { company: true }
            })
            : [];

        return NextResponse.json({
            isSystem,
            systemRoles,
            apartments,
            blocks,
            complexes,
            companyIds,
            // Helper: IDs únicos de condomínios que o usuário acessa (via apartamento, bloco ou direto)
            accessibleComplexIds: [
                ...new Set([
                    ...apartments.map(a => a.block?.complexId || a.block?.complex?.id).filter(Boolean),
                    ...blocks.map(b => b.complexId).filter(Boolean),
                    ...complexIds,
                ])
            ],
        });
    } catch (e: any) {
        console.error('[my-context]', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
