// ── NEXOS SERVICE WORKER ─────────────────────────────────
// ⚠️ Cambiar este número CADA VEZ que subas un HTML nuevo
const CACHE_NAME = 'nexos-v1.40';

const ARCHIVOS = [
  './nexos_panico.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALACIÓN ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ARCHIVOS).catch(() =>
        cache.addAll(['./nexos_panico.html', './manifest.json'])
      )
    )
  );
  self.skipWaiting(); // activa el SW nuevo sin esperar que cierren la pestaña
});

// ── ACTIVACIÓN: limpia cachés viejas ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // toma control de todas las pestañas abiertas
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.url.includes('script.google.com')) return;

  const esHTML = event.request.destination === 'document' ||
                 event.request.url.endsWith('.html');

  if (esHTML) {
    // HTML: network first → si falla, usa caché (offline)
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Resto (iconos, manifest): cache first → actualiza en background
    event.respondWith(
      caches.match(event.request).then(cached => {
        const network = fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);
        return cached || network;
      })
    );
  }
});
