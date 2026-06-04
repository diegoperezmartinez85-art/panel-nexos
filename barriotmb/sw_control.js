// ══════════════════════════════════════════════════════════
//  NEXOS CONTROL — Service Worker v1.2
//  Estrategia: Cache-first para assets estáticos
//              Network-first para el GAS (API)
// ══════════════════════════════════════════════════════════

const CACHE_NAME  = 'nexos-control-v1.8';
const OFFLINE_URL = './nexos_control.html';

const PRECACHE_ASSETS = [
  './nexos_control.html',
  './manifest.json',
  './nexos-icon-192.png',
  './nexos-icon-512.png',
];

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API GAS, clima → Network-first (datos siempre frescos)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('open-meteo.com')
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Google externas → solo red, sin cachear
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Assets locales → Cache-first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    if (req.mode === 'navigate') {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response('Sin conexión', { status: 503 });
  }
}

async function networkFirst(req) {
  try {
    return await fetch(req);
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'nexos-sync-pendientes') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'NEXOS_SYNC_NOW' }))
      )
    );
  }
});

// ── PUSH NOTIFICATIONS ─────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data.title = event.data.text(); }
  event.waitUntil(self.registration.showNotification(
    data.title || '🚨 NEXOS — Alerta',
    {
      body: data.body || 'Hay una alerta en el barrio',
      icon: './nexos-icon-192.png',
      badge: './nexos-icon-192.png',
      vibrate: [200, 100, 200, 100, 400],
      tag: 'nexos-alerta',
      requireInteraction: true,
      data: { url: './nexos_control.html' }
    }
  ));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url.includes('nexos_control') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('./nexos_control.html');
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
