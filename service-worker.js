const CACHE_NAME = 'service-bridge-v1';
const FILES_TO_CACHE = [
  './index.html',
  './manifest.json'
];

// Installation : mise en cache des fichiers
self.addEventListener('install', event => {
  self.skipWaiting(); // Active immédiatement sans attendre la fermeture de l'onglet
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

// Activation : supprime les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // Prend le contrôle immédiatement
  );
});

// Fetch : réseau en priorité, cache en fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Met à jour le cache avec la version fraîche
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request)) // Fallback cache si hors ligne
  );
});
