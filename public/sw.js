const CACHE_NAME = 'gk-v56';
const SHELL_URLS = [
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          SHELL_URLS.map((u) =>
            cache.add(new Request(u, { cache: 'reload' })).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    // Ana HTML kabuğu her zaman ağdan (no-store) taze çekilir; yalnızca çevrimdışıysa önbelleğe düşer
    event.respondWith(
      fetch('/index.html', { cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Bir yıldızın var',
    body: '',
    url: '/',
    starId: '',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    // Ignore parse error
  }

  const targetUrl =
    payload.starId && (!payload.url || payload.url === '/')
      ? `/?star=${encodeURIComponent(payload.starId)}`
      : payload.url || '/';

  // Bildirimde yalnızca "Bir yıldızın var" yazar, başka hiçbir alt metin yazmaz
  const work = [
    self.registration.showNotification('Bir yıldızın var', {
      body: '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'bizim-gokyuzumuz-star',
      renotify: true,
      data: { url: targetUrl, starId: payload.starId || '' },
    }),
  ];

  if (typeof self.navigator !== 'undefined' && typeof self.navigator.setAppBadge === 'function') {
    work.push(Promise.resolve(self.navigator.setAppBadge()).catch(() => undefined));
  }

  event.waitUntil(Promise.all(work));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const starId = data.starId || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'notification-open', url: targetUrl, starId });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
