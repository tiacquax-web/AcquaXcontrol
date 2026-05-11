import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { cleanEntityBody } from "@/lib/prisma";
import { validateUserSession } from "@/lib/users";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError || !userId) return NextResponse.json({ error: 'Não autorizado' }, { status: sessionStatus || 401 });

        const { id } = await params;
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody);

        if (!id) return NextResponse.json({ error: 'No id was informed.' }, { status: 400 });
        
        const updated = await prisma.iotDevice.update({ where: { id }, data: body });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating device:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError || !userId) return NextResponse.json({ error: 'Não autorizado' }, { status: sessionStatus || 401 });

        const { id } = await params;

        if (!id) return NextResponse.json({ error: 'No id was informed.' }, { status: 400 });

        const device = await prisma.iotDevice.findUnique({ where: { id }, select: { deviceId: true } });
        if (!device) return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 });

        const now = new Date();
        await Promise.all([
            prisma.iotDevice.update({
                where: { id },
                data: { deletedAt: now },
            }),
            prisma.meterDeviceLink.updateMany({
                where: { deviceId: device.deviceId, deletedAt: null },
                data: { deletedAt: now, endDate: now, updatedByUserId: userId },
            }),
            prisma.meter.updateMany({
                where: { deviceIdIoT: device.deviceId, deletedAt: null },
                data: { deviceIdIoT: null },
            }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting device:", error);
        
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
