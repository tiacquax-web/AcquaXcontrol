'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Swagger UI carregado com assets do próprio domínio (/swagger/*),
 * porque a CSP da aplicação não permite scripts de CDNs externos.
 */
export default function SwaggerView({ specUrl = '/api/openapi.yaml', tryItOut = true }: { specUrl?: string; tryItOut?: boolean }) {
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    if (!document.querySelector('link[data-swagger-css]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/swagger/swagger-ui.css';
      css.setAttribute('data-swagger-css', 'true');
      document.head.appendChild(css);
    }

    const boot = () => {
      const bundle = (window as any).SwaggerUIBundle;
      if (!bundle) {
        setError('Falha ao carregar o Swagger UI.');
        return;
      }
      bundle({
        url: specUrl,
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        tryItOutEnabled: tryItOut,
        persistAuthorization: true,
        layout: 'BaseLayout',
      });
    };

    if ((window as any).SwaggerUIBundle) {
      boot();
      return;
    }

    const script = document.createElement('script');
    script.src = '/swagger/swagger-ui-bundle.js';
    script.async = true;
    script.onload = boot;
    script.onerror = () => setError('Falha ao carregar o Swagger UI.');
    document.body.appendChild(script);
  }, [specUrl, tryItOut]);

  return (
    <>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div id="swagger-ui" className="bg-white rounded-md border" />
    </>
  );
}
