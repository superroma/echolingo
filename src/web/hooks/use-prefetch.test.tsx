// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { expectedUrls, usePrefetch } from './use-prefetch.js';
import type { Echo, SentenceStatus } from '@echolingo/shared/types';

function echoWith(statuses: SentenceStatus[], mode: 'bilingual' | 'target_only' = 'bilingual'): Echo {
  return {
    id: 'e',
    params: {
      topic: 't', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode, bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'generating_audio', createdAt: 'x', updatedAt: 'x',
    totalSentences: statuses.length, readySentences: statuses.filter((s) => s === 'ready').length,
    sentences: statuses.map((status, i) => ({
      i, gr: `g${i}`, native: `n${i}`, status,
      grUrl: status === 'ready' ? `https://e/gr/${i}.mp3` : undefined,
      nativeUrl: status === 'ready' ? `https://e/native/${i}.mp3` : undefined,
      grDurSec: 1, nativeDurSec: 1,
    })),
  };
}

describe('expectedUrls', () => {
  it('lists target+native urls for ready sentences in bilingual mode', () => {
    expect(expectedUrls(echoWith(['ready', 'pending']))).toEqual([
      'https://e/gr/0.mp3',
      'https://e/native/0.mp3',
    ]);
  });

  it('lists only target urls in target_only mode', () => {
    expect(expectedUrls(echoWith(['ready'], 'target_only'))).toEqual(['https://e/gr/0.mp3']);
  });
});

describe('usePrefetch', () => {
  it('fetches each ready url once across re-renders', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (u: string) => void calls.push(u));
    function P({ e }: { e: Echo }) {
      usePrefetch(e, fetcher);
      return null;
    }
    const { rerender } = render(<P e={echoWith(['ready', 'pending'])} />);
    await waitFor(() => expect(calls).toContain('https://e/gr/0.mp3'));
    rerender(<P e={echoWith(['ready', 'ready'])} />);
    await waitFor(() => expect(calls).toContain('https://e/gr/1.mp3'));
    expect(calls.filter((u) => u === 'https://e/gr/0.mp3')).toHaveLength(1); // not refetched
  });
});
