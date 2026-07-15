/**
 * Service Worker — AcquaXControl
 *
 * Estratégia de cache:
 * - Navegação (HTML): network-first, fallback offline
 * - Static assets (JS/CSS/imagens): stale-while-revalidate (serve cache, atualiza em background)
 * - API: network-only (sem cache — dados sempre frescos)
 * - Next.js chunks (_next/static): cache-first longa duração (são versionados por hash)
 *
 * Versionamento: bump CACHE_VERSION para invalidar cache de todos os clientes
 */

const CACHE_VERSION = 'v4-2026-07-15';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_CACHE = `offline-${CACHE_VERSION}`;
const OFFLINE_URLS = ['/', '/offline'];

// ─── Install: precache offline page ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.addAll(OFFLINE_URLS).catch(() => {});
      await self.skipWaiting();
    })()
  );
});

// ─── Activate: limpar caches antigos ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.endsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin GET
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // ── API: SEMPRE network (dados frescos, sem cache) ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // ── Navegação (HTML): network-first, fallback offline ──
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(OFFLINE_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (_e) {
          const cache = await caches.open(OFFLINE_CACHE);
          const cached = await cache.match(req);
          return cached || (await cache.match('/offline')) || Response.error();
        }
      })()
    );
    return;
  }

  // ── Next.js chunks (_next/static/*): cache-first (são hashed e imutáveis) ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (_e) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // ── Outros assets (imagens, fontes, etc): stale-while-revalidate ──
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);

      // Revalidar em background
      const networkFetch = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      // Se tem cache, serve imediatamente; senão espera a rede
      if (cached) {
        return cached;
      }
      const fresh = await networkFetch;
      return fresh || Response.error();
    })()
  );
});
