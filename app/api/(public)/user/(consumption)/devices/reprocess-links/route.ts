import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import FastReadingReprocessService from '@/lib/services/reading-fast-reprocess-service';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const linkIds = Array.isArray(body?.linkIds) ? body.linkIds : [];
    if (!linkIds.length) {
      return NextResponse.json({ error: 'Nenhum vínculo informado para reprocessamento.' }, { status: 400 });
    }

    const result = await FastReadingReprocessService.reprocessLinkReadings(validSession.userId, linkIds);
    return NextResponse.json({
      message: 'Reprocessamento por vínculos executado.',
      ...result,
    });
  } catch (error) {
    console.error('Erro ao reprocessar por vínculos:', error);
    return NextResponse.json(
      {
        error: 'Erro ao reprocessar vínculos',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
