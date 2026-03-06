# PWA + TWA Roadmap e Checklists

Este documento descreve as fases, decisÃµes e checklists para tornar o projeto instalÃ¡vel como PWA e empacotÃ¡-lo como TWA (Android), incluindo orientaÃ§Ã£o de testes, staging e rollout. O objetivo Ã© manter um Ãºnico codebase web e wrappers leves quando necessÃ¡rio.

---

## Fase 0 — Pré‑requisitos e inventário

- [ ] Domínio com HTTPS e HSTS ativos (Vercel + domínio próprio).
- [x] Confirmar Next.js (App Router) e React OK: já usamos Next 15 + React 19.
- [ ] Levantar rotas críticas (login, dashboard, CRUD) e se são SSR/CSR.
- [x] Verificar autenticação baseada em cookie (`session`) e política `SameSite`/`Secure`. (Atualizado: cookie 'session' usa SameSite=Lax e Secure em produção)
- [x] Definir identidade visual (tema, `theme_color`, ícones, splash) e gerar ícones. (Agora com PNGs para PWA/TWA)
- [x] Escolher abordagem de Service Worker: (Selecionada: simples manual — installabilidade + fallback offline)
  - Simples “manual” (mínimo para instalabilidade + fallback offline), ou
  - Biblioteca (ex.: Workbox/`next-pwa`) se quisermos cache mais robusto.

---

## Fase 1 — PWA mínimo (instalável)

Arquivos propostos a criar/ajustar:

- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).

```json
{
  "name": "Acqua X Control",
  "short_name": "Acqua X",
  "start_url": "/dashboard?utm_source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable any" }
  ]
}
```

2) Registrar o manifest no layout principal (`app/layout.tsx`)

```tsx
// metadata export (Next App Router)
export const metadata = {
  title: "Acqua X Control",
  description: "Sua medição de água em tempo real",
- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).
  themeColor: "#0ea5e9",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};
```

3) `public/sw.js` â€” Service Worker mÃ­nimo (instalaÃ§Ã£o + fallback simples)

```js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_URLS = ['/', '/offline']; // adicione uma rota /offline

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Apenas mesmo domÃ­nio; ignore POST/PUT/DELETE
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // Para navegaÃ§Ã£o, tente rede e caia para cache/offline
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch (e) {
          const cache = await caches.open(OFFLINE_CACHE);
          const cached = await cache.match('/offline');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Para estÃ¡ticos, cache-first com revalidate simples
  event.respondWith(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});
```

4) PÃ¡gina de fallback offline `app/offline/page.tsx`

```tsx
export default function Offline() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-2">VocÃª estÃ¡ offline</h1>
      <p>Tente novamente quando a conexÃ£o voltar.</p>
    </main>
  )
}
```

5) Registro do Service Worker (componente cliente)

```tsx
'use client'
import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [])
  return null
}
```

Inserir `<ServiceWorkerRegister />` dentro de `app/layout.tsx` (no `<body>`), mantendo o tema e provedores existentes.

Checklist PWA mínimo:

- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).
- [x] Ícones 192/512 e maskable gerados e colocados em `public/icons` (PNG, 192 real e maskable 512).
- [x] `sw.js` servido em produção e registrado apenas em `NODE_ENV=production`. (Ajuste: precache de ['/', '/offline'] no install)
- [x] Rota `/offline` criada e sem proteções de auth (middleware libera).
- [ ] Lighthouse marca “Installable” e “PWA Optimized”.

Notas de autenticação:
- Preferir `Secure` e `SameSite=Lax` para o cookie `session` (origem própria no TWA).
- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).

---

## Fase 2 — PWA hardening (cache e performance)

- [ ] Definir estratégia de cache:
  - HTML: Network‑first com fallback.
  - Estáticos (`/_next/static`, imagens): Cache‑first com revalidate.
  - APIs GET idempotentes: Stale‑While‑Revalidate com TTL curto.
  - Ignorar `POST/PUT/PATCH/DELETE`.
- [ ] Evitar cachear respostas de erro/401.
- [ ] Testar cenários: login expirado, troca de usuário, limpeza de cache.
- [ ] Considerar Workbox/`next-pwa` para rules declarativas se necessário.

---

## Fase 3 — TWA (Android)

Requisitos:
- PWA instalável em produção.
- Domínio verificado via `assetlinks.json`.

