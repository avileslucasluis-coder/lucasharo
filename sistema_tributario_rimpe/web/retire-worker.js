// Retira instalaciones antiguas del worker de Flutter, sin conservar datos privados.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (['flutter-app-cache', 'flutter-temp-cache', 'flutter-app-manifest'].includes(name)) await caches.delete(name);
  }
  await self.registration.unregister();
})()));
