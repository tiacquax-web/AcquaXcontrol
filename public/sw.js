// Minimal Service Worker for installability and basic offline fallback
self.addEventListener('install', (event) => {
  // Precache minimal offline assets
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.addAll(OFFLINE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_URLS = ['/', '/offline'];

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

  // API requests: network-first, cache-fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone()); // Update cache with fresh response
          return fresh;
        } catch (_e) {
          const cached = await cache.match(req);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // For static assets (all other GET requests): cache-first with revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
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
  );});
