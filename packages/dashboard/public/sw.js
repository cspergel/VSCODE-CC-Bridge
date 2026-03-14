// packages/dashboard/public/sw.js
const CACHE_NAME = 'claude-bridge-v6';
const STATIC_ASSETS = [
  '/',
  '/css/variables.css',
  '/css/layout.css',
  '/css/terminal.css',
  '/css/panels.css',
  '/css/palette.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/terminal.js',
  '/js/input-bar.js',
  '/js/panels.js',
  '/js/palette.js',
  '/js/platform.js',
  '/js/fab.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Skip non-GET and API/WS requests
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws')) return;

  // Network-first for HTML and JS/CSS (so updates are picked up immediately)
  // Falls back to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Update cache with fresh response
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
