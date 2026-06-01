const CACHE_NAME = 'echolingo-shell-v2';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

// Audio is cached forever (cache-first), separate from the network-first shell so
// deploys still refresh the app but offline audio survives. Name must match
// AUDIO_CACHE in src/web/lib/audio-cache.ts.
const AUDIO_CACHE = 'echolingo-audio-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, AUDIO_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for shell resources. Falls back to cache when offline.
// This guarantees users see new deploys on every visit while keeping
// offline access via the last-known-good cached copy.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return;

  // IMPORTANT: never intercept sentence audio (*.mp3). These are cross-origin
  // (blob storage / azurite), so a service worker can only ever hand back an
  // *opaque* response — and a media element cannot decode an opaque response
  // served from a SW/Cache (it fails with MEDIA_ERR_SRC_NOT_SUPPORTED), which
  // silently breaks ALL playback. Let the browser load/stream media natively.
  // (Offline audio needs CORS-enabled, non-opaque responses — tracked separately.)

  const isShell =
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.pathname.endsWith('.webmanifest');

  if (!isShell) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
