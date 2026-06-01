'use client';

import { useEffect, useRef, useState } from 'react';
import type { Echo } from '@echolingo/shared/types';

/**
 * Every audio URL worth caching for an echo: each ready sentence's target audio,
 * plus its native audio in bilingual mode.
 */
export function expectedUrls(echo: Echo): string[] {
  const bilingual = echo.params.mode === 'bilingual';
  const out: string[] = [];
  for (const s of echo.sentences) {
    if (s.status !== 'ready') continue;
    if (s.grUrl) out.push(s.grUrl);
    if (bilingual && s.nativeUrl) out.push(s.nativeUrl);
  }
  return out;
}

async function runWithCap(items: string[], cap: number, fn: (u: string) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

// Module-level so the default keeps a stable identity across renders (the effect
// depends on `fetcher`). no-cors warms the service-worker audio cache; the opaque
// response is fine for <audio> playback.
const defaultFetcher = (url: string): Promise<unknown> => fetch(url, { mode: 'no-cors' });

/**
 * Eagerly cache every ready sentence's audio (all of it, not a sliding window) so
 * the whole echo becomes offline-ready as fast as it generates and playback never
 * waits on download. `allCached` is true once every expected URL has been fetched.
 */
export function usePrefetch(
  echo: Echo | null,
  fetcher: (url: string) => Promise<unknown> = defaultFetcher,
): { allCached: boolean } {
  const fetched = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!echo) return;
    const todo = expectedUrls(echo).filter((u) => !fetched.current.has(u));
    if (todo.length === 0) return;
    let cancelled = false;
    // Mark optimistically so the 2s re-polls don't re-enqueue in-flight URLs;
    // unmark on failure so a later poll retries.
    todo.forEach((u) => fetched.current.add(u));
    void runWithCap(todo, 6, async (u) => {
      try {
        await fetcher(u);
      } catch {
        fetched.current.delete(u);
      }
    }).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [echo, fetcher]);

  const want = echo ? expectedUrls(echo) : [];
  const allCached = want.length > 0 && want.every((u) => fetched.current.has(u));
  return { allCached };
}
