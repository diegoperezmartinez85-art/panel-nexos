// ══════════════════════════════════════════════════════════════════
//  NEXOS CONTROL — firebase-messaging-sw.js
//  Firebase Cloud Messaging Service Worker
//  Recibe notificaciones push INCLUSO con la app totalmente cerrada
//  o la pantalla apagada (background / terminated).
//
//  ⚠️  IMPORTANTE: Este archivo DEBE estar en la raíz del dominio
//      (junto a nexos_control.html) para que el scope sea correcto.
// ══════════════════════════════════════════════════════════════════

// ── 1. Importar SDK de Firebase (versión compat para SW) ──────────
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ── 2. Inicializar Firebase con tu configuración ──────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyBw6O59fZ6fPeVUf5BPxAMfw2jssVJNSE4",
  authDomain:        "nexos-panel.firebaseapp.com",
  databaseURL:       "https://nexos-panel-default-rtdb.firebaseio.com",
  projectId:         "nexos-panel",
  storageBucket:     "nexos-panel.firebasestorage.app",
  messagingSenderId: "485679155987",
  appId:             "1:485679155987:web:566522d28bbb81693f28e6"
});

// ── 3. Obtener instancia de Messaging ─────────────────────────────
const messaging = firebase.messaging();

// ══════════════════════════════════════════════════════════════════
//  NOTIFICACIONES EN BACKGROUND
//  Se dispara cuando llega un mensaje FCM y la app está en background
//  o completamente cerrada. FCM requiere que el payload tenga al menos
//  el campo "notification" (título + body) para mostrarse automáticamente.
//  Si solo trae "data" (silent push), usamos onBackgroundMessage.
// ══════════════════════════════════════════════════════════════════
messaging.onBackgroundMessage((payload) => {
  console.log('[NEXOS SW] Mensaje en background recibido:', payload);

  // Si Firebase ya mostró la notificación automáticamente (payload.notification),
  // solo personalizamos el ícono/badge. Si es data-only, la construimos nosotros.
  const notifData   = payload.notification || {};
  const customData  = payload.data         || {};

  // Determinar tipo para vibración/ícono diferenciados
  const tipo = customData.tipo || 'general'; // 'panico' | 'chat' | 'delivery' | 'general'

  const iconMap = {
    panico:   './nexos-icon-192.png',
    chat:     './nexos-icon-192.png',
    delivery: './nexos-icon-192.png',
    general:  './nexos-icon-192.png',
  };

  const vibrateMap = {
    panico:   [400, 100, 400, 100, 800],  // patrón urgente
    chat:     [200, 100, 200],
    delivery: [300, 100, 300, 100, 300],
    general:  [200, 100, 200],
  };

  const titulo = notifData.title || customData.titulo || '🔔 NEXOS CONTROL';
  const cuerpo = notifData.body  || customData.cuerpo || 'Tenés una nueva alerta';

  const opciones = {
    body:              cuerpo,
    icon:              iconMap[tipo] || './nexos-icon-192.png',
    badge:             './nexos-icon-192.png',
    vibrate:           vibrateMap[tipo] || [200, 100, 200],
    tag:               'nexos-' + tipo + '-' + (customData.tag || Date.now()),
    requireInteraction: tipo === 'panico', // panico persiste hasta que el usuario la toca
    renotify:          true,
    silent:            false,
    data: {
      tipo,
      url:    customData.url || './nexos_control.html',
      extra:  customData.extra || null,
    },
    // Botones de acción (solo en Android Chrome)
    actions: tipo === 'panico'
      ? [{ action: 'ver', title: '🚨 Ver emergencia' }]
      : tipo === 'chat'
      ? [{ action: 'ver', title: '💬 Abrir chat' }]
      : tipo === 'delivery'
      ? [{ action: 'ver', title: '📦 Ver delivery' }]
      : [{ action: 'ver', title: '👁 Ver alerta' }],
  };

  // Mostrar notificación
  return self.registration.showNotification(titulo, opciones);
});

// ══════════════════════════════════════════════════════════════════
//  CLICK EN LA NOTIFICACIÓN
//  Cuando el usuario toca la notif, abre/enfoca la app y le avisa
//  qué tipo de alerta llegó para que muestre el panel correcto.
// ══════════════════════════════════════════════════════════════════
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data  = event.notification.data || {};
  const tipo  = data.tipo  || 'general';
  const url   = data.url   || './nexos_control.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Buscar pestaña/ventana ya abierta con la app
      for (const client of clientList) {
        if (client.url.includes('nexos_control') && 'focus' in client) {
          client.focus();
          // Enviar mensaje para que el JS de la app reaccione al tipo
          client.postMessage({ type: 'NEXOS_NOTIF_CLICK', tipo });
          return;
        }
      }
      // No hay ventana abierta → abrir la app y pasar el tipo como hash
      return clients.openWindow(url + '#notif=' + tipo);
    })
  );
});

// ══════════════════════════════════════════════════════════════════
//  INSTALL / ACTIVATE — ciclo de vida básico del SW
// ══════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[NEXOS SW FCM] Instalado');
  self.skipWaiting(); // activa inmediatamente sin esperar recarga
});

self.addEventListener('activate', (event) => {
  console.log('[NEXOS SW FCM] Activado');
  event.waitUntil(clients.claim()); // toma control de todas las pestañas abiertas
});
