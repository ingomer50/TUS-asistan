const CACHE_NAME = 'tus-asistani-v22';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './badge-96.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((res) => {
            if (res && res.ok) return cache.put(url, res);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'focus';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        for (const client of clientList) {
          client.postMessage({ type: 'TUS_NOTIFICATION_ACTION', action });
        }
        if (action === 'focus' && 'focus' in clientList[0]) {
          return clientList[0].focus();
        }
        return;
      }
      if (self.clients.openWindow) {
        const targetUrl = action && action !== 'focus'
          ? `./index.html?notif_action=${encodeURIComponent(action)}`
          : './index.html';
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  const isNav = event.request.mode === 'navigate' || reqUrl.pathname.endsWith('.html') || reqUrl.pathname.endsWith('/');
  event.respondWith(
    fetch(event.request, isNav ? { cache: 'no-cache' } : undefined)
      .then((response) => {
        if (response && response.ok && reqUrl.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
