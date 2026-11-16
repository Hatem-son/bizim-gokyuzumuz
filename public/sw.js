const CACHE_NAME = 'gokyuzu-shell-v3';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-64.png',
  '/fonts/great-vibes-latin.woff2',
  '/fonts/great-vibes-latin-ext.woff2',
  '/fonts/cormorant-garamond-latin.woff2',
  '/fonts/cormorant-garamond-latin-ext.woff2',
  '/fonts/cormorant-garamond-italic-latin.woff2',
  '/fonts/cormorant-garamond-italic-latin-ext.woff2',
  '/fonts/nunito-latin.woff2',
  '/fonts/nunito-latin-ext.woff2',
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
  // Never cache Supabase API, Realtime, Storage, or external font/API requests aggressively as shell
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network first bypassing HTTP cache with offline shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache first, network fallback & update
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

// Web Push handler (iOS 16.4+ standalone PWA & modern browsers)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Bizim Gökyüzümüz',
    body: 'Gökyüzüne yeni bir yıldız düştü',
    url: '/',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'bizim-gokyuzumuz-star',
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

