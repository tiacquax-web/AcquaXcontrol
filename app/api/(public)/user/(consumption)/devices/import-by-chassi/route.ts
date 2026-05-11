import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { GrouplinkOperationalService, type DeviceChassiImportRow } from '@/lib/services/grouplink-operational-service';

interface ImportByChassiBody {
  rows: DeviceChassiImportRow[];
  pilotMode?: boolean;
  pilotComplexId?: string;
  updateExisting?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = (await req.json()) as ImportByChassiBody;
    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha para importar.' }, { status: 400 });
    }

    const result = await GrouplinkOperationalService.importDevicesByChassi(body.rows, {
      pilotMode: body.pilotMode,
      pilotComplexId: body.pilotComplexId,
      updateExisting: body.updateExisting,
    });

    return NextResponse.json({
      message: 'Importação de devices por chassi concluída.',
      resumo: {
        sucesso: result.success.length,
        criados: result.created.length,
        atualizados: result.updated.length,
        ignorados: result.ignored.length,
        conflitos: result.conflicts.length,
        erros: result.errors.length,
      },
      result,
    });
  } catch (error) {
    console.error('Erro na importação device_id x chassi:', error);
    return NextResponse.json(
      {
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
