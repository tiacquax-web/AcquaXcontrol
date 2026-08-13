import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { checkUserSuspension } from '@/lib/services/suspension-service';

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

    // ── Verificar suspensão do condomínio ──────────────────────────────────
    try {
        const suspension = await checkUserSuspension(userId);
        if (suspension.suspended) {
            return NextResponse.json(
                { error: 'Acesso suspenso. Procure a administração do seu condomínio.', suspended: true, complexNames: suspension.complexNames },
                { status: 403 }
            );
        }
    } catch (suspErr) {
        console.error('[my-context] Erro ao verificar suspensão:', suspErr);
    }

    try {
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

        // Se for admin do sistema, buscar todos os condomínios
        let targetComplexIds = complexIds;
        if (isSystem) {
            const allCx = await prisma.complex.findMany({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }, select: { id: true } });
            targetComplexIds = allCx.map(c => c.id);
        }

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

        const blocks = blockIds.length > 0
            ? await prisma.block.findMany({
                where: {
                    id: { in: blockIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                include: { complex: { include: { company: true } } }
            })
            : [];

        // Coleta blocos das empresas vinculadas se houver
        if (companyIds.length > 0) {
            const companyBlocks = await prisma.block.findMany({
                where: {
                    complex: { companyId: { in: companyIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { id: true }
            });
            companyBlocks.forEach(b => blockIds.push(b.id));
        }

        const accessibleComplexIds = [
            ...new Set([
                ...apartments.map(a => (a.block as any)?.complexId).filter(Boolean),
                ...blocks.map(b => b.complexId).filter(Boolean),
                ...targetComplexIds,
            ])
        ];

        // Busca dados completos de todos os condomínios acessíveis
        const complexes = accessibleComplexIds.length > 0
            ? await prisma.complex.findMany({
                where: {
                    id: { in: accessibleComplexIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                include: { company: true }
            })
            : [];

        let glComplexIds: string[] = [];
        if (isSystem) {
            const glMeters = await prisma.meter.findMany({
                where: {
                    glId: { not: null, notIn: [''] },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                },
                select: { complexId: true },
            });
            glComplexIds = glMeters.map(m => m.complexId).filter(Boolean) as string[];
        } else if (accessibleComplexIds.length > 0) {
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
