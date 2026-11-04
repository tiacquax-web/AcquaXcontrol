/**
 * Cliente mínimo da API Gemini (Google) com suporte a function calling.
 *
 * Usado apenas no servidor: a chave nunca vai para o cliente.
 * Env: GEMINI_API_KEY (ou GOOGLE_API_KEY) e, opcional, GEMINI_MODEL.
 */

/**
 * Modelos tentados em ordem. Os aliases "-latest" acompanham a versão corrente do
 * Google, então não ficam obsoletos como os nomes fixos (gemini-2.5-flash foi
 * descontinuado para novas chaves em 11/2026).
 */
export const GEMINI_MODELS: string[] = [
  process.env.GEMINI_MODEL,
  // Lite primeiro: responde em ~0,6s, entende function calling e é o que deixa o
  // atendimento conversacional rápido. Os demais são reserva.
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
].filter(Boolean) as string[];

export interface GeminiTextPart { text: string }
export interface GeminiFunctionCallPart {
  functionCall: { name: string; args?: Record<string, any> };
}
export interface GeminiFunctionResponsePart {
  functionResponse: { name: string; response: Record<string, any> };
}
export type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export class GeminiConfigError extends Error {}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new GeminiConfigError(
      'Assistente sem chave de IA configurada (GEMINI_API_KEY). Peça ao administrador para configurar a chave.',
    );
  }
  return key;
}

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function isRetryableStatus(status: number): boolean {
  // 404 = modelo descontinuado para esta chave; 429/503 = sobrecarga temporária.
  return status === 404 || status === 429 || status === 503 || status === 500;
}

/**
 * Uma chamada ao modelo, tentando os modelos em ordem até um responder.
 * Retorna as partes de conteúdo devolvidas.
 */
export async function geminiGenerate(opts: {
  systemPrompt: string;
  contents: GeminiContent[];
  tools?: GeminiToolDeclaration[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiPart[]> {
  const key = apiKey();

  const body: Record<string, any> = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: 900,
    },
  };

  if (opts.tools?.length) {
    body.tools = [
      {
        functionDeclarations: opts.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  let ultimoErro = '';
  for (const modelo of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
    try {
      // Modelos Gemini 3 pensam antes de responder e isso custa 10-20s na conversa.
      // Nos que aceitam (tudo menos "-lite") desligamos o pensamento.
      const bodyModelo = modelo.includes('lite')
        ? body
        : { ...body, generationConfig: { ...(body.generationConfig as any), thinkingConfig: { thinkingBudget: 0 } } };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyModelo),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        ultimoErro = `Gemini ${modelo} ${res.status}: ${detail.slice(0, 200)}`;
        if (isRetryableStatus(res.status)) continue;
        throw new Error(ultimoErro);
      }

      const data = await res.json();
      const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
      if (parts.length) return parts;
      ultimoErro = `Gemini ${modelo}: resposta vazia`;
    } catch (e: any) {
      // Timeout/erro de rede: tenta o próximo modelo.
      ultimoErro = e?.message || 'falha de rede';
      if (e?.name === 'AbortError') continue;
      if (e instanceof Error && e.message.startsWith('Gemini ') && !/50[03]|429/.test(e.message)) throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Nenhum modelo de IA respondeu agora. Último erro: ${ultimoErro}`);
}
