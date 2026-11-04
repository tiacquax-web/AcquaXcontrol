/**
 * Cliente mínimo da API Gemini (Google) com suporte a function calling.
 *
 * Usado apenas no servidor: a chave nunca vai para o cliente.
 * Env: GEMINI_API_KEY (ou GOOGLE_API_KEY) e, opcional, GEMINI_MODEL.
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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

/** Uma chamada ao modelo. Retorna as partes de conteúdo devolvidas. */
export async function geminiGenerate(opts: {
  systemPrompt: string;
  contents: GeminiContent[];
  tools?: GeminiToolDeclaration[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiPart[]> {
  const key = apiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const body: Record<string, any> = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: 1200,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 400)}`);
    }

    const data = await res.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    return parts;
  } finally {
    clearTimeout(timer);
  }
}
