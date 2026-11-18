const CACHE_NAME = 'gk-v34';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/favicon.svg',
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

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    // Kabuk: ağ ve önbellek yarışır; ağ 800 ms içinde gelmezse önbellekteki kabuk anında açılır (2. açılış beklemez)
    const network = fetch(new Request(request, { cache: 'no-store' })).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
      }
      return res;
    });
    const cached = () => caches.match('/index.html').then((r) => r || caches.match('/'));
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached()), 800));
    event.respondWith(
      Promise.race([network, timeout]).then((r) => r || network).catch(() => cached().then((r) => r || network))
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
    title: 'Bizim Gökyüzümüz',
    body: 'Gökyüzüne yeni bir yıldız düştü',
    url: '/',
    starId: '',
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

  const targetUrl =
    payload.starId && (!payload.url || payload.url === '/')
      ? `/?star=${encodeURIComponent(payload.starId)}`
      : payload.url || '/';

  const work = [
    self.registration.showNotification(payload.title, {
      body: payload.body,
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
