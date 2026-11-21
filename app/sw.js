// Çevrimdışı çalışma: uygulama dosyaları sürüm adlı bir önbellekte tutulur.
// Bir dosya ekleyip çıkarınca ASSETS listesini, sürümü değiştirince VERSION'ı güncelle (testler kontrol eder).
const VERSION = '0.3.0';
const CACHE = `spor-rutini-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/ai.js',
  './js/backup.js',
  './js/charts.js',
  './js/context.js',
  './js/db.js',
  './js/env.js',
  './js/exercises.js',
  './js/forms.js',
  './js/main.js',
  './js/program.js',
  './js/rules.js',
  './js/stats.js',
  './js/store.js',
  './js/sync-core.js',
  './js/sync.js',
  './js/targets.js',
  './js/timer.js',
  './js/ui.js',
  './js/util.js',
  './js/version.js',
  './js/views/active.js',
  './js/views/assistant.js',
  './js/views/history.js',
  './js/views/onboarding.js',
  './js/views/profile-form.js',
  './js/views/program.js',
  './js/views/progress.js',
  './js/views/settings.js',
  './js/views/sync-card.js',
  './js/views/today.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('spor-rutini-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((res) => res || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((res) => res || fetch(req)));
});
