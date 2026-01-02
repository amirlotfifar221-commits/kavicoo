/* Kavico Service Worker */
const VERSION = 'kavico-v36';
const OFFLINE_FALLBACK = '/index.html';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/i18n/fa.json',
  '/assets/i18n/en.json',
  '/manifest.webmanifest',
].filter(Boolean);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    try {
      await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    } catch (e) {
      // Ignore precache failures (e.g., offline during install)
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== VERSION ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response('', { status: 504 });
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML): network-first + offline fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || (await cache.match(OFFLINE_FALLBACK));
      }
    })());
    return;
  }

  // Images: stale-while-revalidate
  if (req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // CSS/JS/JSON/fonts: stale-while-revalidate
  if (['style', 'script', 'font'].includes(req.destination) || url.pathname.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Default: cache-first
  event.respondWith(cacheFirst(req));
});
