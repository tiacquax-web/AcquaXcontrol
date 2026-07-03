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
 * - glComplexIds: IDs de condomínios com medidores GL (para gating de abas IoT)
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
                Role: { select: { name: true } },
            },
        });

        const isSystem = assignments.some(a => a.contextType === 'system');
        const systemRoles = assignments
            .filter(a => a.contextType === 'system')
            .map(a => a.Role?.name)
            .filter(Boolean) as string[];
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

        // Helper: IDs únicos de condomínios que o usuário acessa (via apartamento, bloco ou direto)
        const accessibleComplexIds = [
            ...new Set([
                ...apartments.map(a => (a.block as any)?.complexId).filter(Boolean),
                ...blocks.map(b => b.complexId).filter(Boolean),
                ...complexIds,
            ])
        ];

        // ─── GL Detection ───────────────────────────────────────────────────
        // Busca condomínios que possuem medidores com glId vinculado.
        // Isso determina se as abas de Monitoramento, Alertas e Medidores de Nível
        // devem aparecer no sidebar e se a página deve mostrar dados.
        let glComplexIds: string[] = [];
        if (isSystem) {
            // Admin/programador: busca todos os condomínios com GL
            const glMeters = await prisma.meter.findMany({
                where: {
                    glId: { not: null, notIn: [''] },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { complexId: true },
                distinct: ['complexId'],
            });
            glComplexIds = glMeters.map(m => m.complexId).filter(Boolean) as string[];
        } else if (accessibleComplexIds.length > 0) {
            // Síndico/morador/administradora: busca GL apenas nos condomínios acessíveis
            const glMeters = await prisma.meter.findMany({
                where: {
                    glId: { not: null, notIn: [''] },
                    complexId: { in: accessibleComplexIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { complexId: true },
                distinct: ['complexId'],
            });
            glComplexIds = glMeters.map(m => m.complexId).filter(Boolean) as string[];
        }

        return NextResponse.json({
            isSystem,
            systemRoles,
            apartments,
            blocks,
            complexes,
            companyIds,
            accessibleComplexIds,
            glComplexIds,
        });
    } catch (e: any) {
        console.error('[my-context]', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
