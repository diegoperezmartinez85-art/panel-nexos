// ── NEXOS · El Timbó Vecinos — Service Worker ──
const CACHE_NAME = 'timbo-vecinos-v1';
const ASSETS = [
  './timbo-vecinos.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Install: pre-cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for local assets, network-first for external
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // External requests (tally.so, fonts, etc.) → network only
  if (url.origin !== self.location.origin) {
    return; // let browser handle normally
  }

  // Local assets → cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache valid responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: serve the main HTML
        return caches.match('./timbo-vecinos.html');
      });
    })
  );
});
