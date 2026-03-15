import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';

const PRIVILEGED_ROLE_NAMES = new Set(['programador', 'administrador']);

function normalizeRoleName(name?: string | null): string {
    return String(name || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

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
        // Busca todos os role assignments do usuário (incluindo nome do papel)
        const assignments = await prisma.roleAssignment.findMany({
            where: {
                userId,
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: {
                contextId: true,
                contextType: true,
                roleId: true,
            },
        });

        const roleIds = [...new Set(assignments.map((a) => a.roleId).filter(Boolean))];
        const roles = roleIds.length > 0
            ? await prisma.role.findMany({
                where: { id: { in: roleIds } },
                select: { id: true, name: true },
            })
            : [];
        const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

        const isSystem = assignments.some((a) => {
            if (a.contextType === 'system') return true;
            const roleName = roleNameById.get(a.roleId);
            return PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(roleName));
        });
        const systemRoles = [
            ...new Set(
                assignments
                    .map((a) => roleNameById.get(a.roleId))
                    .filter((name) => PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(name))) as string[]
            ),
        ];
        const apartmentIds = assignments.filter(a => a.contextType === 'apartment').map(a => a.contextId).filter(Boolean) as string[];
        const blockIds = assignments.filter(a => a.contextType === 'block').map(a => a.contextId).filter(Boolean) as string[];
        const complexIds = assignments.filter(a => a.contextType === 'complex').map(a => a.contextId).filter(Boolean) as string[];
        const companyIds = assignments.filter(a => a.contextType === 'company').map(a => a.contextId).filter(Boolean) as string[];

        // Busca dados completos dos apartamentos vinculados diretamente
        const apartments = apartmentIds.length > 0
            ? await prisma.apartment.findMany({
                where: {
                    id: { in: apartmentIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
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

        // Busca blocos vinculados diretamente
        const blocks = blockIds.length > 0
            ? await prisma.block.findMany({
                where: {
                    id: { in: blockIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                include: { complex: { include: { company: true } } }
            })
            : [];

        // Busca condomínios vinculados diretamente
        const complexes = complexIds.length > 0
            ? await prisma.complex.findMany({
                where: {
                    id: { in: complexIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
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
                    ...apartments.map(a => (a.block as any)?.complexId).filter(Boolean),
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
