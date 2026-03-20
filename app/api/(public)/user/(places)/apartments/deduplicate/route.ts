import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { validateUserSession } from "@/lib/users"
import { getUserContextsForActionOnEntity } from "@/lib/userContexts"

function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const contexts = await getUserContextsForActionOnEntity(userId, 'apartment', 'delete');
        const canDeleteApartments = contexts.system ||
            contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 ||
            contexts.blockIds.length > 0 ||
            contexts.apartmentIds.length > 0;
        if (!canDeleteApartments) {
            return NextResponse.json({ error: 'Não autorizado para excluir apartamentos.' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const complexId = body?.complexId ? String(body.complexId) : undefined;
        const blockId = body?.blockId ? String(body.blockId) : undefined;
        const dryRun = body?.dryRun === true;

        const where: any = {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        };
        if (complexId) where.complexId = complexId;
        if (blockId) where.blockId = blockId;

        const apartments = await prisma.apartment.findMany({
            where,
            select: {
                id: true,
                name: true,
                blockId: true,
                complexId: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        const groups = new Map<string, typeof apartments>();
        for (const apartment of apartments) {
            const key = `${apartment.blockId}::${normalizeString(apartment.name)}`;
            const existing = groups.get(key) || [];
            existing.push(apartment);
            groups.set(key, existing);
        }

        const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
        const idsToDelete = duplicateGroups.flatMap((group) => {
            const sorted = [...group].sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return aTime - bTime;
            });
            return sorted.slice(1).map((item) => item.id);
        });

        if (dryRun) {
            return NextResponse.json({
                duplicateGroups: duplicateGroups.length,
                duplicateApartments: idsToDelete.length,
                preview: duplicateGroups.slice(0, 20).map((group) => ({
                    keep: group[0],
                    remove: group.slice(1),
                })),
            });
        }

        if (idsToDelete.length === 0) {
            return NextResponse.json({
                message: 'Nenhum apartamento duplicado encontrado.',
                duplicateGroups: 0,
                deletedCount: 0,
            });
        }

        const result = await prisma.apartment.updateMany({
            where: { id: { in: idsToDelete } },
            data: {
                deletedAt: new Date(),
                updatedByUserId: userId,
            },
        });

        return NextResponse.json({
            message: 'Apartamentos duplicados removidos com sucesso.',
            duplicateGroups: duplicateGroups.length,
            deletedCount: result.count,
        });
    } catch (error: any) {
        console.error('Error deduplicating apartments:', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
