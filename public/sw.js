// Service Worker mínimo: apenas fallback offline de navegação.
// IMPORTANTE: não fazer cache de assets/_next nem APIs para evitar bundle stale.
const OFFLINE_CACHE = 'offline-v2';
const OFFLINE_URLS = ['/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.addAll(OFFLINE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== OFFLINE_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin and GET requests
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // Navigations: network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch (_e) {
          const cache = await caches.open(OFFLINE_CACHE);
          const cached = await cache.match('/offline');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Para assets e APIs: deixa o navegador/rede cuidar (sem cache SW).
});
