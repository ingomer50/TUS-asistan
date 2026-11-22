const CACHE_NAME = 'tus-asistan-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './lockscreen-media.js',
  './badge-96.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_STATUS_NOTIFICATION') {
    const { title, body } = event.data;
    self.registration.showNotification(title || 'TUS Çalışma Asistanı', {
      body: body || 'Kilit ekranı kontrolleri aktif',
      icon: './icon-192.png',
      badge: './badge-96.png',
      tag: 'tus-lockscreen-status',
      renotify: false,
      silent: true,
      requireInteraction: true
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
