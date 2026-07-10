// DriveStat Service Worker — офлайн підтримка
// Стратегія: network-first для HTML (щоб бачити оновлення),
// fallback на кеш якщо мережа недоступна.

const CACHE = 'drivestat-v2';
const OFFLINE_URLS = [
  './',
  './index.html'
];

// ── Install: кешуємо основні файли ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] install error:', err))
  );
});

// ── Activate: чистимо старі кеші ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', event => {
  const req = event.request;

  // Тільки GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Не чіпаємо зовнішні API (Supabase, Bolt proxy, CDN) — вони мають йти в мережу
  if (url.origin !== self.location.origin) return;

  // Навігація (відкриття сторінки) → network-first, fallback на кеш
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // свіжу відповідь кладемо в кеш
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          // мережа впала → віддаємо кеш
          caches.match('./index.html')
            .then(r => r || caches.match('./'))
        )
    );
    return;
  }

  // Інші свої ресурси → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
