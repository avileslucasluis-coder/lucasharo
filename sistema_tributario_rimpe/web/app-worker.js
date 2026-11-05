// Sin caché de API, tokens, páginas privadas ni documentos. La app funciona en línea.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (['flutter-app-cache', 'flutter-temp-cache', 'flutter-app-manifest'].includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sin conexión</title><body><h1>Sistema Tributario</h1><p>Necesitas conexión a Internet para consultar o guardar información. Revisa tu conexión y vuelve a abrir la aplicación.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )));
});
