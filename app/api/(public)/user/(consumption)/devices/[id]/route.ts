import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { cleanEntityBody } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
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
        const { id } = await params;

        if (!id) return NextResponse.json({ error: 'No id was informed.' }, { status: 400 });

        await prisma.iotDevice.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting device:", error);
        
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
