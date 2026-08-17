import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { checkUserSuspension } from '@/lib/services/suspension-service';

export async function GET(req: NextRequest): Promise<Response> {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

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

        // Se for admin, pega tudo
        let allComplexIds = complexIds;
        let allBlockIds = blockIds;
        let allApartmentIds = apartmentIds;

        if (isSystem) {
            const allCx = await prisma.complex.findMany({ where: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }, select: { id: true } });
            allComplexIds = allCx.map(c => c.id);
        } else {
            // Se tem companyIds, pega blocos e complexos dessas empresas
            if (companyIds.length > 0) {
                const cxByComp = await prisma.complex.findMany({
                    where: { companyId: { in: companyIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                    select: { id: true }
                });
                cxByComp.forEach(c => allComplexIds.push(c.id));
            }

            // Se tem complexIds, pega blocos desses complexos
            if (allComplexIds.length > 0) {
                const blocksByCx = await prisma.block.findMany({
                    where: { complexId: { in: allComplexIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                    select: { id: true }
                });
                blocksByCx.forEach(b => allBlockIds.push(b.id));
            }

            // Se tem blockIds, pega complexos e apartamentos desses blocos
            if (allBlockIds.length > 0) {
                const blocksData = await prisma.block.findMany({
                    where: { id: { in: allBlockIds }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                    select: { complexId: true }
                });
                blocksData.forEach(b => { if (b.complexId) allComplexIds.push(b.complexId); });
            }
        }

        allComplexIds = [...new Set(allComplexIds)];
        allBlockIds = [...new Set(allBlockIds)];
        allApartmentIds = [...new Set(allApartmentIds)];

        // Buscar dados completos - Usando AND para evitar sobrescrita de chaves OR
        const complexes = await prisma.complex.findMany({
            where: {
                AND: [
                    isSystem ? {} : { id: { in: allComplexIds } },
                    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                ]
            },
            include: { company: true }
        });

        const blocks = await prisma.block.findMany({
            where: {
                AND: [
                    isSystem ? {} : { OR: [{ id: { in: allBlockIds } }, { complexId: { in: allComplexIds } }] },
                    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                ]
            },
            include: { complex: { include: { company: true } } }
        });

        const apartments = await prisma.apartment.findMany({
            where: {
                AND: [
                    isSystem ? {} : { OR: [
                        { id: { in: allApartmentIds } }, 
                        { blockId: { in: allBlockIds } }, 
                        { block: { complexId: { in: allComplexIds } } }
                    ]},
                    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                ]
            },
            include: {
                block: {
                    include: {
                        complex: { include: { company: true } }
                    }
                }
            }
        });

        // GL Detection
        let glComplexIds: string[] = [];
        const glMeters = await prisma.meter.findMany({
            where: {
                AND: [
                    { glId: { not: null, notIn: [''] } },
                    isSystem ? {} : { complexId: { in: complexes.map(c => c.id) } },
                    { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
                ]
            },
            select: { complexId: true },
            distinct: ['complexId'],
        });
        glComplexIds = glMeters.map(m => m.complexId).filter(Boolean) as string[];

        return NextResponse.json({
            isSystem,
            systemRoles,
            apartments,
            blocks,
            complexes,
            companyIds,
            // Adicionamos as IDs diretas para ajudar o frontend a distinguir Morador de Síndico
            directApartmentIds: apartmentIds,
            directBlockIds: blockIds,
            directComplexIds: complexIds,
            accessibleComplexIds: complexes.map(c => c.id),
            glComplexIds,
        });
    } catch (e: any) {
        console.error('[my-context] Error:', e);
        return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 });
    }
}
