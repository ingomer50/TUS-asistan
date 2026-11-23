const CACHE_NAME = 'tus-asistani-v26-aod'; // index.html içindeki CACHE_VERSION ile aynı olmalı
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './badge-96.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' }).then((res) => {
              if (res && res.status === 200) return cache.put(url, res);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'focus';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const targetClient = clientList.find((c) => c.focused) || clientList[0];
        targetClient.postMessage({ type: 'TUS_NOTIFICATION_ACTION', action });
        // Not: Android'de aksiyon butonuna basınca da uygulamayı öne getir
        if ('focus' in targetClient) return targetClient.focus().catch(() => {});
        return;
      }
      if (self.clients.openWindow) {
        const targetUrl = action !== 'focus'
          ? `./index.html?notif_action=${encodeURIComponent(action)}`
          : './index.html';
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

function fetchWithTimeout(request, options, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request, options).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const reqUrl = new URL(req.url);

  // Farklı origin ve Range (ses/video) isteklerine karışma
  if (reqUrl.origin !== self.location.origin || req.headers.has('range')) return;

  const isNav = req.mode === 'navigate' || reqUrl.pathname.endsWith('.html') || reqUrl.pathname.endsWith('/');

  event.respondWith(
    fetchWithTimeout(req, isNav ? { cache: 'no-cache' } : undefined, NETWORK_TIMEOUT_MS)
      .then((response) => {
        // Sadece tam (200) cevapları önbelleğe yaz; 206 cache.put'ta hata verir
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
          );
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          if (isNav) return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
