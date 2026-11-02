/* Demo JSON: solo recursos públicos; el progreso vive en localStorage.
   No hay sincronización de API ni peticiones a Supabase. */
const CACHE = 'camino-shell-json-v16';
const DATA = ['users', 'projects', 'challenges', 'agenda', 'settings'].map(name => `/data/${name}.json`);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['/icon.svg', '/brand/cedes-don-bosco-white.png', '/manifest.webmanifest', '/campus/map-2d.jpg', '/campus/map-3d.jpg', ...DATA]);
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) throw Error('No se pudo preparar la pantalla inicial');
    const html = await response.clone().text();
    await cache.put('/', response);
    const chunks = [...new Set([...html.matchAll(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')))];
    await cache.addAll(chunks);
    // La tipografía local debe conservarse también en la primera carga offline.
    for (const stylesheet of chunks.filter(url => url.split('?')[0].endsWith('.css'))) {
      const cssResponse = await cache.match(stylesheet);
      if (!cssResponse) continue;
      const css = await cssResponse.text();
      const assets = [...css.matchAll(/url\(["']?([^"')\s]+)["']?\)/g)].map(match => new URL(match[1], new URL(stylesheet, self.location.origin)));
      await cache.addAll([...new Set(assets.filter(url => url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')).map(url => url.href))]);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('camino-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  const allowed = url.pathname === '/' || url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/campus/') || url.pathname.startsWith('/brand/') || DATA.includes(url.pathname);
  if (!allowed || event.request.headers.has('RSC') || event.request.headers.has('Next-Router-State-Tree')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || new Response('Abre la demo una vez con conexión para preparar los archivos locales.', { status: 503 })));
});
