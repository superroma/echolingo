import { describe, it, expect } from 'vitest';
import { clearEchoAudio, AUDIO_CACHE } from './audio-cache.js';

// Minimal in-memory CacheStorage/Cache double keyed by request url.
function fakeCaches(urls: string[]): CacheStorage {
  const entries = new Map<string, unknown>(urls.map((u) => [u, {}]));
  const cache = {
    keys: async () => [...entries.keys()].map((u) => ({ url: u }) as Request),
    delete: async (req: Request) => entries.delete((req as { url: string }).url),
    match: async () => undefined,
    put: async () => {},
    add: async () => {},
    addAll: async () => {},
    matchAll: async () => [],
  } as unknown as Cache;
  return {
    open: async (name: string) => {
      if (name !== AUDIO_CACHE) throw new Error(`unexpected cache ${name}`);
      return cache;
    },
  } as unknown as CacheStorage;
}

describe('clearEchoAudio', () => {
  it('deletes only the target echo\'s audio, by id path segment', async () => {
    const caches = fakeCaches([
      'https://x/abc/gr/0.mp3',
      'https://x/abc/native/0.mp3',
      'https://x/zzz/gr/0.mp3',
    ]);
    await clearEchoAudio('abc', caches);
    const cache = await caches.open(AUDIO_CACHE);
    const left = (await cache.keys()).map((r) => r.url);
    expect(left).toEqual(['https://x/zzz/gr/0.mp3']);
  });
});
