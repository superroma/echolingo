import { describe, it, expect } from 'vitest';
import { saveEcho, loadEcho, clearEcho, type KVStorage } from './offline-echo.js';
import type { Echo } from '@echolingo/shared/types';

function fakeStorage(): KVStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function echo(id: string): Echo {
  return {
    id,
    params: {
      topic: 'at the bakery', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'ready', createdAt: 'x', updatedAt: 'x', totalSentences: 1, readySentences: 1,
    sentences: [{ i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'ready', grUrl: 'u', nativeUrl: 'v', grDurSec: 1, nativeDurSec: 1 }],
  };
}

describe('offline echo store', () => {
  it('round-trips an echo by id', () => {
    const s = fakeStorage();
    saveEcho(echo('abc'), s);
    expect(loadEcho('abc', s)?.params.topic).toBe('at the bakery');
  });

  it('returns null for an unknown id', () => {
    expect(loadEcho('missing', fakeStorage())).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    const s = fakeStorage();
    s.setItem('echo:offline:bad', '{not json');
    expect(loadEcho('bad', s)).toBeNull();
  });

  it('clears a saved echo', () => {
    const s = fakeStorage();
    saveEcho(echo('abc'), s);
    clearEcho('abc', s);
    expect(loadEcho('abc', s)).toBeNull();
  });
});
