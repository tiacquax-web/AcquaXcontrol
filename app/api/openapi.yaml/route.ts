/**
 * GET /api/openapi.yaml — especificação OpenAPI 3.1 da API pública v1.
 *
 * Pública (sem autenticação): é documentação, consumida pelo Swagger UI em
 * /api-docs e por ferramentas externas (Postman, Insomnia, geradores de client).
 */

import { NextResponse } from 'next/server';
import { OPENAPI_YAML } from '@/lib/api/openapi-yaml';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return new NextResponse(OPENAPI_YAML, {
    status: 200,
    headers: {
      'Content-Type': 'application/yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
