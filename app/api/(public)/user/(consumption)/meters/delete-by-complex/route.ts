import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUserSession } from "@/lib/users";
import { getUserContextsForActionOnEntity } from "@/lib/userContexts";

const activeFilter = {
    OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
    ],
} as const;

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const complexId = String(body?.complexId || "").trim();
        if (!complexId) {
            return NextResponse.json({ error: "complexId é obrigatório." }, { status: 400 });
        }

        const contexts = await getUserContextsForActionOnEntity(userId, "meter", "delete");
        const hasAnyDeletePermission = contexts.system ||
            contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 ||
            contexts.blockIds.length > 0 ||
            contexts.apartmentIds.length > 0;
        if (!hasAnyDeletePermission) {
            return NextResponse.json({ error: "Sem permissão para excluir medidores." }, { status: 403 });
        }

        const accessOr: any[] = [];
        if (!contexts.system) {
            if (contexts.companyIds.length > 0) accessOr.push({ companyId: { in: contexts.companyIds } });
            if (contexts.complexIds.length > 0) accessOr.push({ complexId: { in: contexts.complexIds } });
            if (contexts.blockIds.length > 0) accessOr.push({ blockId: { in: contexts.blockIds } });
            if (contexts.apartmentIds.length > 0) accessOr.push({ apartmentId: { in: contexts.apartmentIds } });
            if (accessOr.length === 0) {
                return NextResponse.json({ error: "Sem acesso ao condomínio selecionado." }, { status: 403 });
            }
        }

        const allowedMeters = await prisma.meter.findMany({
            where: {
                complexId,
                ...activeFilter,
                OR: contexts.system ? undefined : accessOr,
            },
            select: { id: true },
        });

        if (allowedMeters.length === 0) {
            return NextResponse.json({
                message: "Nenhum medidor ativo encontrado para o condomínio (ou sem acesso ao contexto).",
                deletedCount: 0,
            });
        }

        const deleted = await prisma.meter.updateMany({
            where: {
                id: { in: allowedMeters.map((m) => m.id) },
            },
            data: {
                deletedAt: new Date(),
                updatedByUserId: userId,
            },
        });

        return NextResponse.json({
            message: "Medidores do condomínio excluídos com sucesso.",
            deletedCount: deleted.count,
            complexId,
        });
    } catch (error: any) {
        console.error("Error deleting meters by complex:", error);
        return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
    }
}
