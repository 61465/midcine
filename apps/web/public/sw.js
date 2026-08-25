/* midcine service worker — v1
 * App-shell + runtime caching. DICOM/report endpoints are never cached
 * (they must always hit the bridge for freshness + PHI).
 */
const APP_CACHE = 'midcine-shell-v1';
const SHELL = ['/', '/room', '/referrer', '/analytics', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(SHELL).catch(() => null)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API + DICOM + report endpoints
  if (
    url.pathname.startsWith('/api/mcp/') ||
    url.pathname.startsWith('/api/waitlist')
  ) {
    return;
  }
  // Cache-first for static shell + Next chunks
  if (
    event.request.method === 'GET' &&
    (SHELL.includes(url.pathname) ||
      url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/'))
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((r) => {
            const clone = r.clone();
            if (r.ok) caches.open(APP_CACHE).then((c) => c.put(event.request, clone));
            return r;
          }),
      ),
    );
  }
});
