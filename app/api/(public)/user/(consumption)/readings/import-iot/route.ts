import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { IotReadingService } from '@/lib/services/iot-reading-service';
import { ReadingReportImport } from '@/types/reading';

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validar sessão do usuário
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        
        if (!validSession) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const userId = validSession.userId;

        // Obter dados do request
        const body = await req.json();
        
        if (!body.readings || !Array.isArray(body.readings)) {
            return NextResponse.json({
                error: 'Dados inválidos. Esperado: { readings: ReadingReportImport[] }'
            }, { status: 400 });
        }

        const importRows: ReadingReportImport[] = body.readings;

        if (importRows.length === 0) {
            return NextResponse.json({
                error: 'Nenhuma leitura para importar'
            }, { status: 400 });
        }

        console.log(`Recebidas ${importRows.length} linhas para importação de leituras IoT`);

        // Processar importação
        const result = await IotReadingService.processIotReadingImport(userId, importRows);

        if (!result.success) {
            return NextResponse.json({
                error: result.error || 'Erro no processamento da importação'
            }, { status: 400 });
        }

        return NextResponse.json({
            message: 'Importação realizada com sucesso',
            data: {
                readingsCreated: result.readingsCreated,
                devicesCreated: result.devicesCreated,
                readingsWithMeter: result.readingsWithMeter,
                readingsWithoutMeter: result.readingsWithoutMeter,
                summary: `${result.readingsCreated} leituras criadas (${result.readingsWithMeter} vinculadas a medidores, ${result.readingsWithoutMeter} não vinculadas). ${result.devicesCreated} dispositivos criados.`
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Erro na rota de importação de leituras IoT:', error);
        
        return NextResponse.json({
            error: 'Erro interno do servidor',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        }, { status: 500 });
    }
}
