// API do assistente IA: POST /api/assistant/chat
// Recebe a mensagem, roda o loop de function calling com o Gemini e devolve a resposta.
import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import {
  geminiGenerate,
  isAssistantConfigured,
  GeminiConfigError,
  type GeminiContent,
  type GeminiFunctionCallPart,
} from '@/lib/services/assistant/gemini';
import { TOOL_DECLARATIONS, executarFerramenta, prefetchContexto, type ToolContext } from '@/lib/services/assistant/tools';
import { buildSystemPrompt } from '@/lib/services/assistant/prompt';
import { avaliarAcesso } from '@/lib/services/assistant/policy';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 8;

// Limite simples por instância (aproximado em serverless, serve como freio).
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT_PER_HOUR = 40;

function withinLimit(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now > b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (b.count >= LIMIT_PER_HOUR) return false;
  b.count += 1;
  return true;
}

async function acessoSessao(req: NextRequest): Promise<
  | { erro: Response }
  | { userId: string; email: string | null; isSystem: boolean }
> {
  const session = req.cookies.get('session')?.value;
  const validSession = session ? await isSessionValid(session) : false;
  if (!validSession) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const userId = validSession.userId as string;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null);
  const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update').catch(() => null);
  return { userId, email: user?.email ?? null, isSystem: Boolean(contexts?.system) };
}

/** GET: o widget pergunta se deve aparecer para este usuário (e qual aviso exibir). */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sessao = await acessoSessao(req);
    if ('erro' in sessao) return sessao.erro;

    const acesso = avaliarAcesso({ email: sessao.email, isSystem: sessao.isSystem });
    return NextResponse.json({
      enabled: acesso.enabled,
      beta: acesso.beta,
      banner: acesso.banner,
      motivo: acesso.motivo ?? null,
    });
  } catch (e) {
    console.error('[assistant/chat][GET] erro:', e);
    return NextResponse.json({ enabled: false, beta: true, banner: null }, { status: 200 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const sessao = await acessoSessao(req);
    if ('erro' in sessao) return sessao.erro;
    const userId = sessao.userId;

    const acesso = avaliarAcesso({ email: sessao.email, isSystem: sessao.isSystem });
    if (!acesso.enabled) {
      return NextResponse.json(
        { error: acesso.motivo || 'O assistente ainda não está liberado para o seu acesso.' },
        { status: 403 },
      );
    }

    if (!isAssistantConfigured()) {
      return NextResponse.json(
        { error: 'O assistente ainda não está configurado (falta a chave de IA). Fale com o administrador.' },
        { status: 503 },
      );
    }

    if (!withinLimit(userId)) {
      return NextResponse.json(
        { error: 'Você fez muitas perguntas em pouco tempo. Tente novamente daqui a pouco ou abra um chamado no suporte.' },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    const history: Array<{ role: 'user' | 'model'; text: string }> = Array.isArray(body?.history) ? body.history : [];

    if (!message) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: 'Mensagem muito longa' }, { status: 400 });

    const origin = new URL(req.url).origin;
    const toolCtx: ToolContext = {
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || origin,
      cookie: req.headers.get('cookie') || '',
      userId,
      cache: new Map(),
    };
    // Aquece my-context enquanto o modelo pensa: a primeira ferramenta já acha o cache.
    prefetchContexto(toolCtx);

    const contents: GeminiContent[] = [];
    for (const h of history.slice(-MAX_HISTORY)) {
      if (!h?.text?.trim()) continue;
      contents.push({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text).slice(0, 1500) }] });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const systemPrompt = buildSystemPrompt({
      hoje: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' }).format(new Date()),
    });

    const ferramentasUsadas: string[] = [];
    const iniciadoEm = Date.now();
    const TETO_MS = 42000; // a função morre em 60s; acima disso é melhor responder do que estourar

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      if (Date.now() - iniciadoEm > TETO_MS) {
        return NextResponse.json({
          reply: 'A consulta ficou pesada demais e eu parei no meio para não te deixar esperando. '
            + 'Tente pedir um período menor (por exemplo, um mês ou um condomínio só).',
          tools: ferramentasUsadas,
          beta: acesso.beta,
          banner: acesso.banner,
        });
      }

      const isLastChance = round === MAX_TOOL_ROUNDS;
      const parts = await geminiGenerate({
        systemPrompt,
        contents,
        tools: isLastChance ? undefined : TOOL_DECLARATIONS,
      });

      const textParts = parts
        .filter((p): p is { text: string } => 'text' in p && typeof (p as any).text === 'string')
        .map(p => p.text)
        .join('\n')
        .trim();

      const calls = parts.filter((p): p is GeminiFunctionCallPart => 'functionCall' in p);

      if (!calls.length) {
        return NextResponse.json({
          reply: textParts || 'Não consegui montar uma resposta agora. Pode reformular?',
          tools: ferramentasUsadas,
          beta: acesso.beta,
          banner: acesso.banner,
        });
      }

      // Devolve ao modelo o que ele pediu e o resultado de cada ferramenta.
      contents.push({ role: 'model', parts });
      const responses = [];
      for (const call of calls) {
        const nome = call.functionCall?.name;
        if (!nome) continue;
        ferramentasUsadas.push(nome);
        let resultado: Record<string, any>;
        try {
          resultado = await executarFerramenta(nome, call.functionCall.args || {}, toolCtx);
        } catch (e: any) {
          resultado = { erro: true, mensagem: e?.message || 'Falha ao executar a consulta' };
        }
        responses.push({ functionResponse: { name: nome, response: resultado } });
      }
      contents.push({ role: 'user', parts: responses as any });
    }

    return NextResponse.json({
      reply: 'Não consegui concluir essa consulta agora. Quer que eu abra um chamado para o suporte?',
      tools: ferramentasUsadas,
    });
  } catch (e: any) {
    if (e instanceof GeminiConfigError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    console.error('[assistant/chat] erro:', e);
    return NextResponse.json({ error: 'Erro ao falar com o assistente. Tente novamente.' }, { status: 500 });
  }
}