Passos:
- [ ] Gerar projeto com Bubblewrap:
- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).
  - Ajustar `packageId` (ex.: `br.com.acquaxcontrol.www.twa`), nome, ícones e splash.
- [ ] Publicar `public/.well-known/assetlinks.json` com o fingerprint SHA‑256 da keystore de release.

Exemplo `assetlinks.json`:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "br.com.acquaxcontrol.www.twa",
      "sha256_cert_fingerprints": [
        "F7:01:8A:71:89:41:0A:44:5E:4D:59:C0:8D:24:31:E1:64:9C:B9:6F:E6:2C:19:57:E1:05:84:AA:F0:0C:B6:0F" //(esse é local)
      ]
    }
  }
]
```

- [ ] Build e testes locais: `npx @bubblewrap/cli build` e `install` no emulador/dispositivo.
- [ ] Play Console: criar listagem, subir para “Internal testing”, validar update OTA (atualizações vêm do site).

Checklist TWA:
- [ ] App abre em tela cheia (sem UI do navegador).
- [ ] Navegação, login e cookies preservados entre sessões.
- [ ] Deep links (se necessários) resolvem corretamente.
- [ ] Back button e rotação funcionam sem travas.

---

## Fase 4 — Testes e QA

Lighthouse (em dispositivo ou emulação):
- [ ] PWA Installable verde.
- [ ] Performance mobile >= 80 (otimizar imagens, fontes e bundles se necessário).
- [ ] Best Practices e Accessibility sem regressões graves.

Playwright (emulação mobile ex.: Pixel 7 / Chrome):
- [ ] Login: sucesso, erro credenciais, sessão expirada.
- [ ] Dashboard: renderiza cards/gráficos, filtros de data, interações básicas.
- [ ] CRUD principal (ex.: medidores, leituras, relatórios).
- [ ] Navegação protegida (middleware): sem token → redireciona a `/login`.
- [ ] Offline: acessar `/dashboard` sem rede → fallback `/offline` aparece.
- [ ] Voltar online: recarrega e restaura sessão.

Android (TWA) — device real/AVD:
- [ ] Instalação e primeiro uso (splash → start_url).
- [ ] Persistência de sessão após fechar/reabrir.
- [ ] Upload de arquivo/câmera se aplicável.
- [ ] Back button e navegação de sistema.
- [ ] Compartilhar link profundo (se for caso).

---

## Fase 5 — Staging e rollout

- [ ] Subdomínio de staging (ex.: `staging.acquaxcontrol.com`) com build no Vercel.
- [ ] Manifest/ícones iguais; se empacotar TWA de staging, usar `packageId` diferente (ex.: `br.com.acquaxcontrol.www.twa.staging`).
- [ ] `assetlinks.json` próprio para staging.
- [ ] Rollout gradual na Play Console (internal → closed → production).
- [ ] Monitoramento: erros JS, Core Web Vitals e taxa de crash ANRs (via Play Console).

---

## Fase 6 — iOS (opcional)

- [ ] PWA via Safari (Add to Home Screen). Testar: splash, ícones, offline básico.
- [ ] Web Push iOS (se necessário): requer service worker e permissão; validar UX.
- [ ] Caso precise App Store: considerar wrapper (Capacitor) como etapa futura; ainda 1 codebase web + 2 wrappers.

---

## Observações importantes do código atual

- [x] `manifest.webmanifest` acessível em `/manifest.webmanifest` (start_url ajustado para `/login`).
- Cookie `session`: garantir `Secure` em produção e `SameSite=Lax` para TWA (origem própria). Se algum fluxo cruzar domínios, avaliar `SameSite=None` + `Secure`.
- Evitar cache de requests mutáveis e respostas 401/403 no SW.

---

## Próximos passos sugeridos

1) Criar os arquivos do PWA mínimo (manifest, sw, offline) e ajustar `app/layout.tsx` para registrar SW.
2) Adaptar `middleware.ts` para liberar PWA assets públicos e `/offline` sem auth.
3) Rodar Lighthouse e corrigir eventuais apontamentos.
4) Gerar ícones (192/512 e maskable) e colocar em `public/icons`.
5) Iniciar Bubblewrap e preparar `assetlinks.json` (aguardar keystore de release).
6) Configurar staging e testes Playwright.

---

## Referências úteis

- Trusted Web Activity: https://developer.chrome.com/docs/android/trusted-web-activity
- Bubblewrap CLI: https://github.com/GoogleChromeLabs/bubblewrap
- Manifest: https://developer.mozilla.org/docs/Web/Manifest
- Workbox: https://developer.chrome.com/docs/workbox

✦ Excelente! Ter o app rodando no seu celular é um marco enorme. Parabéns!

Agora entramos na parte mais burocrática, mas igualmente importante: a publicação na Google Play Store. O processo é feito dentro da plataforma
do Google, chamada Google Play Console.

Vou te guiar pelo que precisa ser feito.

Passo 1: Pré-requisitos

Antes de qualquer coisa, você precisa de duas coisas:

  1. Conta de Desenvolvedor do Google Play: Se você ainda não tem, precisará criar uma.
      * Acesse: https://play.google.com/console/signup (https://play.google.com/console/signup)
      * Há uma taxa única de registro de US$ 25.
      * O processo de verificação da sua identidade pode levar alguns dias.

  2. O Arquivo Final do App (`.aab`): O arquivo .apk que você instalou é para testes. A Play Store exige um formato chamado Android App Bundle 
    (`.aab`). O Bubblewrap já gera isso para você.
      * Para gerar a versão final, você rodaria o comando: npx @bubblewrap/cli build
      * Ele usará a mesma chave que você criou e gerará o arquivo em android/app/app-release-bundle.aab.
      * Não faremos isso agora, pois primeiro você precisa preencher os dados na loja.

Passo 2: Passos na Google Play Console

Assim que sua conta de desenvolvedor estiver ativa, você fará o seguinte:

  1. Criar o App:
      * Clique em "Criar app".
      * Preencha as informações iniciais: nome do app ("Acqua X Control"), idioma, se é um app ou jogo, se é pago ou gratuito.

  2. Preencher o "Painel de Controle" (Dashboard):
      * A Play Console te dará uma lista de tarefas a serem concluídas antes de poder publicar. As mais importantes são:
      * Acesso ao app: (MUITO IMPORTANTE) Como seu app tem uma tela de login, você precisa fornecer ao Google credenciais de teste (um usuário e
        senha) para que a equipe de revisão possa entrar e testar o app. Se não fizer isso, sua publicação será rejeitada.
      * Anúncios: Você informará se seu app contém anúncios (no seu caso, "Não").
      * Classificação do conteúdo: Você preencherá um questionário para determinar a classificação etária do seu app (ex: Livre). É bem direto.
      * Público-alvo: Você definirá a faixa etária para a qual seu app se destina.
      * Segurança de dados: Você preencherá um formulário detalhado sobre quais dados do usuário seu app coleta, usa e compartilha. Seja honesto
        aqui, com base no que seu site faz (coleta de nome, e-mail, etc.).
      * Detalhes da loja: Esta é a "vitrine" do seu app. Você precisará fornecer:
          * Nome, descrição curta e descrição completa.
          * Recursos gráficos:
              * Ícone do app: (512 x 512 pixels)
              * Gráfico de recursos: (1024 x 500 pixels) - Uma imagem de banner que aparece no topo da página do app.
              * Capturas de tela: Você já as tem! Apenas precisará fazer o upload aqui.

Passo 3: Fazer o Upload e Publicar

  1. Criar uma Versão de Produção:
      * No menu lateral da Play Console, vá para "Produção".
      * Clique em "Criar nova versão".
      * É aqui que você fará o upload do arquivo `app-release-bundle.aab` que o Bubblewrap gera.

  2. Revisão e Lançamento:
      * Depois de fazer o upload e preencher as notas da versão (ex: "Lançamento inicial do aplicativo"), você clicará em "Revisar versão".
      * Se não houver erros, o botão "Iniciar lançamento para Produção" ficará ativo.

Após clicar, o app entrará na fila de revisão do Google. Isso pode levar de algumas horas a vários dias. Se for aprovado, ele aparecerá na Play
Store!

Como Continuar Agora?

Sua primeira tarefa é criar e configurar sua conta de desenvolvedor do Google Play.

Quando sua conta estiver aprovada e você estiver pronto para começar a preencher os dados na Play Console, me avise. Nesse momento, podemos
rodar o comando npx @bubblewrap/cli build para gerar o arquivo .aab final que você precisará para o upload.