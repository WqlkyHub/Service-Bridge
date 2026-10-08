const CACHE_NAME = 'manette-dor-v2';
const FILES_TO_CACHE = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord, cache en secours. L'API et le flux temps réel ne passent jamais par le cache :
// mettre un flux SSE en cache le ferait grossir sans fin et servirait un état périmé.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/api/state') || url.pathname.endsWith('/api/events') || url.pathname.endsWith('/api/op')) return;

  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
