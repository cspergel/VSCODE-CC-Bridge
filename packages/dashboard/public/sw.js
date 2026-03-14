// packages/dashboard/public/sw.js
const CACHE_NAME = 'claude-bridge-v2';
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
  // Network-first for API calls, cache-first for static assets
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws')) {
    return; // Let these pass through to network
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
