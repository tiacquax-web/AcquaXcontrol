import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Validar sessão do usuário
    const session = req.cookies.get('session')?.value;
    const validSession = session ? await isSessionValid(session) : false;
    
    if (!validSession) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Retornar imediatamente com mensagem de indisponibilidade
    return NextResponse.json({ 
      error: 'Reprocessamento indisponível',
      message: 'Esta funcionalidade está temporariamente desabilitada'
    }, { status: 503 });

  } catch (error) {
    console.error('Erro no reprocessamento de leituras:', error);
    return NextResponse.json({ 
      error: 'Reprocessamento indisponível',
      message: 'Esta funcionalidade está temporariamente desabilitada'
    }, { status: 503 });
  }
}
