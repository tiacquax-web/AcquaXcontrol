/**
 * lib/safeError.ts
 * Utilitário para retornar erros 500 sem expor detalhes internos ao cliente.
 * - Em produção: retorna mensagem genérica; loga stack no servidor.
 * - Em desenvolvimento: inclui o detalhe para facilitar debugging.
 */
import { NextResponse } from 'next/server';

export function serverError(
  context: string,
  error: unknown,
  status = 500
): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log completo sempre no servidor
  if (error instanceof Error) {
    console.error(`[${context}] ${error.message}`, error.stack);
  } else {
    console.error(`[${context}]`, error);
  }

  // Em produção: nunca expor detalhes ao cliente
  const body = isDev
    ? {
        error: 'Erro interno do servidor.',
        detail: error instanceof Error ? error.message : String(error),
      }
    : { error: 'Erro interno do servidor. Tente novamente mais tarde.' };

  return NextResponse.json(body, { status });
}
