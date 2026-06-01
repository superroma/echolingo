const CACHE_NAME = 'echolingo-shell-v2';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

// Sentence audio cache, kept across deploys (separate from the network-first
// shell). Name must match AUDIO_CACHE in src/web/lib/audio-cache.ts.
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

  // Sentence audio (*.mp3): network-first, fall back to cache when offline.
  // The element fetches with crossorigin="anonymous" and storage sends CORS, so
  // responses are NON-opaque (readable, length-known, Range-capable) — the one
  // shape a media element (esp. iOS Safari, which demands 206 for media) accepts
  // from a service worker. Online we pass the network response straight through
  // (proven-safe path); we cache only full 200s (the prefetch's range-less GETs)
  // and, when offline, slice them into 206 responses for the element's Range
  // requests. Never serve opaque from cache — that's what broke iOS before.
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith(handleAudio(request));
    return;
  }

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

// Network-first audio with an offline, Range-aware cache fallback.
async function handleAudio(request) {
  try {
    const net = await fetch(request);
    // Cache only full 200 bodies (the prefetch issues range-less GETs). 206
    // partials and opaque responses are never stored. Key by URL so any later
    // Range request can be satisfied from the one cached full body.
    if (net && net.status === 200 && net.type !== 'opaque') {
      const copy = net.clone();
      caches.open(AUDIO_CACHE).then((cache) => cache.put(request.url, copy)).catch(() => {});
    }
    return net;
  } catch {
    return serveAudioFromCache(request);
  }
}

async function serveAudioFromCache(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request.url);
  if (!cached) return Response.error();

  const range = request.headers.get('range');
  if (!range) return cached;

  // Slice the cached full body into the 206 the media element asked for.
  const buf = await cached.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  const start = m ? parseInt(m[1], 10) : 0;
  if (!Number.isFinite(start) || start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  const end = m && m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
  const body = buf.slice(start, end + 1);
  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(body.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}
