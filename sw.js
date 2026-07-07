// BoomersWx Service Worker
// Caches the app shell for offline use; API responses use network-first with cache fallback.

const CACHE_VERSION = 'boomerswx-v1';

const STATIC_SHELL = [
  '/BoomersWx/',
  '/BoomersWx/index.html',
  '/BoomersWx/manifest.json',
];

// These origins are always fetched fresh; we fall back to cache only if network fails.
const NETWORK_FIRST_ORIGINS = [
  'api.weather.gov',
  's3.amazonaws.com',
  'public.api.bsky.app',
  'nowcoast.noaa.gov',
  'www.spc.noaa.gov',
];

// ─── INSTALL: cache the app shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: purge old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for external data APIs
  const isDataRequest = NETWORK_FIRST_ORIGINS.some(o => url.hostname.includes(o));
  if (isDataRequest) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for fonts and other CDN assets
  if (url.hostname.includes('fonts.') || url.hostname.includes('unpkg.com') || url.hostname.includes('cartocdn.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Clone and cache the fresh response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline: serve stale cache if available
    const cached = await cache.match(request);
    if (cached) return cached;
    // Return a simple offline JSON placeholder for data requests
    return new Response(
      JSON.stringify({ status: 'offline', message: 'No cached data available' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
