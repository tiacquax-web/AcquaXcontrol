import { cleanEntityBody } from "@/lib/prisma"
import { updateEntityData, deleteEntity, getEntityData } from "@/lib/userData"
import { validateUserSession } from "@/lib/users"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Reservoir, ReservoirReading } from "@prisma/client"

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const reservoirId = (await params).id;
        const url = new URL(req.url);
        const includeReadings = url.searchParams.get('includeReadings') === 'true';

        // Get reservoir by ID
        let reservoir = await getEntityData(userId, 'reservoir', reservoirId) as (Reservoir & { readings?: ReservoirReading[] }) | null;
        
        if (!reservoir) {
            return NextResponse.json({ error: 'Reservatório não encontrado' }, { status: 404 });
        }

        // Se solicitado, incluir leituras recentes
        if (includeReadings && reservoir) {
            const readings = await prisma.reservoirReading.findMany({
                where: {
                    reservoirId: reservoirId
                },
                orderBy: {
                    readingDate: 'desc'
                },
                take: 1000 // Últimas 1000 leituras
            });

            reservoir = {
                ...reservoir,
                readings: readings
            };
        }

        return NextResponse.json({ reservoir });

    } catch (error: any) {
        console.error('Error in GET /api/reservoirs/[id]:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const reservoirId = (await params).id;

        // Parse request body
        const body = await req.json();

        // Validar dados obrigatórios se fornecidos
        if (body.name !== undefined && !body.name.trim()) {
            return NextResponse.json({ 
                error: 'Nome não pode estar vazio' 
            }, { status: 400 });
        }

        if (body.type !== undefined) {
            const validTypes = ['WATER_TANK', 'CISTERN', 'POOL', 'FOUNTAIN', 'EMERGENCY_TANK', 'TREATMENT_TANK'];
            if (!validTypes.includes(body.type)) {
                return NextResponse.json({ 
                    error: 'Tipo de reservatório inválido. Tipos válidos: ' + validTypes.join(', ') 
                }, { status: 400 });
            }
        }

        // Validar telegramChannel se fornecido
        if (body.telegramChannel !== undefined && !body.telegramChannel.trim()) {
            return NextResponse.json({ 
                error: 'Canal do Telegram não pode estar vazio' 
            }, { status: 400 });
        }

        // Clean and prepare data
        const cleanedData = cleanEntityBody(body);

        // Remove campos que não devem ser atualizados diretamente
        delete cleanedData.id;
        delete cleanedData.createdAt;
        delete cleanedData.createdByUserId;

        // Update reservoir
        const { entity: updatedReservoir, error, status } = await updateEntityData(
            userId,
            'reservoir',
            reservoirId,
            cleanedData
        );

        if (error) return NextResponse.json({ error }, { status });
        if (!updatedReservoir) return NextResponse.json({ error: 'Falha ao atualizar reservatório' }, { status: 500 });

        return NextResponse.json({ 
            reservoir: updatedReservoir,
            message: 'Reservatório atualizado com sucesso' 
        });

    } catch (error: any) {
        console.error('Error in PUT /api/reservoirs/[id]:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const reservoirId = (await params).id;

        // Delete reservoir (soft delete)
        const { error, status } = await deleteEntity(userId, 'reservoir', reservoirId);

        if (error) return NextResponse.json({ error }, { status });

        return NextResponse.json({ 
            message: 'Reservatório excluído com sucesso' 
        });

    } catch (error: any) {
        console.error('Error in DELETE /api/reservoirs/[id]:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
