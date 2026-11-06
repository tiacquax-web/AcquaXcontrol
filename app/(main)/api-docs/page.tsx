'use client';

import SwaggerView from '@/components/api-docs/swagger-view';

/** /api-docs — referência interativa (Swagger UI) da API pública v1, dentro do painel. */
export default function ApiDocsPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">API v1 — referência interativa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Base URL: <code>https://www.acquaxcontrol.com.br/api/v1</code> · Autenticação:{' '}
          <code>Authorization: Bearer ak_&lt;uuid&gt;_&lt;segredo&gt;</code> · Especificação:{' '}
          <a className="text-primary underline" href="/api/openapi.yaml" target="_blank" rel="noreferrer">/api/openapi.yaml</a>
          {' '}· Versão pública: <a className="text-primary underline" href="/docs/api" target="_blank" rel="noreferrer">/docs/api</a>
        </p>
      </div>
      <SwaggerView />
    </div>
  );
}
