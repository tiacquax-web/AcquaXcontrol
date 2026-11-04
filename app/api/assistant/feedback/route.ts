/** POST /api/assistant/feedback — 👍/👎 das respostas da Mariana (auditoria e melhoria). */
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { registrarFeedback } from '@/lib/services/assistant/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const session = req.cookies.get('session')?.value;
  const sessao = session ? await isSessionValid(session) : undefined;
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nota = body?.nota === 'inutil' ? 'inutil' : body?.nota === 'util' ? 'util' : null;
  if (!nota) return NextResponse.json({ erro: 'Nota inválida' }, { status: 400 });

  await registrarFeedback({
    userId: sessao.userId,
    conversaId: body?.conversaId ? String(body.conversaId).slice(0, 60) : null,
    mensagemId: body?.mensagemId ? String(body.mensagemId).slice(0, 60) : null,
    nota,
    pergunta: body?.pergunta ? String(body.pergunta).slice(0, 1500) : null,
    resposta: body?.resposta ? String(body.resposta).slice(0, 3000) : null,
    comentario: body?.comentario ? String(body.comentario).slice(0, 800) : null,
  });

  return NextResponse.json({ ok: true });
}
