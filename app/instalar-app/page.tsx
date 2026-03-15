import Link from 'next/link';

export default function InstalarAppPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Instalar no iPhone e Android</h1>
        <p className="text-sm text-muted-foreground">
          O AcquaxControl pode ser usado como aplicativo no celular, com atalho na tela inicial.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Android (Chrome)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Acesse o sistema normalmente no Chrome.</li>
          <li>Toque no aviso <strong>Instalar aplicativo</strong> (quando aparecer).</li>
          <li>Confirme em <strong>Instalar</strong>.</li>
          <li>Abra o app pelo ícone criado na tela inicial.</li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">iPhone (Safari)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Abra o sistema no Safari.</li>
          <li>Toque em <strong>Compartilhar</strong> (ícone com seta para cima).</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Confirme em <strong>Adicionar</strong>.</li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Publicar na Play Store e App Store</h2>
        <p className="text-sm text-muted-foreground">
          Para distribuição em loja, use empacotamento da PWA (ex.: PWABuilder). O guia técnico completo
          está em <code>docs/mobile-ios-android.md</code>.
        </p>
      </section>

      <div>
        <Link href="/login" className="text-sm font-medium text-blue-600 hover:underline">
          Voltar para login
        </Link>
      </div>
    </main>
  );
}
