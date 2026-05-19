// ══════════════════════════════════════════════════════════════════════════
//  NEXOS CONTROL — firebase-messaging-sw.js  v2.0
//  Firebase Cloud Messaging Service Worker
//
//  SCOPE: este archivo DEBE estar en la raíz del dominio (junto a nexos_control.html)
//         para que el scope sea '/' y FCM lo encuentre automáticamente.
//
//  FUNCIONES:
//  • Recibe notificaciones push FCM con la app CERRADA o pantalla APAGADA.
//  • onBackgroundMessage → muestra la notificación con el ícono y vibración
//    adecuados según el tipo (panico / chat / delivery / incidente / general).
//  • notificationclick → abre/enfoca la app y le avisa el tipo de alerta.
//  • install / activate → lifecycle básico (skipWaiting + claim).
// ══════════════════════════════════════════════════════════════════════════

// ── 1. Importar SDK de Firebase (versión compat, requerida en SW) ─────────
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ── 2. Inicializar Firebase con la misma config del proyecto ─────────────
firebase.initializeApp({
  apiKey:            'AIzaSyBw6O59fZ6fPeVUf5BPxAMfw2jssVJNSE4',
  authDomain:        'nexos-panel.firebaseapp.com',
  databaseURL:       'https://nexos-panel-default-rtdb.firebaseio.com',
  projectId:         'nexos-panel',
  storageBucket:     'nexos-panel.firebasestorage.app',
  messagingSenderId: '485679155987',
  appId:             '1:485679155987:web:566522d28bbb81693f28e6'
});

// ── 3. Obtener instancia de Messaging ────────────────────────────────────
const messaging = firebase.messaging();

// ── 4. Mapas de configuración por tipo de alerta ─────────────────────────
const ICON    = './nexos-icon-192.png';
const BADGE   = './nexos-icon-192.png';
const APP_URL = './nexos_control.html';

const CONFIG = {
  panico: {
    vibrate:           [400, 100, 400, 100, 800, 100, 800],
    requireInteraction: true,
    actions: [{ action: 'ver', title: '🚨 Ver emergencia' }]
  },
  incidente: {
    vibrate:           [300, 100, 300, 100, 600],
    requireInteraction: true,
    actions: [{ action: 'ver', title: '🔴 Ver incidente' }]
  },
  chat: {
    vibrate:           [200, 100, 200],
    requireInteraction: false,
    actions: [{ action: 'ver', title: '💬 Abrir chat' }]
  },
  delivery: {
    vibrate:           [300, 100, 300, 100, 300],
    requireInteraction: false,
    actions: [{ action: 'ver', title: '📦 Ver delivery' }]
  },
  general: {
    vibrate:           [200, 100, 200],
    requireInteraction: false,
    actions: [{ action: 'ver', title: '👁 Ver alerta' }]
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  onBackgroundMessage — se dispara cuando la app está CERRADA o en BG
//  FCM llama a esta función solo si el payload tiene campo "data" o si
//  el servidor envió una notification-only message sin foreground handler.
// ══════════════════════════════════════════════════════════════════════════
messaging.onBackgroundMessage((payload) => {
  console.log('[NEXOS FCM SW] Mensaje background:', payload);

  const notifData  = payload.notification || {};
  const customData = payload.data         || {};

  const tipo   = customData.tipo || 'general';
  const titulo = notifData.title  || customData.titulo || '🔔 NEXOS CONTROL';
  const cuerpo = notifData.body   || customData.cuerpo || 'Tenés una nueva alerta';
  const tag    = 'nexos-' + tipo + '-' + (customData.tag || Date.now());
  const cfg    = CONFIG[tipo] || CONFIG.general;

  return self.registration.showNotification(titulo, {
    body:               cuerpo,
    icon:               ICON,
    badge:              BADGE,
    vibrate:            cfg.vibrate,
    tag,
    requireInteraction: cfg.requireInteraction,
    renotify:           true,
    silent:             false,
    actions:            cfg.actions,
    data: {
      tipo,
      url:   customData.url   || APP_URL,
      extra: customData.extra || null
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  notificationclick — el usuario toca la notificación
// ══════════════════════════════════════════════════════════════════════════
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Si el usuario tocó "Cerrar" o una acción sin acción definida, no hacer nada
  if (event.action === 'cerrar') return;

  const data = event.notification.data || {};
  const tipo = data.tipo || 'general';
  const url  = data.url  || APP_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Buscar pestaña ya abierta con la app
      for (const client of clientList) {
        if (client.url.includes('nexos_control') && 'focus' in client) {
          client.focus();
          // Avisar al JS de la app el tipo de alerta para que navegue al panel correcto
          client.postMessage({ type: 'NEXOS_NOTIF_CLICK', tipo });
          return;
        }
      }
      // No hay ventana abierta → abrir la app y pasar el tipo como hash
      return clients.openWindow(url + '#notif=' + tipo);
    })
  );
});

// ══════════════════════════════════════════════════════════════════════════
//  pushsubscriptionchange — el browser rotó las claves (raro pero posible)
// ══════════════════════════════════════════════════════════════════════════
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[NEXOS FCM SW] pushsubscriptionchange — re-solicitando token');
  // Notificar a la app para que llame pushSuscribir() de nuevo
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList =>
      clientList.forEach(c => c.postMessage({ type: 'NEXOS_PUSH_RESUB' }))
    )
  );
});

// ══════════════════════════════════════════════════════════════════════════
//  Ciclo de vida del SW
// ══════════════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[NEXOS FCM SW] Instalado v2.0');
  self.skipWaiting(); // activa inmediatamente sin esperar recarga
});

self.addEventListener('activate', (event) => {
  console.log('[NEXOS FCM SW] Activado v2.0');
  event.waitUntil(self.clients.claim()); // toma control de todas las pestañas abiertas
});
