import SwaggerView from '@/components/api-docs/swagger-view';

export const metadata = {
  title: 'AcquaX Control API v1 — Referência',
  description: 'Referência interativa da API pública v1 do AcquaXcontrol.',
};

/**
 * /docs/api — referência pública (sem login) da API v1, para enviar a parceiros.
 * Fonte única: /api/openapi.yaml.
 */
export default function PublicApiDocsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-5">
        <h1 className="text-xl font-semibold">AcquaX Control API v1</h1>
        <p className="text-sm text-slate-300 mt-1">
          Base URL: <code>https://www.acquaxcontrol.com.br/api/v1</code> · Autenticação:{' '}
          <code>Authorization: Bearer ak_&lt;uuid&gt;_&lt;segredo&gt;</code>
        </p>
        <p className="text-sm text-slate-300 mt-1">
          Contato: ti.acquax@gmail.com · adm@acquaxdobrasil.com.br
        </p>
      </header>
      <main className="p-4 md:p-6">
        <SwaggerView />
      </main>
    </div>
  );
}
