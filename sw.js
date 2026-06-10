// ── NEXOS SERVICE WORKER ─────────────────────────────────
// Versión: cambiar este número para forzar actualización
const CACHE_NAME = 'nexos-v1.2';

// Archivos que se guardan offline
const ARCHIVOS = [
  './nexos_panico.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALACIÓN: guarda los archivos en caché ─────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ARCHIVOS).catch(() => {
        // Si algún ícono no existe aún, instala igual
        return cache.addAll(['./nexos_panico.html', './manifest.json']);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVACIÓN: limpia cachés viejas ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: sirve desde caché, actualiza en background ────
self.addEventListener('fetch', event => {
  // No interceptar peticiones al Google Script (siempre red)
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        // Actualizar caché con versión nueva
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      // Retorna caché inmediatamente, actualiza en segundo plano
      return cached || network;
    })
  );
});
