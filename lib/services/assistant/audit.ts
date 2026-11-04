/**
 * Auditoria e avaliação da Mariana.
 *
 * Gravamos em coleções próprias (AssistantLog / AssistantFeedback) via
 * $runCommandRaw para não depender de migração de schema — em MongoDB o insert
 * cria a coleção na hora. Nada aqui pode quebrar o atendimento: toda gravação
 * é best-effort (try/catch silencioso).
 */
import prisma from '@/lib/prisma';

export interface LogConversa {
  conversaId?: string | null;
  userId: string;
  papel: 'user' | 'assistant';
  texto: string;
  ferramentas?: string[];
  totalMs?: number;
  escopo?: Record<string, any>;
  erro?: string | null;
}

function limpar(doc: Record<string, any>) {
  // Remove undefined (o driver do Mongo serializa mal) e limita tamanho do texto.
  const saida: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === undefined || v === null) continue;
    saida[k] = typeof v === 'string' ? v.slice(0, 4000) : v;
  }
  return saida;
}

async function inserir(colecao: string, doc: Record<string, any>): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      insert: colecao,
      documents: [limpar({ ...doc, criadoEm: new Date().toISOString() })],
    });
  } catch (e: any) {
    console.error(`[assistant/audit] falha ao gravar em ${colecao}:`, e?.message?.slice(0, 200));
  }
}

export async function registrarLog(doc: LogConversa): Promise<void> {
  await inserir('AssistantLog', doc);
}

export async function registrarFeedback(doc: {
  userId: string;
  conversaId?: string | null;
  mensagemId?: string | null;
  nota: 'util' | 'inutil';
  pergunta?: string | null;
  resposta?: string | null;
  comentario?: string | null;
}): Promise<void> {
  await inserir('AssistantFeedback', doc);
}

/** Perguntas avaliadas como "inútil" — matéria-prima para a FAQ e para ajustar o prompt. */
export async function perguntasSemResposta(limite = 20): Promise<any[]> {
  try {
    const r: any = await prisma.$runCommandRaw({
      aggregate: 'AssistantFeedback',
      pipeline: [
        { $match: { nota: 'inutil' } },
        { $sort: { criadoEm: -1 } },
        { $limit: limite },
        { $project: { _id: 0, pergunta: 1, comentario: 1, userId: 1, criadoEm: 1 } },
      ],
      cursor: {},
    });
    return r?.cursor?.firstBatch ?? [];
  } catch {
    return [];
  }
}
