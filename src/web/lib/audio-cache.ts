// Must match the cache name used by the service worker in public/sw.js.
export const AUDIO_CACHE = 'echolingo-audio-v1';

/**
 * Remove one echo's cached audio. Audio URLs contain the echo id as a path
 * segment (`.../{id}/{lang}/{idx}.mp3`), so we match on `/{id}/`. Used by the
 * reload/repair control to recover from a stale or corrupt cache.
 */
export async function clearEchoAudio(
  id: string,
  cacheStorage: CacheStorage = caches,
): Promise<void> {
  const cache = await cacheStorage.open(AUDIO_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys.filter((req) => req.url.includes(`/${id}/`)).map((req) => cache.delete(req)),
  );
}

/** Evict a single cached audio URL — used to recover from a corrupt chunk. */
export async function evictAudioUrl(url: string, cacheStorage: CacheStorage = caches): Promise<void> {
  try {
    const cache = await cacheStorage.open(AUDIO_CACHE);
    await cache.delete(url);
  } catch {
    // cache unavailable — the network reload below still recovers
  }
}

/** Ask the browser to keep our caches across eviction. Best-effort. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}
