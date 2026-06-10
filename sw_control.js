// ══════════════════════════════════════════════════════════
//  NEXOS CONTROL — Service Worker v2.0
//  Estrategia: Cache-first para assets estáticos
//              Network-first para el GAS (API)
//  v2.0: Push notifications mejoradas con acciones
// ══════════════════════════════════════════════════════════

const CACHE_NAME  = 'nexos-control-v2.3';
const OFFLINE_URL = './nexos_control.html';

const PRECACHE_ASSETS = [
  './nexos_control.html',
  './manifest_control.json',
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

  // Configuración según tipo de alerta
  const tipo = data.tipo || 'alerta';
  const configs = {
    panico: {
      icon: './nexos-icon-192.png',
      badge: './nexos-icon-192.png',
      vibrate: [300, 100, 300, 100, 600, 100, 600],
      requireInteraction: true,
      tag: 'nexos-panico',
      actions: [
        { action: 'abrir', title: '🚨 Ver emergencia' },
        { action: 'cerrar', title: 'Descartar' }
      ]
    },
    delivery: {
      icon: './nexos-icon-192.png',
      badge: './nexos-icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      tag: 'nexos-delivery-' + (data.pat || ''),
      actions: [
        { action: 'abrir', title: '⚠️ Ver delivery' }
      ]
    },
    chat: {
      icon: './nexos-icon-192.png',
      badge: './nexos-icon-192.png',
      vibrate: [100, 50, 100],
      requireInteraction: false,
      tag: 'nexos-chat-' + (data.de || ''),
      actions: [
        { action: 'abrir', title: '💬 Responder' }
      ]
    },
    alerta: {
      icon: './nexos-icon-192.png',
      badge: './nexos-icon-192.png',
      vibrate: [200, 100, 200, 100, 400],
      requireInteraction: true,
      tag: 'nexos-alerta',
      actions: [
        { action: 'abrir', title: '📋 Ver alerta' }
      ]
    }
  };

  const cfg = configs[tipo] || configs.alerta;

  event.waitUntil(
    self.registration.showNotification(
      data.title || '🚨 NEXOS — Alerta',
      {
        body: data.body || 'Hay una alerta en el barrio',
        ...cfg,
        data: { url: data.url || './nexos_control.html', tipo }
      }
    )
  );
});

// ── NOTIFICATION CLICK ─────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'cerrar') return;

  const targetUrl = event.notification.data?.url || './nexos_control.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Si ya hay una ventana abierta con NEXOS, enfocarla
      for (const c of clients) {
        if (c.url.includes('nexos_control') && 'focus' in c) {
          c.postMessage({ type: 'NEXOS_NOTIF_CLICK', tipo: event.notification.data?.tipo });
          return c.focus();
        }
      }
      // Si no, abrir nueva ventana
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ── PUSH SUBSCRIPTION CHANGE ──────────────────────────────
// Se dispara cuando el browser rota las claves (raro pero posible)
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey
    }).then(newSub => {
      // Notificar a la app para que re-registre la suscripción
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'NEXOS_PUSH_RESUB', sub: JSON.stringify(newSub) }))
      );
    })
  );
});

// ── MESSAGE HANDLER ────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
