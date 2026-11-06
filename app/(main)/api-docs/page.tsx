'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * /api-docs — referência interativa (Swagger UI) da API pública v1.
 *
 * Os arquivos do Swagger UI são servidos pelo próprio domínio (/swagger/*),
 * porque a CSP da aplicação não permite scripts de CDNs externos.
 */
export default function ApiDocsPage() {
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/swagger/swagger-ui.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = '/swagger/swagger-ui-bundle.js';
    script.async = true;
    script.onload = () => {
      const bundle = (window as any).SwaggerUIBundle;
      if (!bundle) {
        setError('Falha ao carregar o Swagger UI.');
        return;
      }
      bundle({
        url: '/api/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        tryItOutEnabled: true,
        persistAuthorization: true,
        layout: 'BaseLayout',
      });
    };
    script.onerror = () => setError('Falha ao carregar o Swagger UI.');
    document.body.appendChild(script);
  }, []);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">API v1 — referência interativa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Base URL: <code>https://www.acquaxcontrol.com.br/api/v1</code> · Autenticação:{' '}
          <code>Authorization: Bearer ak_&lt;uuid&gt;_&lt;segredo&gt;</code> · Especificação:{' '}
          <a className="text-primary underline" href="/api/openapi.yaml" target="_blank" rel="noreferrer">
            /api/openapi.yaml
          </a>
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div id="swagger-ui" className="bg-white rounded-md border" />
    </div>
  );
}
